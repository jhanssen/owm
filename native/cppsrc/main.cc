#include "owm.h"
#include <thread>
#include <mutex>
#include <condition_variable>
#include <fcntl.h>
#include <unistd.h>
#include <sys/epoll.h>

#define EINTRWRAP(x) ({                                                 \
            decltype(x) eintr_wrapper_result;                           \
            do {                                                        \
                eintr_wrapper_result = (x);                             \
            } while (eintr_wrapper_result == -1 && errno == EINTR);     \
            eintr_wrapper_result;                                       \
        })

struct Data
{
    bool started { false };
    std::thread thread;
    std::mutex mutex;
    std::condition_variable cond;
    owm::Stack<owm::Request> requestPool;
    std::vector<owm::Request*> requests;
    int wakeup[2];
    Napi::ThreadSafeFunction tsfn;
};

static Data data;

Napi::Value Start(const Napi::CallbackInfo& info)
{
    auto env = info.Env();

    std::shared_ptr<Napi::AsyncContext> ctx = std::make_shared<Napi::AsyncContext>(env, "ThreadSafePromise");
    std::shared_ptr<owm::ThreadSafePromise> deferred = std::make_shared<owm::ThreadSafePromise>(env, ctx);
    if (data.started) {
        deferred->Reject("owm already started");
        return deferred->Promise();
    }
    if (!info[0].IsFunction()) {
        throw Napi::TypeError::New(env, "First argument needs to be a callback function");
    }

    std::string display;
    if (info[1].IsString()) {
        display = info[1].As<Napi::String>();
    }

    data.started = true;
    data.tsfn = Napi::ThreadSafeFunction::New(env,
                                              info[0].As<Napi::Function>(),
                                              "owm callback",
                                              0,              // unlimited queue
                                              1,              // number of threads using this
                                              [](Napi::Env) { // finalizer
                                                  data.thread.join();
                                              });

    int ret = pipe2(data.wakeup, O_NONBLOCK);
    if (ret == -1) {
        // so, so bad
        deferred->Reject("unable to pipe2()");
        return deferred->Promise();
    }

    auto promise = deferred->Promise();

    const int wakeupfd = data.wakeup[0];
    data.thread = std::thread([wakeupfd, display, deferred{std::move(deferred)}, loop{uv_default_loop()}]() mutable {
        int epoll = epoll_create1(0);

        epoll_event event;

        event.events = EPOLLIN;
        event.data.fd = wakeupfd;
        epoll_ctl(epoll, EPOLL_CTL_ADD, wakeupfd, &event);

        std::shared_ptr<owm::WM> wm = std::make_shared<owm::WM>();

        auto callback = [wm](Napi::Env env, Napi::Function js, owm::Response* resp) {
            //js.Call({ Napi::Number::New(env, *value) });
            wm->responsePool.release(resp);
        };

        int defaultScreen;
        wm->conn = xcb_connect(display.empty() ? nullptr : display.c_str(), &defaultScreen);
        if (!wm->conn) { // boo
            deferred->Reject("Unable to xcb_connect()");
            return;
        }

        const int xcbfd = xcb_get_file_descriptor(wm->conn);

        event.events = EPOLLIN;
        event.data.fd = xcbfd;
        epoll_ctl(epoll, EPOLL_CTL_ADD, xcbfd, &event);

        const xcb_setup_t* setup = xcb_get_setup(wm->conn);
        const int screenCount = xcb_setup_roots_length(setup);
        wm->screens.reserve(screenCount);
        xcb_screen_iterator_t it = xcb_setup_roots_iterator(setup);
        for (int i = 0; i < screenCount; ++i) {
            wm->screens.push_back({ it.data, xcb_aux_get_visualtype(wm->conn, i, it.data->root_visual), { 0, 0, it.data->width_in_pixels, it.data->height_in_pixels } });
            xcb_screen_next(&it);
        }

        std::unique_ptr<xcb_generic_error_t> err;

        {
            const uint32_t values[] = { XCB_EVENT_MASK_SUBSTRUCTURE_REDIRECT };
            xcb_void_cookie_t cookie = xcb_change_window_attributes_checked(wm->conn, wm->screens[defaultScreen].screen->root, XCB_CW_EVENT_MASK, values);
            err.reset(xcb_request_check(wm->conn, cookie));
            if (err) { // another wm already running
                deferred->Reject("Another wm is already running?");
                return;
            }
        }

        wm->ewmh = new xcb_ewmh_connection_t;
        xcb_intern_atom_cookie_t* ewmhCookie = xcb_ewmh_init_atoms(wm->conn, wm->ewmh);
        if (!ewmhCookie) {
            deferred->Reject("Unable to init ewmh atoms");
            return;
        }
        if (!xcb_ewmh_init_atoms_replies(wm->ewmh, ewmhCookie, 0)) {
            deferred->Reject("Unable to init ewmh atoms");
            return;
        }

        std::shared_ptr<std::vector<owm::Window> > windows = std::make_shared<std::vector<owm::Window> >();
        auto queryWindows = [&windows](xcb_connection_t* conn, xcb_window_t root) {

            std::vector<xcb_get_window_attributes_cookie_t> attribCookies;
            std::vector<xcb_get_geometry_cookie_t> geomCookies;

            xcb_query_tree_cookie_t cookie = xcb_query_tree_unchecked(conn, root);
            xcb_query_tree_reply_t *tree = xcb_query_tree_reply(conn, cookie, nullptr);
            xcb_window_t *wins = xcb_query_tree_children(tree);

            attribCookies.reserve(tree->children_len);
            geomCookies.reserve(tree->children_len);

            for (unsigned int i = 0; i < tree->children_len; ++i) {
                attribCookies.push_back(xcb_get_window_attributes_unchecked(conn, wins[i]));
                geomCookies.push_back(xcb_get_geometry_unchecked(conn, wins[i]));
            }

            for (unsigned int i = 0; i < tree->children_len; ++i) {
                xcb_get_window_attributes_reply_t* attrib = xcb_get_window_attributes_reply(conn, attribCookies[i], nullptr);
                if (attrib->map_state == XCB_MAP_STATE_UNMAPPED) {
                    xcb_discard_reply(conn, geomCookies[i].sequence);
                    free(attrib);
                    continue;
                }
                xcb_get_geometry_reply_t* geom = xcb_get_geometry_reply(conn, geomCookies[i], nullptr);
                if (geom->width < 1 || geom->height < 1) {
                    free(attrib);
                    free(geom);
                    continue;
                }
                windows->emplace_back(
                    wins[i],
                    attrib->bit_gravity,
                    attrib->win_gravity,
                    attrib->map_state,
                    attrib->override_redirect,
                    attrib->all_event_masks,
                    attrib->your_event_mask,
                    attrib->do_not_propagate_mask,
                    geom->root,
                    geom->x,
                    geom->y,
                    geom->width,
                    geom->height,
                    geom->border_width);
                free(attrib);
                free(geom);
            }
            free(tree);
        };

        {
            const uint32_t values[] = { XCB_EVENT_MASK_SUBSTRUCTURE_REDIRECT
                                        | XCB_EVENT_MASK_SUBSTRUCTURE_NOTIFY
                                        | XCB_EVENT_MASK_ENTER_WINDOW
                                        | XCB_EVENT_MASK_LEAVE_WINDOW
                                        | XCB_EVENT_MASK_STRUCTURE_NOTIFY
                                        | XCB_EVENT_MASK_BUTTON_PRESS
                                        | XCB_EVENT_MASK_BUTTON_RELEASE
                                        | XCB_EVENT_MASK_FOCUS_CHANGE
                                        | XCB_EVENT_MASK_PROPERTY_CHANGE };
            for (auto s : wm->screens) {
                xcb_void_cookie_t cookie = xcb_change_window_attributes_checked(wm->conn, s.screen->root, XCB_CW_EVENT_MASK, values);
                queryWindows(wm->conn, s.screen->root);
                err.reset(xcb_request_check(wm->conn, cookie));
                if (err) {
                    deferred->Reject("Unable to change attributes on one of the root windows");
                    return;
                }
                xcb_ewmh_set_wm_pid(wm->ewmh, s.screen->root, getpid());
            }
        }

        deferred->Resolve([wm](napi_env env) -> Napi::Value {
            Napi::Object obj = Napi::Object::New(env);
            obj.Set("xcb", owm::makeXcb(env, wm));
            obj.Set("wm", owm::Wrap<std::shared_ptr<owm::WM> >::wrap(env, wm));
            return obj;
        });
        deferred.reset();

        std::vector<owm::Screen> screens = wm->screens;
        auto screensCallback = [screens{std::move(screens)}](Napi::Env env, Napi::Function js) {
            Napi::Object obj = Napi::Object::New(env);
            obj.Set("type", "screens");

            Napi::Array arr = Napi::Array::New(env, screens.size());
            for (size_t i = 0; i < screens.size(); ++i) {
                const auto& screen = screens[i];
                Napi::Object s = Napi::Object::New(env);
                Napi::Object g = Napi::Object::New(env);
                g.Set("x", screen.rect.x);
                g.Set("y", screen.rect.y);
                g.Set("width", screen.rect.w);
                g.Set("height", screen.rect.h);
                s.Set("geometry", g);
                arr.Set(i, s);
            }

            obj.Set("screens", arr);

            napi_value nvalue = obj;
            js.Call(1, &nvalue);
        };

        data.tsfn.BlockingCall(screensCallback);

        auto windowsCallback = [windows{std::move(windows)}](Napi::Env env, Napi::Function js) mutable {
            Napi::Object obj = Napi::Object::New(env);
            obj.Set("type", "windows");
            Napi::Array arr = Napi::Array::New(env, windows->size());
            for (size_t i = 0; i < windows->size(); ++i) {
                const auto& nwin = (*windows)[i];
                Napi::Object win = Napi::Object::New(env);

                win.Set("window", nwin.window);
                win.Set("bit_gravity", nwin.bit_gravity);
                win.Set("win_gravity", nwin.win_gravity);
                win.Set("map_state", nwin.map_state);
                win.Set("override_redirect", nwin.override_redirect);
                win.Set("all_event_masks", nwin.all_event_masks);
                win.Set("your_event_mask", nwin.your_event_mask);
                win.Set("do_not_propagate_mask", nwin.do_not_propagate_mask);
                win.Set("root", nwin.root);
                win.Set("x", nwin.x);
                win.Set("y", nwin.y);
                win.Set("width", nwin.width);
                win.Set("height", nwin.height);
                win.Set("border_width", nwin.border_width);

                arr.Set(i, win);
            }
            obj.Set("windows", arr);

            napi_value nvalue = obj;
            js.Call(1, &nvalue);

            windows.reset();
        };

        data.tsfn.BlockingCall(windowsCallback);

        enum { MaxEvents = 5 };
        epoll_event events[MaxEvents];

        for (;;) {
            const int count = epoll_wait(epoll, events, MaxEvents, -1);
            if (count <= 0) {
                // bad stuff
                if (errno != EINTR)
                    return;
            }

            for (int i = 0; i < count; ++i) {
                if (events[i].data.fd == xcbfd) {
                    // handle xcb event
                    for (;;) {
                        if (xcb_connection_has_error(wm->conn)) {
                            // more badness
                            printf("bad conn\n");
                            return;
                        }
                        xcb_generic_event_t *event = xcb_poll_for_event(wm->conn);
                        if (!event)
                            break;
                        owm::handleXcb(wm, data.tsfn, event);
                    }
                } else if (events[i].data.fd == wakeupfd) {
                    // wakeup!

                    // flush the pipe
                    for (;;) {
                        char c;
                        const int r = ::read(wakeupfd, &c, 1);
                        if (r == -1) {
                            if (errno == EAGAIN)
                                break;
                            // bad error
                            printf("bad read\n");
                            return;
                        }
                    }

                    std::unique_lock locker(data.mutex);
                    if (!data.started)
                        return;
                    if (!data.requests.empty()) {
                        auto requests = std::move(data.requests);
                        locker.unlock();
                        for (auto req : requests) {
                            auto resp = wm->responsePool.acquire();
                            resp->type = owm::Response::NewWindow;
                            auto status = data.tsfn.BlockingCall(resp, callback);
                            if (status != napi_ok) {
                                // error?
                            }
                            data.requestPool.release(req);
                        }
                        locker.lock();
                    }
                    data.cond.wait(locker);
                }
            }
        }

        data.tsfn.Release();
    });

    auto cmd = data.requestPool.acquire();
    cmd->type = owm::Request::Start;

    std::unique_lock locker(data.mutex);
    data.requests.push_back(cmd);
    locker.unlock();
    data.cond.notify_one();

    return promise;
}

void Stop(const Napi::CallbackInfo& info)
{
    auto env = info.Env();

    {
        std::unique_lock locker(data.mutex);
        if (!data.started)
            throw Napi::TypeError::New(env, "Not started");
        data.started = false;
    }

    char c = 'q';
    EINTRWRAP(::write(data.wakeup[1], &c, 1));

    data.thread.join();
    EINTRWRAP(::close(data.wakeup[0]));
    EINTRWRAP(::close(data.wakeup[1]));
}

Napi::Object Setup(Napi::Env env, Napi::Object exports)
{
    exports.Set("start", Napi::Function::New(env, Start));
    exports.Set("stop", Napi::Function::New(env, Stop));
    return exports;
}

NODE_API_MODULE(owm_native, Setup)
