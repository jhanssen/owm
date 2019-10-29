#include "owm.h"
#include <thread>
#include <mutex>
#include <condition_variable>
#include <fcntl.h>
#include <unistd.h>
#include <sys/epoll.h>

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

    Napi::Promise::Deferred* deferred = new Napi::Promise::Deferred(env);
    if (data.started) {
        deferred->Reject(Napi::String::New(env, "owm already started"));
        auto promise = deferred->Promise();
        delete deferred;
        return promise;
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
        deferred->Reject(Napi::String::New(env, "unable to pipe2()"));
        auto promise = deferred->Promise();
        delete deferred;
        return promise;
    }

    auto promise = deferred->Promise();

    const int wakeupfd = data.wakeup[0];
    data.thread = std::thread([wakeupfd, display, deferred, loop{uv_default_loop()}](){
        owm::RunLater<std::function<void(const std::string&)> > runLater(loop);

        int epoll = epoll_create1(0);

        epoll_event event;

        event.events = EPOLLIN;
        event.data.fd = wakeupfd;
        epoll_ctl(epoll, EPOLL_CTL_ADD, 0, &event);

        owm::WM wm;

        auto callback = [&wm](Napi::Env env, Napi::Function js, owm::Response* resp) {
            //js.Call({ Napi::Number::New(env, *value) });
            wm.responsePool.release(resp);
        };

        auto reject = [deferred, &runLater](const char* r) {
            runLater.call([deferred](const std::string& reason) {
                //deferred->Reject(env, Napi::String::New(env, "owm already started"));
            }, r);
        };

        int defaultScreen;
        wm.conn = xcb_connect(display.empty() ? nullptr : display.c_str(), &defaultScreen);
        if (!wm.conn) { // boo
            return;
        }

        const int xcbfd = xcb_get_file_descriptor(wm.conn);

        event.events = EPOLLIN;
        event.data.fd = xcbfd;
        epoll_ctl(epoll, EPOLL_CTL_ADD, 0, &event);

        const xcb_setup_t* setup = xcb_get_setup(wm.conn);
        const int screenCount = xcb_setup_roots_length(setup);
        wm.screens.reserve(screenCount);
        xcb_screen_iterator_t it = xcb_setup_roots_iterator(setup);
        for (int i = 0; i < screenCount; ++i) {
            wm.screens.push_back({ it.data, xcb_aux_get_visualtype(wm.conn, i, it.data->root_visual), {} });
            xcb_screen_next(&it);
        }

        std::unique_ptr<xcb_generic_error_t> err;

        {
            const uint32_t values[] = { XCB_EVENT_MASK_SUBSTRUCTURE_REDIRECT };
            xcb_void_cookie_t cookie = xcb_change_window_attributes_checked(wm.conn, wm.screens[defaultScreen].screen->root, XCB_CW_EVENT_MASK, values);
            err.reset(xcb_request_check(wm.conn, cookie));
            if (err) { // another wm already running
                return;
            }
        }

        wm.ewmh = new xcb_ewmh_connection_t;
        xcb_intern_atom_cookie_t* ewmhCookie = xcb_ewmh_init_atoms(wm.conn, wm.ewmh);
        if (!ewmhCookie) {
            return;
        }
        if (!xcb_ewmh_init_atoms_replies(wm.ewmh, ewmhCookie, 0)) {
            return;
        }

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
            for (auto s : wm.screens) {
                xcb_void_cookie_t cookie = xcb_change_window_attributes_checked(wm.conn, s.screen->root, XCB_CW_EVENT_MASK, values);
                err.reset(xcb_request_check(wm.conn, cookie));
                if (err) {
                    return;
                }
                xcb_ewmh_set_wm_pid(wm.ewmh, s.screen->root, getpid());
            }
        }

        enum { MaxEvents = 5 };
        epoll_event events[MaxEvents];

        for (;;) {
            const int count = epoll_wait(epoll, events, MaxEvents, -1);
            if (count <= 0) {
                // bad stuff
                return;
            }

            for (int i = 0; i < count; ++i) {
                if (events[i].data.fd == xcbfd) {
                    // handle xcb event
                    for (;;) {
                        if (xcb_connection_has_error(wm.conn)) {
                            // more badness
                            return;
                        }
                        xcb_generic_event_t *event = xcb_poll_for_event(wm.conn);
                        if (!event)
                            break;
                        owm::handleXcb(wm, data.tsfn, event);
                    }
                } else if (events[i].data.fd == wakeupfd) {
                    // wakeup!
                    std::unique_lock locker(data.mutex);
                    if (!data.started)
                        return;
                    if (!data.requests.empty()) {
                        auto requests = std::move(data.requests);
                        locker.unlock();
                        for (auto req : requests) {
                            auto resp = wm.responsePool.acquire();
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
}

Napi::Object Setup(Napi::Env env, Napi::Object exports)
{
    exports.Set("start", Napi::Function::New(env, Start));
    exports.Set("stop", Napi::Function::New(env, Stop));
    return exports;
}

NODE_API_MODULE(owm_native, Setup)
