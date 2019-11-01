#include "owm.h"
#include <stdlib.h>

namespace owm {

Napi::Value makeButtonPress(napi_env env, xcb_button_press_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("detail", event->detail);
    obj.Set("time", event->time);
    obj.Set("root_x", event->root_x);
    obj.Set("root_y", event->root_y);
    obj.Set("event_x", event->event_x);
    obj.Set("event_y", event->event_y);
    obj.Set("time", event->time);
    obj.Set("root", event->root);
    obj.Set("event", event->event);
    obj.Set("child", event->child);
    obj.Set("state", event->state);
    obj.Set("same_screen", event->same_screen);

    return obj;
}

// appears to be the same structure as xcb_button_press_event_t?
Napi::Value makeMotionNotify(napi_env env, xcb_motion_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("detail", event->detail);
    obj.Set("time", event->time);
    obj.Set("root_x", event->root_x);
    obj.Set("root_y", event->root_y);
    obj.Set("event_x", event->event_x);
    obj.Set("event_y", event->event_y);
    obj.Set("time", event->time);
    obj.Set("root", event->root);
    obj.Set("event", event->event);
    obj.Set("child", event->child);
    obj.Set("state", event->state);
    obj.Set("same_screen", event->same_screen);

    return obj;
}

// appears to be the same structure as xcb_button_press_event_t?
Napi::Value makeEnterNotify(napi_env env, xcb_enter_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("detail", event->detail);
    obj.Set("time", event->time);
    obj.Set("root_x", event->root_x);
    obj.Set("root_y", event->root_y);
    obj.Set("event_x", event->event_x);
    obj.Set("event_y", event->event_y);
    obj.Set("time", event->time);
    obj.Set("root", event->root);
    obj.Set("event", event->event);
    obj.Set("child", event->child);
    obj.Set("state", event->state);
    obj.Set("mode", event->mode);
    obj.Set("same_screen_focus", event->same_screen_focus);

    return obj;
}

Napi::Value makeFocusIn(napi_env env, xcb_focus_in_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("detail", event->detail);
    obj.Set("event", event->event);
    obj.Set("mode", event->mode);

    return obj;
}

Napi::Value makeMapRequest(napi_env env, xcb_map_request_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("parent", event->parent);
    obj.Set("window", event->window);

    return obj;
}

Napi::Value makeUnmapNotify(napi_env env, xcb_unmap_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("event", event->event);
    obj.Set("window", event->window);
    obj.Set("from_configure", event->from_configure);

    return obj;
}

Napi::Value makeMapNotify(napi_env env, xcb_map_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("event", event->event);
    obj.Set("window", event->window);
    obj.Set("override_redirect", event->override_redirect);

    return obj;
}

Napi::Value makeKeymapNotify(napi_env env, xcb_keymap_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);

    uint8_t* ptr = new uint8_t[31];
    memcpy(ptr, event->keys, 31);

    auto array = Napi::ArrayBuffer::New(env, ptr, 31, [](napi_env, void* p) {
        delete[] reinterpret_cast<uint8_t*>(p);
    });

    obj.Set("keys", array);

    return obj;
}

Napi::Value makeExpose(napi_env env, xcb_expose_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("window", event->window);
    obj.Set("x", event->x);
    obj.Set("y", event->y);
    obj.Set("width", event->width);
    obj.Set("height", event->height);
    obj.Set("count", event->count);

    return obj;
}

Napi::Value makeReparentNotify(napi_env env, xcb_reparent_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("event", event->event);
    obj.Set("window", event->window);
    obj.Set("parent", event->parent);
    obj.Set("x", event->x);
    obj.Set("y", event->y);
    obj.Set("override_redirect", event->override_redirect);

    return obj;
}

Napi::Value makeConfigureNotify(napi_env env, xcb_configure_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("event", event->event);
    obj.Set("window", event->window);
    obj.Set("above_sibling", event->above_sibling);
    obj.Set("x", event->x);
    obj.Set("y", event->y);
    obj.Set("width", event->width);
    obj.Set("height", event->height);
    obj.Set("border_width", event->border_width);
    obj.Set("override_redirect", event->override_redirect);

    return obj;
}

