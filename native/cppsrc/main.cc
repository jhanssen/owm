#include "owm.h"
#include "graphics.h"
#include <atomic>
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
    std::shared_ptr<owm::WM> wm;
    xcb_window_t ewmhWindow;
    uv_async_t asyncFlush;
    uv_poll_t pollXcb;
    Napi::FunctionReference callback;
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
        { 21, "_NET_WM_STATE_FOCUSED" },
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

    if (data.started) {
        throw Napi::TypeError::New(env, "owm already started");
    }
    if (!info[0].IsFunction()) {
        throw Napi::TypeError::New(env, "First argument needs to be a callback function");
    }
    data.callback = Napi::Persistent(info[0].As<Napi::Function>());

    std::string display;
    if (info[1].IsString()) {
        display = info[1].As<Napi::String>();
    }

    data.started = true;
    data.ewmhWindow = XCB_WINDOW_NONE;

    auto flush = [](uv_async_t* async) {
        if (data.wm) {
            xcb_flush(data.wm->conn);
        }
    };

    uv_async_init(uv_default_loop(), &data.asyncFlush, flush);

    auto loop = uv_default_loop();

    auto wm = data.wm = std::make_shared<owm::WM>();

    int defaultScreen;
    wm->conn = xcb_connect(display.empty() ? nullptr : display.c_str(), &defaultScreen);
    if (!wm->conn) { // boo
        throw Napi::TypeError::New(env, "Unable to xcb_connect()");
    }

    wm->asyncFlush = &data.asyncFlush;

    wm->defaultScreenNo = defaultScreen;
    wm->defaultScreen = xcb_aux_get_screen(wm->conn, wm->defaultScreenNo);
    if (!wm->defaultScreen) {
        throw Napi::TypeError::New(env, "Couldn't get default screen");
    }
    if (wm->defaultScreen->root_depth != 32 && wm->defaultScreen->root_depth != 24) {
        throw Napi::TypeError::New(env, "Only supports true color screens");
    }

    // prefetch extensions
    xcb_prefetch_extension_data(wm->conn, &xcb_xkb_id);
    xcb_prefetch_extension_data(wm->conn, &xcb_randr_id);

    std::unique_ptr<xcb_generic_error_t> err;

    {
        const uint32_t values[] = { XCB_EVENT_MASK_SUBSTRUCTURE_REDIRECT };
        xcb_void_cookie_t cookie = xcb_change_window_attributes_checked(wm->conn, wm->defaultScreen->root, XCB_CW_EVENT_MASK, values);
        err.reset(xcb_request_check(wm->conn, cookie));
        if (err) { // another wm already running
            throw Napi::TypeError::New(env, "Another wm is already running?");
        }
    }

    wm->ewmh = new xcb_ewmh_connection_t;
    xcb_intern_atom_cookie_t* ewmhCookie = xcb_ewmh_init_atoms(wm->conn, wm->ewmh);
    if (!ewmhCookie) {
        throw Napi::TypeError::New(env, "Unable to init ewmh atoms");
    }
    if (!xcb_ewmh_init_atoms_replies(wm->ewmh, ewmhCookie, 0)) {
        throw Napi::TypeError::New(env, "Unable to init ewmh atoms");
    }

    initAtoms(wm);

    std::vector<owm::Window> windows;
    auto queryWindows = [&windows](xcb_connection_t* conn, xcb_ewmh_connection_t* ewmh, const owm::Atoms& atoms, xcb_window_t root) {
        std::vector<xcb_get_window_attributes_cookie_t> attribCookies;
        std::vector<xcb_get_geometry_cookie_t> geomCookies;
        std::vector<xcb_get_property_cookie_t> leaderCookies;
        std::vector<xcb_get_property_cookie_t> roleCookies;
        std::vector<xcb_get_property_cookie_t> normalHintsCookies;
        std::vector<xcb_get_property_cookie_t> transientCookies;
        std::vector<xcb_get_property_cookie_t> hintsCookies;
        std::vector<xcb_get_property_cookie_t> classCookies;
        std::vector<xcb_get_property_cookie_t> nameCookies;
        std::vector<xcb_get_property_cookie_t> ewmhNameCookies;
        std::vector<xcb_get_property_cookie_t> protocolsCookies;
        std::vector<xcb_get_property_cookie_t> strutCookies;
        std::vector<xcb_get_property_cookie_t> partialStrutCookies;
        std::vector<xcb_get_property_cookie_t> stateCookies;
        std::vector<xcb_get_property_cookie_t> typeCookies;
        std::vector<xcb_get_property_cookie_t> pidCookies;
        std::vector<xcb_get_property_cookie_t> desktopCookies;

        xcb_query_tree_cookie_t cookie = xcb_query_tree_unchecked(conn, root);
        xcb_query_tree_reply_t *tree = xcb_query_tree_reply(conn, cookie, nullptr);
        xcb_window_t *wins = xcb_query_tree_children(tree);

        attribCookies.reserve(tree->children_len);
        geomCookies.reserve(tree->children_len);
        leaderCookies.reserve(tree->children_len);
        roleCookies.reserve(tree->children_len);
        normalHintsCookies.reserve(tree->children_len);
        transientCookies.reserve(tree->children_len);
        hintsCookies.reserve(tree->children_len);
        classCookies.reserve(tree->children_len);
        nameCookies.reserve(tree->children_len);
        ewmhNameCookies.reserve(tree->children_len);
        protocolsCookies.reserve(tree->children_len);
        strutCookies.reserve(tree->children_len);
        partialStrutCookies.reserve(tree->children_len);
        stateCookies.reserve(tree->children_len);
        typeCookies.reserve(tree->children_len);
        pidCookies.reserve(tree->children_len);
        desktopCookies.reserve(tree->children_len);

        const auto wm_client_leader = atoms.at("WM_CLIENT_LEADER");
        const auto wm_protocols = atoms.at("WM_PROTOCOLS");
        const auto net_wm_desktop = atoms.at("_NET_WM_DESKTOP");
        const auto wm_window_role = atoms.at("WM_WINDOW_ROLE");
        const auto utf8_string = atoms.at("UTF8_STRING");

        for (unsigned int i = 0; i < tree->children_len; ++i) {
            attribCookies.push_back(xcb_get_window_attributes_unchecked(conn, wins[i]));
            geomCookies.push_back(xcb_get_geometry_unchecked(conn, wins[i]));
            leaderCookies.push_back(xcb_get_property(conn, 0, wins[i], wm_client_leader, XCB_ATOM_WINDOW, 0, 1));
            roleCookies.push_back(xcb_get_property(conn, 0, wins[i], wm_window_role, XCB_GET_PROPERTY_TYPE_ANY, 0, 128));
            normalHintsCookies.push_back(xcb_icccm_get_wm_normal_hints(conn, wins[i]));
            transientCookies.push_back(xcb_icccm_get_wm_transient_for(conn, wins[i]));
            hintsCookies.push_back(xcb_icccm_get_wm_hints(conn, wins[i]));
            classCookies.push_back(xcb_icccm_get_wm_class(conn, wins[i]));
            nameCookies.push_back(xcb_icccm_get_wm_name(conn, wins[i]));
            ewmhNameCookies.push_back(xcb_ewmh_get_wm_name(ewmh, wins[i]));
            protocolsCookies.push_back(xcb_icccm_get_wm_protocols(conn, wins[i], wm_protocols));
            strutCookies.push_back(xcb_ewmh_get_wm_strut(ewmh, wins[i]));
            partialStrutCookies.push_back(xcb_ewmh_get_wm_strut_partial(ewmh, wins[i]));
            stateCookies.push_back(xcb_ewmh_get_wm_state(ewmh, wins[i]));
            typeCookies.push_back(xcb_ewmh_get_wm_window_type(ewmh, wins[i]));
            pidCookies.push_back(xcb_ewmh_get_wm_pid(ewmh, wins[i]));
            desktopCookies.push_back(xcb_get_property(conn, 0, wins[i], net_wm_desktop, XCB_ATOM_CARDINAL, 0, 1));
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
        xcb_ewmh_get_utf8_strings_reply_t ewmhName;
        std::string wmRole;
        uint32_t pid, desktop;

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
            xcb_get_property_reply_t* leaderReply = xcb_get_property_reply(conn, leaderCookies[i], nullptr);
            if (!leaderReply) {
                leaderWin = XCB_NONE;
            } else {
                if (leaderReply->type != XCB_ATOM_WINDOW || leaderReply->format != 32 || !leaderReply->length) {
                    leaderWin = XCB_NONE;
                } else {
                    leaderWin = *static_cast<xcb_window_t *>(xcb_get_property_value(leaderReply));
                }
                free(leaderReply);
            }
            xcb_get_property_reply_t* roleReply = xcb_get_property_reply(conn, roleCookies[i], nullptr);
            if (!roleReply) {
                wmRole.clear();
            } else {
                const auto len = xcb_get_property_value_length(roleReply);
                if (roleReply->format != 8 || !len) {
                    wmRole.clear();
                } else if (roleReply->type == utf8_string) {
                    wmRole = std::string(reinterpret_cast<char*>(xcb_get_property_value(roleReply)), len);
                } else {
                    wmRole = owm::latin1toutf8(std::string(reinterpret_cast<char*>(xcb_get_property_value(roleReply)), len));
                }
                free(roleReply);
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
            if (!xcb_ewmh_get_wm_name_reply(ewmh, ewmhNameCookies[i], &ewmhName, nullptr)) {
                memset(&ewmhName, 0, sizeof(ewmhName));
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
            xcb_get_property_reply_t* desktopReply = xcb_get_property_reply(conn, desktopCookies[i], nullptr);
            if (!desktopReply) {
                desktop = 0;
            } else {
                if (desktopReply->type != XCB_ATOM_CARDINAL || desktopReply->format != 32 || !desktopReply->length) {
                    desktop = 0;
                } else {
                    desktop = *static_cast<uint32_t*>(xcb_get_property_value(desktopReply));
                }
                free(desktopReply);
            }

            windows.push_back({
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
                                   owm::makeSizeHint(normalHints),
                                       owm::makeWMHints(wmHints),
                                       owm::makeWMClass(wmClass),
                                       std::move(wmRole),
                                       owm::makeString(wmName, wmName.encoding == utf8_string),
                                       owm::makeString(ewmhName, true), // always UTF8
                                       owm::makeAtoms(wmProtocols),
                                       owm::makeAtoms(ewmhState),
                                       owm::makeAtoms(ewmhWindowType),
                                       owm::makeExtents(ewmhStrut),
                                       owm::makeStrutPartial(ewmhStrutPartial),
                                       pid, transientWin, leaderWin, desktop
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
            if (ewmhName.strings && ewmhName.strings_len) {
                xcb_ewmh_get_utf8_strings_reply_wipe(&ewmhName);
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
                                    | XCB_EVENT_MASK_ENTER_WINDOW
                                    | XCB_EVENT_MASK_LEAVE_WINDOW
                                    | XCB_EVENT_MASK_STRUCTURE_NOTIFY
                                    | XCB_EVENT_MASK_BUTTON_PRESS
                                    | XCB_EVENT_MASK_BUTTON_RELEASE
                                    | XCB_EVENT_MASK_FOCUS_CHANGE
                                    | XCB_EVENT_MASK_PROPERTY_CHANGE };
        const auto root = wm->defaultScreen->root;
        xcb_void_cookie_t cookie = xcb_change_window_attributes_checked(wm->conn, root, XCB_CW_EVENT_MASK, values);
        queryWindows(wm->conn, wm->ewmh, wm->atoms, root);
        err.reset(xcb_request_check(wm->conn, cookie));
        if (err) {
            throw Napi::TypeError::New(env, "Unable to change attributes on the root window");
        }
    }

    {
        // xkb stuffs
        const int ret = xkb_x11_setup_xkb_extension(wm->conn,
                                                    XKB_X11_MIN_MAJOR_XKB_VERSION,
                                                    XKB_X11_MIN_MINOR_XKB_VERSION,
                                                    XKB_X11_SETUP_XKB_EXTENSION_NO_FLAGS,
                                                    nullptr, nullptr, nullptr, nullptr);
        if (!ret) {
            throw Napi::TypeError::New(env, "Unable to setup xkb");
        }

        xkb_context* ctx = xkb_context_new(XKB_CONTEXT_NO_FLAGS);
        if (!ctx) {
            throw Napi::TypeError::New(env, "Unable create new xkb context");
        }

        const int32_t deviceId = xkb_x11_get_core_keyboard_device_id(wm->conn);
        if (!deviceId) {
            xkb_context_unref(ctx);
            throw Napi::TypeError::New(env, "Unable get core xkb device id");
        }

        xkb_keymap* keymap = xkb_x11_keymap_new_from_device(ctx, wm->conn, deviceId, XKB_KEYMAP_COMPILE_NO_FLAGS);
        if (!keymap) {
            xkb_context_unref(ctx);
            throw Napi::TypeError::New(env, "Unable get xkb keymap from device");
        }

        xkb_state* state = xkb_x11_state_new_from_device(keymap, wm->conn, deviceId);
        if (!state) {
            xkb_keymap_unref(keymap);
            xkb_context_unref(ctx);
            throw Napi::TypeError::New(env, "Unable get xkb state from device");
        }

        const xcb_query_extension_reply_t *reply = xcb_get_extension_data(wm->conn, &xcb_xkb_id);
        if (!reply || !reply->present) {
            xkb_state_unref(state);
            xkb_keymap_unref(keymap);
            xkb_context_unref(ctx);
            throw Napi::TypeError::New(env, "Unable get xkb extension reply");
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
            throw Napi::TypeError::New(env, "Unable get select xkb events");
        }

        wm->xkb = { reply->first_event, ctx, xcb_key_symbols_alloc(wm->conn), keymap, state, deviceId };
    }

    {
        // randr stuff
        auto reply = xcb_get_extension_data(wm->conn, &xcb_randr_id);
        if(!reply || !reply->present) {
            throw Napi::TypeError::New(env, "Unable get select xkb events");
        }

        auto versionCookie = xcb_randr_query_version(wm->conn, 1, 5);
        auto versionReply = xcb_randr_query_version_reply(wm->conn, versionCookie, nullptr);
        if(!versionReply) {
            throw Napi::TypeError::New(env, "No version reply from randr");
        }

        if (versionReply->major_version != 1 || versionReply->minor_version < 5) {
            free(versionReply);
            throw Napi::TypeError::New(env, "Need at least randr 1.5");
        }

        xcb_randr_select_input(wm->conn, wm->defaultScreen->root, XCB_RANDR_NOTIFY_MASK_OUTPUT_CHANGE);

        wm->randr.event = reply->first_event;
        owm::queryScreens(wm);

        if (wm->screens.empty()) {
            throw Napi::TypeError::New(env, "No screens queried from randr");
        }
    }

    // make our supporting window
    data.ewmhWindow = xcb_generate_id(wm->conn);
    xcb_create_window(wm->conn, XCB_COPY_FROM_PARENT, data.ewmhWindow, wm->defaultScreen->root, -1, -1, 1, 1, 0,
                      XCB_WINDOW_CLASS_INPUT_ONLY, XCB_COPY_FROM_PARENT, XCB_NONE, nullptr);
    xcb_icccm_set_wm_class(wm->conn, data.ewmhWindow, 7, "owm\0Owm");

    xcb_ewmh_set_supporting_wm_check(wm->ewmh, wm->defaultScreen->root, data.ewmhWindow);
    xcb_ewmh_set_supporting_wm_check(wm->ewmh, data.ewmhWindow, data.ewmhWindow);
    xcb_ewmh_set_wm_name(wm->ewmh, data.ewmhWindow, 3, "owm");
    xcb_ewmh_set_wm_pid(wm->ewmh, data.ewmhWindow, getpid());

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("xcb", owm::makeXcb(env, wm));
    obj.Set("xkb", owm::makeXkb(env, wm));
    obj.Set("graphics", graphics::make(env));
    obj.Set("wm", owm::Wrap<std::shared_ptr<owm::WM> >::wrap(env, wm));
    obj.Set("ewmh", Napi::Number::New(env, data.ewmhWindow));

    obj.Set("screens", owm::makeScreens(env, wm));

    Napi::Array arr = Napi::Array::New(env, windows.size());
    for (size_t i = 0; i < windows.size(); ++i) {
        arr.Set(i, owm::makeWindow(env, windows[i]));
    }
    obj.Set("windows", arr);

    // flush out everything before we enter the event loop
    xcb_flush(wm->conn);

    auto handleXcbEvent = [](uv_poll_t* handle, int status, int events) -> void {
        auto wm = data.wm;
        if (!wm) {
            // uuuh, bad!
            return;
        }

        const auto xkbevent = wm->xkb.event;
        const auto randrevent = wm->randr.event;

        for (;;) {
            if (xcb_connection_has_error(wm->conn)) {
                // more badness
                printf("bad conn\n");
                return;
            }
            xcb_generic_event_t *event = xcb_poll_for_event(wm->conn);
            if (!event)
                break;
            if (event->response_type == xkbevent) {
                owm::handleXkb(wm, data.callback, reinterpret_cast<owm::_xkb_event*>(event));
            } else if (event->response_type == randrevent + XCB_RANDR_NOTIFY) {
                // handle this?
            } else if (event->response_type == randrevent + XCB_RANDR_NOTIFY_MASK_OUTPUT_CHANGE) {
                // type xcb_randr_screen_change_notify_event_t
                owm::queryScreens(wm);
                auto env = data.callback.Env();
                Napi::HandleScope scope(env);
                try {
                    napi_value nvalue = owm::makeScreens(env, wm);
                    data.callback.Call({ nvalue });
                } catch (const Napi::Error& e) {
                    printf("handleRandr: exception from js: %s\n%s\n", e.what(), e.Message().c_str());
                }
            } else {
                owm::handleXcb(wm, data.callback, event);
            }
        }
    };

    const int xcbfd = xcb_get_file_descriptor(wm->conn);
    uv_poll_init(loop, &data.pollXcb, xcbfd);
    uv_poll_start(&data.pollXcb, UV_READABLE, handleXcbEvent);

    return obj;
}

void Stop(const Napi::CallbackInfo& info)
{
    auto env = info.Env();

    if (!data.started) {
        throw Napi::TypeError::New(env, "Not started");
    }
    data.started = false;

    xcb_ewmh_connection_wipe(data.wm->ewmh);
    xcb_destroy_window(data.wm->conn, data.ewmhWindow);
    free(data.wm->ewmh);
    xcb_disconnect(data.wm->conn);

    uv_poll_stop(&data.pollXcb);

    uv_close(reinterpret_cast<uv_handle_t*>(&data.asyncFlush), nullptr);
    uv_close(reinterpret_cast<uv_handle_t*>(&data.pollXcb), nullptr);

    data.callback.Reset();
    data.wm.reset();
}

Napi::Object Setup(Napi::Env env, Napi::Object exports)
{
    exports.Set("start", Napi::Function::New(env, Start));
    exports.Set("stop", Napi::Function::New(env, Stop));
    return exports;
}

NODE_API_MODULE(owm_native, Setup)
