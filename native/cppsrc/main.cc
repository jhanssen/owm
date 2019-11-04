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

static inline void initAtoms(std::shared_ptr<owm::WM>& wm)
{
    auto& atoms = wm->atoms;

    atoms["NONE"] = XCB_ATOM_NONE;
    atoms["ANY"] = XCB_ATOM_ANY;
    atoms["PRIMARY"] = XCB_ATOM_PRIMARY;
    atoms["SECONDARY"] = XCB_ATOM_SECONDARY;
    atoms["ARC"] = XCB_ATOM_ARC;
    atoms["ATOM"] = XCB_ATOM_ATOM;
    atoms["BITMAP"] = XCB_ATOM_BITMAP;
    atoms["CARDINAL"] = XCB_ATOM_CARDINAL;
    atoms["COLORMAP"] = XCB_ATOM_COLORMAP;
    atoms["CURSOR"] = XCB_ATOM_CURSOR;
    atoms["CUT_BUFFER0"] = XCB_ATOM_CUT_BUFFER0;
    atoms["CUT_BUFFER1"] = XCB_ATOM_CUT_BUFFER1;
    atoms["CUT_BUFFER2"] = XCB_ATOM_CUT_BUFFER2;
    atoms["CUT_BUFFER3"] = XCB_ATOM_CUT_BUFFER3;
    atoms["CUT_BUFFER4"] = XCB_ATOM_CUT_BUFFER4;
    atoms["CUT_BUFFER5"] = XCB_ATOM_CUT_BUFFER5;
    atoms["CUT_BUFFER6"] = XCB_ATOM_CUT_BUFFER6;
    atoms["CUT_BUFFER7"] = XCB_ATOM_CUT_BUFFER7;
    atoms["DRAWABLE"] = XCB_ATOM_DRAWABLE;
    atoms["FONT"] = XCB_ATOM_FONT;
    atoms["INTEGER"] = XCB_ATOM_INTEGER;
    atoms["PIXMAP"] = XCB_ATOM_PIXMAP;
    atoms["POINT"] = XCB_ATOM_POINT;
    atoms["RECTANGLE"] = XCB_ATOM_RECTANGLE;
    atoms["RESOURCE_MANAGER"] = XCB_ATOM_RESOURCE_MANAGER;
    atoms["RGB_COLOR_MAP"] = XCB_ATOM_RGB_COLOR_MAP;
    atoms["RGB_BEST_MAP"] = XCB_ATOM_RGB_BEST_MAP;
    atoms["RGB_BLUE_MAP"] = XCB_ATOM_RGB_BLUE_MAP;
    atoms["RGB_DEFAULT_MAP"] = XCB_ATOM_RGB_DEFAULT_MAP;
    atoms["RGB_GRAY_MAP"] = XCB_ATOM_RGB_GRAY_MAP;
    atoms["RGB_GREEN_MAP"] = XCB_ATOM_RGB_GREEN_MAP;
    atoms["RGB_RED_MAP"] = XCB_ATOM_RGB_RED_MAP;
    atoms["STRING"] = XCB_ATOM_STRING;
    atoms["VISUALID"] = XCB_ATOM_VISUALID;
    atoms["WINDOW"] = XCB_ATOM_WINDOW;
    atoms["WM_COMMAND"] = XCB_ATOM_WM_COMMAND;
    atoms["WM_HINTS"] = XCB_ATOM_WM_HINTS;
    atoms["WM_CLIENT_MACHINE"] = XCB_ATOM_WM_CLIENT_MACHINE;
    atoms["WM_ICON_NAME"] = XCB_ATOM_WM_ICON_NAME;
    atoms["WM_ICON_SIZE"] = XCB_ATOM_WM_ICON_SIZE;
    atoms["WM_NAME"] = XCB_ATOM_WM_NAME;
    atoms["WM_NORMAL_HINTS"] = XCB_ATOM_WM_NORMAL_HINTS;
    atoms["WM_SIZE_HINTS"] = XCB_ATOM_WM_SIZE_HINTS;
    atoms["WM_ZOOM_HINTS"] = XCB_ATOM_WM_ZOOM_HINTS;
    atoms["MIN_SPACE"] = XCB_ATOM_MIN_SPACE;
    atoms["NORM_SPACE"] = XCB_ATOM_NORM_SPACE;
    atoms["MAX_SPACE"] = XCB_ATOM_MAX_SPACE;
    atoms["END_SPACE"] = XCB_ATOM_END_SPACE;
    atoms["SUPERSCRIPT_X"] = XCB_ATOM_SUPERSCRIPT_X;
    atoms["SUPERSCRIPT_Y"] = XCB_ATOM_SUPERSCRIPT_Y;
    atoms["SUBSCRIPT_X"] = XCB_ATOM_SUBSCRIPT_X;
    atoms["SUBSCRIPT_Y"] = XCB_ATOM_SUBSCRIPT_Y;
    atoms["UNDERLINE_POSITION"] = XCB_ATOM_UNDERLINE_POSITION;
    atoms["UNDERLINE_THICKNESS"] = XCB_ATOM_UNDERLINE_THICKNESS;
    atoms["STRIKEOUT_ASCENT"] = XCB_ATOM_STRIKEOUT_ASCENT;
    atoms["STRIKEOUT_DESCENT"] = XCB_ATOM_STRIKEOUT_DESCENT;
    atoms["ITALIC_ANGLE"] = XCB_ATOM_ITALIC_ANGLE;
    atoms["X_HEIGHT"] = XCB_ATOM_X_HEIGHT;
    atoms["QUAD_WIDTH"] = XCB_ATOM_QUAD_WIDTH;
    atoms["WEIGHT"] = XCB_ATOM_WEIGHT;
    atoms["POINT_SIZE"] = XCB_ATOM_POINT_SIZE;
    atoms["RESOLUTION"] = XCB_ATOM_RESOLUTION;
    atoms["COPYRIGHT"] = XCB_ATOM_COPYRIGHT;
    atoms["NOTICE"] = XCB_ATOM_NOTICE;
    atoms["FONT_NAME"] = XCB_ATOM_FONT_NAME;
    atoms["FAMILY_NAME"] = XCB_ATOM_FAMILY_NAME;
    atoms["FULL_NAME"] = XCB_ATOM_FULL_NAME;
    atoms["CAP_HEIGHT"] = XCB_ATOM_CAP_HEIGHT;
    atoms["WM_CLASS"] = XCB_ATOM_WM_CLASS;
    atoms["WM_TRANSIENT_FOR"] = XCB_ATOM_WM_TRANSIENT_FOR;

    // ewmh atoms
    for (int s = 0; s < wm->ewmh->nb_screens; ++s) {
        char buf[32];
        snprintf(buf, sizeof(buf), "_NET_WM_CM_S%d", s);
        atoms[buf] = wm->ewmh->_NET_WM_CM_Sn[s];
    }
    atoms["_NET_SUPPORTED"] = wm->ewmh->_NET_SUPPORTED;
    atoms["_NET_CLIENT_LIST"] = wm->ewmh->_NET_CLIENT_LIST;
    atoms["_NET_CLIENT_LIST_STACKING"] = wm->ewmh->_NET_CLIENT_LIST_STACKING;
    atoms["_NET_NUMBER_OF_DESKTOPS"] = wm->ewmh->_NET_NUMBER_OF_DESKTOPS;
    atoms["_NET_DESKTOP_GEOMETRY"] = wm->ewmh->_NET_DESKTOP_GEOMETRY;
    atoms["_NET_DESKTOP_VIEWPORT"] = wm->ewmh->_NET_DESKTOP_VIEWPORT;
    atoms["_NET_CURRENT_DESKTOP"] = wm->ewmh->_NET_CURRENT_DESKTOP;
    atoms["_NET_DESKTOP_NAMES"] = wm->ewmh->_NET_DESKTOP_NAMES;
    atoms["_NET_ACTIVE_WINDOW"] = wm->ewmh->_NET_ACTIVE_WINDOW;
    atoms["_NET_WORKAREA"] = wm->ewmh->_NET_WORKAREA;
    atoms["_NET_SUPPORTING_WM_CHECK"] = wm->ewmh->_NET_SUPPORTING_WM_CHECK;
    atoms["_NET_VIRTUAL_ROOTS"] = wm->ewmh->_NET_VIRTUAL_ROOTS;
    atoms["_NET_DESKTOP_LAYOUT"] = wm->ewmh->_NET_DESKTOP_LAYOUT;
    atoms["_NET_SHOWING_DESKTOP"] = wm->ewmh->_NET_SHOWING_DESKTOP;
    atoms["_NET_CLOSE_WINDOW"] = wm->ewmh->_NET_CLOSE_WINDOW;
    atoms["_NET_MOVERESIZE_WINDOW"] = wm->ewmh->_NET_MOVERESIZE_WINDOW;
    atoms["_NET_WM_MOVERESIZE"] = wm->ewmh->_NET_WM_MOVERESIZE;
    atoms["_NET_RESTACK_WINDOW"] = wm->ewmh->_NET_RESTACK_WINDOW;
    atoms["_NET_REQUEST_FRAME_EXTENTS"] = wm->ewmh->_NET_REQUEST_FRAME_EXTENTS;
    atoms["_NET_WM_NAME"] = wm->ewmh->_NET_WM_NAME;
    atoms["_NET_WM_VISIBLE_NAME"] = wm->ewmh->_NET_WM_VISIBLE_NAME;
    atoms["_NET_WM_ICON_NAME"] = wm->ewmh->_NET_WM_ICON_NAME;
    atoms["_NET_WM_VISIBLE_ICON_NAME"] = wm->ewmh->_NET_WM_VISIBLE_ICON_NAME;
    atoms["_NET_WM_DESKTOP"] = wm->ewmh->_NET_WM_DESKTOP;
    atoms["_NET_WM_WINDOW_TYPE"] = wm->ewmh->_NET_WM_WINDOW_TYPE;
    atoms["_NET_WM_STATE"] = wm->ewmh->_NET_WM_STATE;
    atoms["_NET_WM_ALLOWED_ACTIONS"] = wm->ewmh->_NET_WM_ALLOWED_ACTIONS;
    atoms["_NET_WM_STRUT"] = wm->ewmh->_NET_WM_STRUT;
    atoms["_NET_WM_STRUT_PARTIAL"] = wm->ewmh->_NET_WM_STRUT_PARTIAL;
    atoms["_NET_WM_ICON_GEOMETRY"] = wm->ewmh->_NET_WM_ICON_GEOMETRY;
    atoms["_NET_WM_ICON"] = wm->ewmh->_NET_WM_ICON;
    atoms["_NET_WM_PID"] = wm->ewmh->_NET_WM_PID;
    atoms["_NET_WM_HANDLED_ICONS"] = wm->ewmh->_NET_WM_HANDLED_ICONS;
    atoms["_NET_WM_USER_TIME"] = wm->ewmh->_NET_WM_USER_TIME;
    atoms["_NET_WM_USER_TIME_WINDOW"] = wm->ewmh->_NET_WM_USER_TIME_WINDOW;
    atoms["_NET_FRAME_EXTENTS"] = wm->ewmh->_NET_FRAME_EXTENTS;
    atoms["_NET_WM_PING"] = wm->ewmh->_NET_WM_PING;
    atoms["_NET_WM_SYNC_REQUEST"] = wm->ewmh->_NET_WM_SYNC_REQUEST;
    atoms["_NET_WM_SYNC_REQUEST_COUNTER"] = wm->ewmh->_NET_WM_SYNC_REQUEST_COUNTER;
    atoms["_NET_WM_FULLSCREEN_MONITORS"] = wm->ewmh->_NET_WM_FULLSCREEN_MONITORS;
    atoms["_NET_WM_FULL_PLACEMENT"] = wm->ewmh->_NET_WM_FULL_PLACEMENT;
    atoms["UTF8_STRING"] = wm->ewmh->UTF8_STRING;
    atoms["WM_PROTOCOLS"] = wm->ewmh->WM_PROTOCOLS;
    atoms["MANAGER"] = wm->ewmh->MANAGER;
    atoms["_NET_WM_WINDOW_TYPE_DESKTOP"] = wm->ewmh->_NET_WM_WINDOW_TYPE_DESKTOP;
    atoms["_NET_WM_WINDOW_TYPE_DOCK"] = wm->ewmh->_NET_WM_WINDOW_TYPE_DOCK;
    atoms["_NET_WM_WINDOW_TYPE_TOOLBAR"] = wm->ewmh->_NET_WM_WINDOW_TYPE_TOOLBAR;
    atoms["_NET_WM_WINDOW_TYPE_MENU"] = wm->ewmh->_NET_WM_WINDOW_TYPE_MENU;
    atoms["_NET_WM_WINDOW_TYPE_UTILITY"] = wm->ewmh->_NET_WM_WINDOW_TYPE_UTILITY;
    atoms["_NET_WM_WINDOW_TYPE_SPLASH"] = wm->ewmh->_NET_WM_WINDOW_TYPE_SPLASH;
    atoms["_NET_WM_WINDOW_TYPE_DIALOG"] = wm->ewmh->_NET_WM_WINDOW_TYPE_DIALOG;
    atoms["_NET_WM_WINDOW_TYPE_DROPDOWN_MENU"] = wm->ewmh->_NET_WM_WINDOW_TYPE_DROPDOWN_MENU;
    atoms["_NET_WM_WINDOW_TYPE_POPUP_MENU"] = wm->ewmh->_NET_WM_WINDOW_TYPE_POPUP_MENU;
    atoms["_NET_WM_WINDOW_TYPE_TOOLTIP"] = wm->ewmh->_NET_WM_WINDOW_TYPE_TOOLTIP;
    atoms["_NET_WM_WINDOW_TYPE_NOTIFICATION"] = wm->ewmh->_NET_WM_WINDOW_TYPE_NOTIFICATION;
    atoms["_NET_WM_WINDOW_TYPE_COMBO"] = wm->ewmh->_NET_WM_WINDOW_TYPE_COMBO;
    atoms["_NET_WM_WINDOW_TYPE_DND"] = wm->ewmh->_NET_WM_WINDOW_TYPE_DND;
    atoms["_NET_WM_WINDOW_TYPE_NORMAL"] = wm->ewmh->_NET_WM_WINDOW_TYPE_NORMAL;
    atoms["_NET_WM_STATE_MODAL"] = wm->ewmh->_NET_WM_STATE_MODAL;
    atoms["_NET_WM_STATE_STICKY"] = wm->ewmh->_NET_WM_STATE_STICKY;
    atoms["_NET_WM_STATE_MAXIMIZED_VERT"] = wm->ewmh->_NET_WM_STATE_MAXIMIZED_VERT;
    atoms["_NET_WM_STATE_MAXIMIZED_HORZ"] = wm->ewmh->_NET_WM_STATE_MAXIMIZED_HORZ;
    atoms["_NET_WM_STATE_SHADED"] = wm->ewmh->_NET_WM_STATE_SHADED;
    atoms["_NET_WM_STATE_SKIP_TASKBAR"] = wm->ewmh->_NET_WM_STATE_SKIP_TASKBAR;
    atoms["_NET_WM_STATE_SKIP_PAGER"] = wm->ewmh->_NET_WM_STATE_SKIP_PAGER;
    atoms["_NET_WM_STATE_HIDDEN"] = wm->ewmh->_NET_WM_STATE_HIDDEN;
    atoms["_NET_WM_STATE_FULLSCREEN"] = wm->ewmh->_NET_WM_STATE_FULLSCREEN;
    atoms["_NET_WM_STATE_ABOVE"] = wm->ewmh->_NET_WM_STATE_ABOVE;
    atoms["_NET_WM_STATE_BELOW"] = wm->ewmh->_NET_WM_STATE_BELOW;
    atoms["_NET_WM_STATE_DEMANDS_ATTENTION"] = wm->ewmh->_NET_WM_STATE_DEMANDS_ATTENTION;
    atoms["_NET_WM_ACTION_MOVE"] = wm->ewmh->_NET_WM_ACTION_MOVE;
    atoms["_NET_WM_ACTION_RESIZE"] = wm->ewmh->_NET_WM_ACTION_RESIZE;
    atoms["_NET_WM_ACTION_MINIMIZE"] = wm->ewmh->_NET_WM_ACTION_MINIMIZE;
    atoms["_NET_WM_ACTION_SHADE"] = wm->ewmh->_NET_WM_ACTION_SHADE;
    atoms["_NET_WM_ACTION_STICK"] = wm->ewmh->_NET_WM_ACTION_STICK;
    atoms["_NET_WM_ACTION_MAXIMIZE_HORZ"] = wm->ewmh->_NET_WM_ACTION_MAXIMIZE_HORZ;
    atoms["_NET_WM_ACTION_MAXIMIZE_VERT"] = wm->ewmh->_NET_WM_ACTION_MAXIMIZE_VERT;
    atoms["_NET_WM_ACTION_FULLSCREEN"] = wm->ewmh->_NET_WM_ACTION_FULLSCREEN;
    atoms["_NET_WM_ACTION_CHANGE_DESKTOP"] = wm->ewmh->_NET_WM_ACTION_CHANGE_DESKTOP;
    atoms["_NET_WM_ACTION_CLOSE"] = wm->ewmh->_NET_WM_ACTION_CLOSE;
    atoms["_NET_WM_ACTION_ABOVE"] = wm->ewmh->_NET_WM_ACTION_ABOVE;
    atoms["_NET_WM_ACTION_BELOW"] = wm->ewmh->_NET_WM_ACTION_BELOW;

    // some extra atoms we might want to know about
    struct ExtraAtom {
        size_t size;
        const char* name;
    };
    const ExtraAtom extraAtoms[] = {
        { 16, "WM_DELETE_WINDOW" },
        {  8, "WM_STATE" },
        { 15, "WM_CHANGE_STATE" },
        { 14, "WM_WINDOW_ROLE" },
        { 16, "WM_CLIENT_LEADER" },
        { 13, "WM_TAKE_FOCUS" },
        { 23, "_NET_SYSTEM_TRAY_OPCODE" },
        { 28, "_NET_SYSTEM_TRAY_ORIENTATION" },
        { 22, "_NET_WM_WINDOW_OPACITY" },
        { 16, "_XKB_RULES_NAMES" }
    };
    const size_t extraCount = sizeof(extraAtoms) / sizeof(extraAtoms[0]);

    std::vector<xcb_intern_atom_cookie_t> cookies;
    cookies.reserve(extraCount);
    for (size_t i = 0; i < extraCount; ++i) {
        cookies.push_back(xcb_intern_atom_unchecked(wm->conn, 0, extraAtoms[i].size, extraAtoms[i].name));
    }
    for (size_t i = 0; i < extraCount; ++i) {
        xcb_intern_atom_reply_t* reply = xcb_intern_atom_reply(wm->conn, cookies[i], nullptr);
        atoms[extraAtoms[i].name] = reply->atom;
        free(reply);
    }
}

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

        initAtoms(wm);

        std::shared_ptr<std::vector<owm::Window> > windows = std::make_shared<std::vector<owm::Window> >();
        auto queryWindows = [&windows](xcb_connection_t* conn, xcb_ewmh_connection_t* ewmh, const owm::Atoms& atoms, xcb_window_t root) {
            std::vector<xcb_get_window_attributes_cookie_t> attribCookies;
            std::vector<xcb_get_geometry_cookie_t> geomCookies;
            std::vector<xcb_get_property_cookie_t> leaderCookies;
            std::vector<xcb_get_property_cookie_t> normalHintsCookies;
            std::vector<xcb_get_property_cookie_t> transientCookies;
            std::vector<xcb_get_property_cookie_t> hintsCookies;
            std::vector<xcb_get_property_cookie_t> classCookies;
            std::vector<xcb_get_property_cookie_t> nameCookies;
            std::vector<xcb_get_property_cookie_t> protocolsCookies;
            std::vector<xcb_get_property_cookie_t> strutCookies;
            std::vector<xcb_get_property_cookie_t> partialStrutCookies;
            std::vector<xcb_get_property_cookie_t> stateCookies;
            std::vector<xcb_get_property_cookie_t> typeCookies;
            std::vector<xcb_get_property_cookie_t> pidCookies;

            xcb_query_tree_cookie_t cookie = xcb_query_tree_unchecked(conn, root);
            xcb_query_tree_reply_t *tree = xcb_query_tree_reply(conn, cookie, nullptr);
            xcb_window_t *wins = xcb_query_tree_children(tree);

            attribCookies.reserve(tree->children_len);
            geomCookies.reserve(tree->children_len);
            leaderCookies.reserve(tree->children_len);
            normalHintsCookies.reserve(tree->children_len);
            transientCookies.reserve(tree->children_len);
            hintsCookies.reserve(tree->children_len);
            classCookies.reserve(tree->children_len);
            nameCookies.reserve(tree->children_len);
            protocolsCookies.reserve(tree->children_len);
            strutCookies.reserve(tree->children_len);
            partialStrutCookies.reserve(tree->children_len);
            stateCookies.reserve(tree->children_len);
            typeCookies.reserve(tree->children_len);
            pidCookies.reserve(tree->children_len);

            const auto wm_client_leader = atoms.at("WM_CLIENT_LEADER");
            const auto wm_protocols = atoms.at("WM_PROTOCOLS");

            for (unsigned int i = 0; i < tree->children_len; ++i) {
                attribCookies.push_back(xcb_get_window_attributes_unchecked(conn, wins[i]));
                geomCookies.push_back(xcb_get_geometry_unchecked(conn, wins[i]));
                leaderCookies.push_back(xcb_get_property(conn, 0, wins[i], wm_client_leader, XCB_ATOM_WINDOW, 0, 1));
                normalHintsCookies.push_back(xcb_icccm_get_wm_normal_hints(conn, wins[i]));
                transientCookies.push_back(xcb_icccm_get_wm_transient_for(conn, wins[i]));
                hintsCookies.push_back(xcb_icccm_get_wm_hints(conn, wins[i]));
                classCookies.push_back(xcb_icccm_get_wm_class(conn, wins[i]));
                nameCookies.push_back(xcb_icccm_get_wm_name(conn, wins[i]));
                protocolsCookies.push_back(xcb_icccm_get_wm_protocols(conn, wins[i], wm_protocols));
                strutCookies.push_back(xcb_ewmh_get_wm_strut(ewmh, wins[i]));
                partialStrutCookies.push_back(xcb_ewmh_get_wm_strut_partial(ewmh, wins[i]));
                stateCookies.push_back(xcb_ewmh_get_wm_state(ewmh, wins[i]));
                typeCookies.push_back(xcb_ewmh_get_wm_window_type(ewmh, wins[i]));
                pidCookies.push_back(xcb_ewmh_get_wm_pid(ewmh, wins[i]));
            }

            xcb_size_hints_t normalHints;
            xcb_icccm_wm_hints_t wmHints;
            xcb_icccm_get_wm_class_reply_t wmClass;
            xcb_icccm_get_text_property_reply_t wmName;
            xcb_window_t transientWin, leaderWin;
            xcb_icccm_get_wm_protocols_reply_t wmProtocols;
            xcb_ewmh_get_extents_reply_t ewmhStrut;
            xcb_ewmh_wm_strut_partial_t ewmhStrutPartial;
            xcb_ewmh_get_atoms_reply_t ewmhState, ewmhWindowType;
            uint32_t pid;

            auto makeSizeHint = [](const xcb_size_hints_t& in) -> owm::Window::SizeHints {
                owm::Window::SizeHints out;
                static_assert(sizeof(in) == sizeof(out));
                memcpy(&out, &in, sizeof(in));
                return out;
            };

            auto makeWMHints = [](const xcb_icccm_wm_hints_t& in) -> owm::Window::WMHints {
                owm::Window::WMHints out;
                static_assert(sizeof(in) == sizeof(out));
                memcpy(&out, &in, sizeof(in));
                return out;
            };

            auto makeWMClass = [](const xcb_icccm_get_wm_class_reply_t& in) -> owm::Window::WMClass {
                owm::Window::WMClass out;
                if (in.instance_name)
                    out.instance_name = in.instance_name;
                if (in.class_name)
                    out.class_name = in.class_name;
                return out;
            };

            auto makeString = [](const xcb_icccm_get_text_property_reply_t& in) -> std::string {
                if (in.format == 8 && in.name && in.name_len > 0) {
                    return std::string(in.name, in.name_len);
                }
                return std::string();
            };

            auto makeAtoms = [](const auto& in) -> std::vector<xcb_atom_t> {
                std::vector<xcb_atom_t> out;
                out.reserve(in.atoms_len);
                for (uint32_t i = 0; i < in.atoms_len; ++i) {
                    out.push_back(in.atoms[i]);
                }
                return out;
            };

            auto makeExtents = [](const xcb_ewmh_get_extents_reply_t& in) -> owm::Window::EWMHExtents {
                owm::Window::EWMHExtents out;
                static_assert(sizeof(in) == sizeof(out));
                memcpy(&out, &in, sizeof(in));
                return out;
            };

            auto makeStrutPartial = [](const xcb_ewmh_wm_strut_partial_t& in) -> owm::Window::EWMHStrutPartial {
                owm::Window::EWMHStrutPartial out;
                static_assert(sizeof(in) == sizeof(out));
                memcpy(&out, &in, sizeof(in));
                return out;
            };

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
                xcb_get_property_reply_t* leader = xcb_get_property_reply(conn, leaderCookies[i], nullptr);
                if (!leader) {
                    leaderWin = XCB_NONE;
                } else {
                    if (leader->type != XCB_ATOM_WINDOW || leader->format != 32 || !leader->length) {
                        leaderWin = XCB_NONE;
                    } else {
                        leaderWin = *static_cast<xcb_window_t *>(xcb_get_property_value(leader));
                    }
                    free(leader);
                }
                if (!xcb_icccm_get_wm_normal_hints_reply(conn, normalHintsCookies[i], &normalHints, nullptr)) {
                    memset(&normalHints, 0, sizeof(normalHints));
                }
                if (!xcb_icccm_get_wm_transient_for_reply(conn, transientCookies[i], &transientWin, nullptr)) {
                    transientWin = XCB_NONE;
                }
                if (!xcb_icccm_get_wm_hints_reply(conn, hintsCookies[i], &wmHints, nullptr)) {
                    memset(&wmHints, 0, sizeof(wmHints));
                }
                if (!xcb_icccm_get_wm_class_reply(conn, classCookies[i], &wmClass, nullptr)) {
                    memset(&wmClass, 0, sizeof(wmClass));
                }
                if (!xcb_icccm_get_wm_name_reply(conn, nameCookies[i], &wmName, nullptr)) {
                    memset(&wmName, 0, sizeof(wmName));
                }
                if (!xcb_icccm_get_wm_protocols_reply(conn, protocolsCookies[i], &wmProtocols, nullptr)) {
                    memset(&wmProtocols, 0, sizeof(wmProtocols));
                }
                if (!xcb_ewmh_get_wm_strut_reply(ewmh, strutCookies[i], &ewmhStrut, nullptr)) {
                    memset(&ewmhStrut, 0, sizeof(ewmhStrut));
                }
                if (!xcb_ewmh_get_wm_strut_partial_reply(ewmh, partialStrutCookies[i], &ewmhStrutPartial, nullptr)) {
                    memset(&ewmhStrutPartial, 0, sizeof(ewmhStrutPartial));
                }
                if (!xcb_ewmh_get_wm_state_reply(ewmh, stateCookies[i], &ewmhState, nullptr)) {
                    memset(&ewmhState, 0, sizeof(ewmhState));
                }
                if (!xcb_ewmh_get_wm_window_type_reply(ewmh, typeCookies[i], &ewmhWindowType, nullptr)) {
                    memset(&ewmhWindowType, 0, sizeof(ewmhWindowType));
                }
                if (!xcb_ewmh_get_wm_pid_reply(ewmh, pidCookies[i], &pid, nullptr)) {
                    pid = 0;
                }

                windows->push_back({
                        wins[i],
                        {
                            attrib->bit_gravity,
                            attrib->win_gravity,
                            attrib->map_state,
                            attrib->override_redirect,
                            attrib->all_event_masks,
                            attrib->your_event_mask,
                            attrib->do_not_propagate_mask
                        }, {
                            geom->root,
                            geom->x,
                            geom->y,
                            geom->width,
                            geom->height,
                            geom->border_width
                        },
                        makeSizeHint(normalHints),
                        makeWMHints(wmHints),
                        makeWMClass(wmClass),
                        makeString(wmName),
                        makeAtoms(wmProtocols),
                        makeAtoms(ewmhState),
                        makeAtoms(ewmhWindowType),
                        makeExtents(ewmhStrut),
                        makeStrutPartial(ewmhStrutPartial),
                        pid, transientWin, leaderWin
                });


                if (wmName.name && wmName.name_len) {
                    xcb_icccm_get_text_property_reply_wipe(&wmName);
                }
                if (wmClass.instance_name || wmClass.class_name) {
                    xcb_icccm_get_wm_class_reply_wipe(&wmClass);
                }
                if (wmProtocols.atoms && wmProtocols.atoms_len) {
                    xcb_icccm_get_wm_protocols_reply_wipe(&wmProtocols);
                }
                if (ewmhState.atoms && ewmhState.atoms_len) {
                    xcb_ewmh_get_atoms_reply_wipe(&ewmhState);
                }
                if (ewmhWindowType.atoms && ewmhWindowType.atoms_len) {
                    xcb_ewmh_get_atoms_reply_wipe(&ewmhWindowType);
                }

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
                queryWindows(wm->conn, wm->ewmh, wm->atoms, s.screen->root);
                err.reset(xcb_request_check(wm->conn, cookie));
                if (err) {
                    deferred->Reject("Unable to change attributes on one of the root windows");
                    return;
                }
                xcb_ewmh_set_wm_pid(wm->ewmh, s.screen->root, getpid());
            }
        }

        {
            // xkb stuffs
            xcb_prefetch_extension_data(wm->conn, &xcb_xkb_id);
            const int ret = xkb_x11_setup_xkb_extension(wm->conn,
                                                        XKB_X11_MIN_MAJOR_XKB_VERSION,
                                                        XKB_X11_MIN_MINOR_XKB_VERSION,
                                                        XKB_X11_SETUP_XKB_EXTENSION_NO_FLAGS,
                                                        nullptr, nullptr, nullptr, nullptr);
            if (!ret) {
                deferred->Reject("Unable to setup xkb");
                return;
            }

            xkb_context* ctx = xkb_context_new(XKB_CONTEXT_NO_FLAGS);
            if (!ctx) {
                deferred->Reject("Unable create new xkb context");
                return;
            }

            const int32_t deviceId = xkb_x11_get_core_keyboard_device_id(wm->conn);
            if (!deviceId) {
                xkb_context_unref(ctx);
                deferred->Reject("Unable get core xkb device id");
                return;
            }

            xkb_keymap* keymap = xkb_x11_keymap_new_from_device(ctx, wm->conn, deviceId, XKB_KEYMAP_COMPILE_NO_FLAGS);
            if (!keymap) {
                xkb_context_unref(ctx);
                deferred->Reject("Unable get xkb keymap from device");
                return;
            }

            xkb_state* state = xkb_x11_state_new_from_device(keymap, wm->conn, deviceId);
            if (!state) {
                xkb_keymap_unref(keymap);
                xkb_context_unref(ctx);
                deferred->Reject("Unable get xkb state from device");
                return;
            }

            const xcb_query_extension_reply_t *reply = xcb_get_extension_data(wm->conn, &xcb_xkb_id);
            if (!reply || !reply->present) {
                xkb_state_unref(state);
                xkb_keymap_unref(keymap);
                xkb_context_unref(ctx);
                deferred->Reject("Unable get xkb extension reply");
                return;
            }


            unsigned int affectMap, map;
            affectMap = map = XCB_XKB_MAP_PART_KEY_TYPES
            | XCB_XKB_MAP_PART_KEY_SYMS
            | XCB_XKB_MAP_PART_MODIFIER_MAP
            | XCB_XKB_MAP_PART_EXPLICIT_COMPONENTS
            | XCB_XKB_MAP_PART_KEY_ACTIONS
            | XCB_XKB_MAP_PART_KEY_BEHAVIORS
            | XCB_XKB_MAP_PART_VIRTUAL_MODS
            | XCB_XKB_MAP_PART_VIRTUAL_MOD_MAP;

            xcb_void_cookie_t select = xcb_xkb_select_events_checked(wm->conn, XCB_XKB_ID_USE_CORE_KBD,
                                                                     XCB_XKB_EVENT_TYPE_STATE_NOTIFY | XCB_XKB_EVENT_TYPE_MAP_NOTIFY,
                                                                     0,
                                                                     XCB_XKB_EVENT_TYPE_STATE_NOTIFY | XCB_XKB_EVENT_TYPE_MAP_NOTIFY,
                                                                     affectMap, map, nullptr);
            err.reset(xcb_request_check(wm->conn, select));
            if (err) {
                xkb_state_unref(state);
                xkb_keymap_unref(keymap);
                xkb_context_unref(ctx);
                deferred->Reject("Unable get select xkb events");
                return;
            }

            wm->xkb = { reply->first_event, ctx, keymap, state, deviceId, std::shared_ptr<xcb_key_symbols_t>(xcb_key_symbols_alloc(wm->conn), [](auto p) { xcb_key_symbols_free(p); }) };
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
                s.Set("root", Napi::Number::New(env, screen.screen->root));
                s.Set("no", Napi::Number::New(env, i));
                arr.Set(i, s);
            }

            obj.Set("screens", arr);

            try {
                napi_value nvalue = obj;
                js.Call(1, &nvalue);
            } catch (const Napi::Error& e) {
                printf("exception from js: %s\n", e.what());
            }
        };

        data.tsfn.BlockingCall(screensCallback);

        auto windowsCallback = [windows{std::move(windows)}](Napi::Env env, Napi::Function js) mutable {
            Napi::Object obj = Napi::Object::New(env);
            obj.Set("type", "windows");
            Napi::Array arr = Napi::Array::New(env, windows->size());
            for (size_t i = 0; i < windows->size(); ++i) {
                arr.Set(i, owm::makeWindow(env, (*windows)[i]));
            }
            obj.Set("windows", arr);

            try {
                napi_value nvalue = obj;
                js.Call(1, &nvalue);
            } catch (const Napi::Error& e) {
                printf("exception from js: %s\n", e.what());
            }

            windows.reset();
        };

        data.tsfn.BlockingCall(windowsCallback);

        auto settledCallback = [](Napi::Env env, Napi::Function js) {
            Napi::Object obj = Napi::Object::New(env);
            obj.Set("type", "settled");

            try {
                napi_value nvalue = obj;
                js.Call(1, &nvalue);
            } catch (const Napi::Error& e) {
                printf("exception from js: %s\n", e.what());
            }
        };

        data.tsfn.BlockingCall(settledCallback);

        enum { MaxEvents = 5 };
        epoll_event events[MaxEvents];

        const auto xkbevent = wm->xkb.event;

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
                        if ((event->response_type & ~0x80) == xkbevent) {
                            owm::handleXkb(wm, data.tsfn, reinterpret_cast<owm::_xkb_event*>(event));
                        } else {
                            owm::handleXcb(wm, data.tsfn, event);
                        }
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