Napi::Value makeConfigureRequest(napi_env env, xcb_configure_request_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("stack_mode", event->stack_mode);
    obj.Set("window", event->window);
    obj.Set("parent", event->parent);
    obj.Set("sibling", event->sibling);
    obj.Set("x", event->x);
    obj.Set("y", event->y);
    obj.Set("width", event->width);
    obj.Set("height", event->height);
    obj.Set("border_width", event->border_width);
    obj.Set("value_mask", event->value_mask);

    return obj;
}

Napi::Value makeGravityNotify(napi_env env, xcb_gravity_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("window", event->window);
    obj.Set("event", event->event);
    obj.Set("x", event->x);
    obj.Set("y", event->y);

    return obj;
}

Napi::Value makeResizeRequest(napi_env env, xcb_resize_request_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("window", event->window);
    obj.Set("width", event->width);
    obj.Set("height", event->height);

    return obj;
}

Napi::Value makeCirculateNotify(napi_env env, xcb_circulate_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("window", event->window);
    obj.Set("event", event->event);
    obj.Set("place", event->place);

    return obj;
}

Napi::Value makePropertyNotify(napi_env env, xcb_property_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("window", event->window);
    obj.Set("atom", event->atom);
    obj.Set("time", event->time);
    obj.Set("state", event->state);

    return obj;
}

Napi::Value makeClientMessage(napi_env env, xcb_client_message_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("window", event->window);
    obj.Set("format", event->format);
    obj.Set("type", event->type);

    uint8_t* ptr = new uint8_t[20];
    memcpy(ptr, event->data.data8, 20);

    auto array = Napi::ArrayBuffer::New(env, ptr, 20, [](napi_env, void* p) {
        delete[] reinterpret_cast<uint8_t*>(p);
    });

    obj.Set("data", array);

    return obj;
}

void handleXcb(const std::shared_ptr<WM>& wm, const Napi::ThreadSafeFunction& tsfn, xcb_generic_event_t* event)
{
    auto callback = [](Napi::Env env, Napi::Function js, xcb_generic_event_t* xcb) {
        Napi::Value value;

        const auto type = xcb->response_type & ~0x80;

        switch (type) {
        case XCB_BUTTON_PRESS:
        case XCB_BUTTON_RELEASE: {
            value = makeButtonPress(env, reinterpret_cast<xcb_button_press_event_t*>(xcb));
            break; }
        case XCB_MOTION_NOTIFY: {
            value = makeMotionNotify(env, reinterpret_cast<xcb_motion_notify_event_t*>(xcb));
            break; }
        case XCB_ENTER_NOTIFY:
        case XCB_LEAVE_NOTIFY: {
            value = makeEnterNotify(env, reinterpret_cast<xcb_enter_notify_event_t*>(xcb));
            break; }
        case XCB_FOCUS_IN:
        case XCB_FOCUS_OUT: {
            value = makeFocusIn(env, reinterpret_cast<xcb_focus_in_event_t*>(xcb));
            break; }
        case XCB_KEYMAP_NOTIFY: {
            value = makeKeymapNotify(env, reinterpret_cast<xcb_keymap_notify_event_t*>(xcb));
            break; }
        case XCB_EXPOSE: {
            value = makeExpose(env, reinterpret_cast<xcb_expose_event_t*>(xcb));
            break; }
        case XCB_UNMAP_NOTIFY: {
            value = makeUnmapNotify(env, reinterpret_cast<xcb_unmap_notify_event_t*>(xcb));
            break; }
        case XCB_MAP_REQUEST: {
            value = makeMapRequest(env, reinterpret_cast<xcb_map_request_event_t*>(xcb));
            break; }
        case XCB_MAP_NOTIFY: {
            value = makeMapNotify(env, reinterpret_cast<xcb_map_notify_event_t*>(xcb));
            break; }
        case XCB_REPARENT_NOTIFY: {
            value = makeReparentNotify(env, reinterpret_cast<xcb_reparent_notify_event_t*>(xcb));
            break; }
        case XCB_CONFIGURE_NOTIFY: {
            value = makeConfigureNotify(env, reinterpret_cast<xcb_configure_notify_event_t*>(xcb));
            break; }
        case XCB_CONFIGURE_REQUEST: {
            value = makeConfigureRequest(env, reinterpret_cast<xcb_configure_request_event_t*>(xcb));
            break; }
        case XCB_GRAVITY_NOTIFY: {
            value = makeGravityNotify(env, reinterpret_cast<xcb_gravity_notify_event_t*>(xcb));
            break; }
        case XCB_RESIZE_REQUEST: {
            value = makeResizeRequest(env, reinterpret_cast<xcb_resize_request_event_t*>(xcb));
            break; }
        case XCB_CIRCULATE_NOTIFY:
        case XCB_CIRCULATE_REQUEST: {
            value = makeCirculateNotify(env, reinterpret_cast<xcb_circulate_notify_event_t*>(xcb));
            break; }
        case XCB_PROPERTY_NOTIFY: {
            value = makePropertyNotify(env, reinterpret_cast<xcb_property_notify_event_t*>(xcb));
            break; }
        case XCB_CLIENT_MESSAGE: {
            value = makeClientMessage(env, reinterpret_cast<xcb_client_message_event_t*>(xcb));
            break; }
        }
        free(xcb);

        if (value.IsEmpty()) {
            printf("unhandled xcb type %d\n", type);
            return;
        }

        Napi::Object obj = Napi::Object::New(env);
        obj.Set("type", "xcb");
        obj.Set("xcb", value);

        napi_value nvalue = obj;
        js.Call(1, &nvalue);
    };

    auto status = tsfn.BlockingCall(event, callback);
    if (status != napi_ok) {
        // error?
    }
}

Napi::Value makeXcb(napi_env env)
{
    Napi::Object xcb = Napi::Object::New(env);

    xcb.Set("configure_window", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "configure_window requires two arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        uint32_t window;
        if (!arg.Has("window")) {
            throw Napi::TypeError::New(env, "configure_window requires a window");
        }
        window = arg.Get("window").As<Napi::Number>().Uint32Value();

        uint32_t values[7];
        uint16_t mask = 0;
        uint32_t off = 0;

        if (arg.Has("x")) {
            mask |= XCB_CONFIG_WINDOW_X;
            values[off++] = arg.Get("x").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("y")) {
            mask |= XCB_CONFIG_WINDOW_Y;
            values[off++] = arg.Get("y").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("width")) {
            mask |= XCB_CONFIG_WINDOW_WIDTH;
            values[off++] = arg.Get("width").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("height")) {
            mask |= XCB_CONFIG_WINDOW_HEIGHT;
            values[off++] = arg.Get("height").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("border_width")) {
            mask |= XCB_CONFIG_WINDOW_BORDER_WIDTH;
            values[off++] = arg.Get("border_width").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("sibling")) {
            mask |= XCB_CONFIG_WINDOW_SIBLING;
            values[off++] = arg.Get("sibling").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("stack_mode")) {
            mask |= XCB_CONFIG_WINDOW_STACK_MODE;
            values[off++] = arg.Get("stack_mode").As<Napi::Number>().Uint32Value();
        }

        if (off) {
            xcb_configure_window(wm->conn, window, mask, values);
            xcb_flush(wm->conn);
        }

        return env.Undefined();
    }));

    xcb.Set("intern_atom", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || (!info[1].IsArray() && !info[1].IsString())) {
            throw Napi::TypeError::New(env, "intern_atom requires two arguments");
        }
        bool onlyIfExists = true;
        if (info.Length() < 3 && info[2].IsBoolean()) {
            onlyIfExists = info[2].As<Napi::Boolean>().Value();
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);

        std::vector<xcb_intern_atom_cookie_t> cookies;
        if (info[1].IsString()) {
            const std::string str = info[1].As<Napi::String>();
            cookies.push_back(xcb_intern_atom_unchecked(wm->conn, onlyIfExists, str.size(), str.c_str()));
        } else if (info[1].IsArray()) {
            const auto array = info[1].As<Napi::Array>();
            cookies.reserve(array.Length());
            for (size_t i = 0; i < array.Length(); ++i) {
                const std::string str = array[i].As<Napi::String>();
                cookies.push_back(xcb_intern_atom_unchecked(wm->conn, onlyIfExists, str.size(), str.c_str()));
            }
        }

        Napi::Value val;
        if (cookies.size() == 1) {
            xcb_intern_atom_reply_t* reply = xcb_intern_atom_reply(wm->conn, cookies[0], nullptr);
            val = Napi::Number::New(env, reply->atom);
            free(reply);
        } else {
            const size_t sz = cookies.size();
            Napi::Array ret = Napi::Array::New(env, sz);
            for (size_t i = 0; i < sz; ++i) {
                xcb_intern_atom_reply_t* reply = xcb_intern_atom_reply(wm->conn, cookies[i], nullptr);
                ret.Set(i, Napi::Number::New(env, reply->atom));
                free(reply);
            }
            val = ret;
        }
        return val;
    }));

    Napi::Object atoms = Napi::Object::New(env);
    atoms.Set("NONE", Napi::Number::New(env, XCB_ATOM_NONE));
    atoms.Set("ANY", Napi::Number::New(env, XCB_ATOM_ANY));
    atoms.Set("PRIMARY", Napi::Number::New(env, XCB_ATOM_PRIMARY));
    atoms.Set("SECONDARY", Napi::Number::New(env, XCB_ATOM_SECONDARY));
    atoms.Set("ARC", Napi::Number::New(env, XCB_ATOM_ARC));
    atoms.Set("ATOM", Napi::Number::New(env, XCB_ATOM_ATOM));
    atoms.Set("BITMAP", Napi::Number::New(env, XCB_ATOM_BITMAP));
    atoms.Set("CARDINAL", Napi::Number::New(env, XCB_ATOM_CARDINAL));
    atoms.Set("COLORMAP", Napi::Number::New(env, XCB_ATOM_COLORMAP));
    atoms.Set("CURSOR", Napi::Number::New(env, XCB_ATOM_CURSOR));
    atoms.Set("CUT_BUFFER0", Napi::Number::New(env, XCB_ATOM_CUT_BUFFER0));
    atoms.Set("CUT_BUFFER1", Napi::Number::New(env, XCB_ATOM_CUT_BUFFER1));
    atoms.Set("CUT_BUFFER2", Napi::Number::New(env, XCB_ATOM_CUT_BUFFER2));
    atoms.Set("CUT_BUFFER3", Napi::Number::New(env, XCB_ATOM_CUT_BUFFER3));
    atoms.Set("CUT_BUFFER4", Napi::Number::New(env, XCB_ATOM_CUT_BUFFER4));
    atoms.Set("CUT_BUFFER5", Napi::Number::New(env, XCB_ATOM_CUT_BUFFER5));
    atoms.Set("CUT_BUFFER6", Napi::Number::New(env, XCB_ATOM_CUT_BUFFER6));
    atoms.Set("CUT_BUFFER7", Napi::Number::New(env, XCB_ATOM_CUT_BUFFER7));
    atoms.Set("DRAWABLE", Napi::Number::New(env, XCB_ATOM_DRAWABLE));
    atoms.Set("FONT", Napi::Number::New(env, XCB_ATOM_FONT));
    atoms.Set("INTEGER", Napi::Number::New(env, XCB_ATOM_INTEGER));
    atoms.Set("PIXMAP", Napi::Number::New(env, XCB_ATOM_PIXMAP));
    atoms.Set("POINT", Napi::Number::New(env, XCB_ATOM_POINT));
    atoms.Set("RECTANGLE", Napi::Number::New(env, XCB_ATOM_RECTANGLE));
    atoms.Set("RESOURCE_MANAGER", Napi::Number::New(env, XCB_ATOM_RESOURCE_MANAGER));
    atoms.Set("RGB_COLOR_MAP", Napi::Number::New(env, XCB_ATOM_RGB_COLOR_MAP));
    atoms.Set("RGB_BEST_MAP", Napi::Number::New(env, XCB_ATOM_RGB_BEST_MAP));
    atoms.Set("RGB_BLUE_MAP", Napi::Number::New(env, XCB_ATOM_RGB_BLUE_MAP));
    atoms.Set("RGB_DEFAULT_MAP", Napi::Number::New(env, XCB_ATOM_RGB_DEFAULT_MAP));
    atoms.Set("RGB_GRAY_MAP", Napi::Number::New(env, XCB_ATOM_RGB_GRAY_MAP));
    atoms.Set("RGB_GREEN_MAP", Napi::Number::New(env, XCB_ATOM_RGB_GREEN_MAP));
    atoms.Set("RGB_RED_MAP", Napi::Number::New(env, XCB_ATOM_RGB_RED_MAP));
    atoms.Set("STRING", Napi::Number::New(env, XCB_ATOM_STRING));
    atoms.Set("VISUALID", Napi::Number::New(env, XCB_ATOM_VISUALID));
    atoms.Set("WINDOW", Napi::Number::New(env, XCB_ATOM_WINDOW));
    atoms.Set("WM_COMMAND", Napi::Number::New(env, XCB_ATOM_WM_COMMAND));
    atoms.Set("WM_HINTS", Napi::Number::New(env, XCB_ATOM_WM_HINTS));
    atoms.Set("WM_CLIENT_MACHINE", Napi::Number::New(env, XCB_ATOM_WM_CLIENT_MACHINE));
    atoms.Set("WM_ICON_NAME", Napi::Number::New(env, XCB_ATOM_WM_ICON_NAME));
    atoms.Set("WM_ICON_SIZE", Napi::Number::New(env, XCB_ATOM_WM_ICON_SIZE));
    atoms.Set("WM_NAME", Napi::Number::New(env, XCB_ATOM_WM_NAME));
    atoms.Set("WM_NORMAL_HINTS", Napi::Number::New(env, XCB_ATOM_WM_NORMAL_HINTS));
    atoms.Set("WM_SIZE_HINTS", Napi::Number::New(env, XCB_ATOM_WM_SIZE_HINTS));
    atoms.Set("WM_ZOOM_HINTS", Napi::Number::New(env, XCB_ATOM_WM_ZOOM_HINTS));
    atoms.Set("MIN_SPACE", Napi::Number::New(env, XCB_ATOM_MIN_SPACE));
    atoms.Set("NORM_SPACE", Napi::Number::New(env, XCB_ATOM_NORM_SPACE));
    atoms.Set("MAX_SPACE", Napi::Number::New(env, XCB_ATOM_MAX_SPACE));
    atoms.Set("END_SPACE", Napi::Number::New(env, XCB_ATOM_END_SPACE));
    atoms.Set("SUPERSCRIPT_X", Napi::Number::New(env, XCB_ATOM_SUPERSCRIPT_X));
    atoms.Set("SUPERSCRIPT_Y", Napi::Number::New(env, XCB_ATOM_SUPERSCRIPT_Y));
    atoms.Set("SUBSCRIPT_X", Napi::Number::New(env, XCB_ATOM_SUBSCRIPT_X));
    atoms.Set("SUBSCRIPT_Y", Napi::Number::New(env, XCB_ATOM_SUBSCRIPT_Y));
    atoms.Set("UNDERLINE_POSITION", Napi::Number::New(env, XCB_ATOM_UNDERLINE_POSITION));
    atoms.Set("UNDERLINE_THICKNESS", Napi::Number::New(env, XCB_ATOM_UNDERLINE_THICKNESS));
    atoms.Set("STRIKEOUT_ASCENT", Napi::Number::New(env, XCB_ATOM_STRIKEOUT_ASCENT));
    atoms.Set("STRIKEOUT_DESCENT", Napi::Number::New(env, XCB_ATOM_STRIKEOUT_DESCENT));
    atoms.Set("ITALIC_ANGLE", Napi::Number::New(env, XCB_ATOM_ITALIC_ANGLE));
    atoms.Set("X_HEIGHT", Napi::Number::New(env, XCB_ATOM_X_HEIGHT));
    atoms.Set("QUAD_WIDTH", Napi::Number::New(env, XCB_ATOM_QUAD_WIDTH));
    atoms.Set("WEIGHT", Napi::Number::New(env, XCB_ATOM_WEIGHT));
    atoms.Set("POINT_SIZE", Napi::Number::New(env, XCB_ATOM_POINT_SIZE));
    atoms.Set("RESOLUTION", Napi::Number::New(env, XCB_ATOM_RESOLUTION));
    atoms.Set("COPYRIGHT", Napi::Number::New(env, XCB_ATOM_COPYRIGHT));
    atoms.Set("NOTICE", Napi::Number::New(env, XCB_ATOM_NOTICE));
    atoms.Set("FONT_NAME", Napi::Number::New(env, XCB_ATOM_FONT_NAME));
    atoms.Set("FAMILY_NAME", Napi::Number::New(env, XCB_ATOM_FAMILY_NAME));
    atoms.Set("FULL_NAME", Napi::Number::New(env, XCB_ATOM_FULL_NAME));
    atoms.Set("CAP_HEIGHT", Napi::Number::New(env, XCB_ATOM_CAP_HEIGHT));
    atoms.Set("WM_CLASS", Napi::Number::New(env, XCB_ATOM_WM_CLASS));
    atoms.Set("WM_TRANSIENT_FOR", Napi::Number::New(env, XCB_ATOM_WM_TRANSIENT_FOR));
    xcb.Set("atoms", atoms);

    return xcb;
}

} // namespace owm
