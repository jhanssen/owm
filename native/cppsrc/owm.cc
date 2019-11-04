#include "owm.h"
#include <stdlib.h>

namespace owm {

static Napi::Value makeButtonPress(napi_env env, xcb_button_press_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("detail", event->detail);
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
static Napi::Value makeMotionNotify(napi_env env, xcb_motion_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("detail", event->detail);
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

static Napi::Value makeKeyPress(napi_env env, xcb_key_press_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("detail", event->detail);
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
static Napi::Value makeEnterNotify(napi_env env, xcb_enter_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("detail", event->detail);
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

static Napi::Value makeFocusIn(napi_env env, xcb_focus_in_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("detail", event->detail);
    obj.Set("event", event->event);
    obj.Set("mode", event->mode);

    return obj;
}

static Napi::Value makeMapRequest(napi_env env, xcb_map_request_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("parent", event->parent);
    obj.Set("window", event->window);

    return obj;
}

static Napi::Value makeUnmapNotify(napi_env env, xcb_unmap_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("event", event->event);
    obj.Set("window", event->window);
    obj.Set("from_configure", event->from_configure);

    return obj;
}

static Napi::Value makeMapNotify(napi_env env, xcb_map_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("event", event->event);
    obj.Set("window", event->window);
    obj.Set("override_redirect", event->override_redirect);

    return obj;
}

static Napi::Value makeKeymapNotify(napi_env env, xcb_keymap_notify_event_t* event)
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

static Napi::Value makeExpose(napi_env env, xcb_expose_event_t* event)
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

static Napi::Value makeReparentNotify(napi_env env, xcb_reparent_notify_event_t* event)
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

static Napi::Value makeConfigureNotify(napi_env env, xcb_configure_notify_event_t* event)
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

static Napi::Value makeConfigureRequest(napi_env env, xcb_configure_request_event_t* event)
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

static Napi::Value makeGravityNotify(napi_env env, xcb_gravity_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("window", event->window);
    obj.Set("event", event->event);
    obj.Set("x", event->x);
    obj.Set("y", event->y);

    return obj;
}

static Napi::Value makeResizeRequest(napi_env env, xcb_resize_request_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("window", event->window);
    obj.Set("width", event->width);
    obj.Set("height", event->height);

    return obj;
}

static Napi::Value makeCirculateNotify(napi_env env, xcb_circulate_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("window", event->window);
    obj.Set("event", event->event);
    obj.Set("place", event->place);

    return obj;
}

static Napi::Value makePropertyNotify(napi_env env, xcb_property_notify_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("window", event->window);
    obj.Set("atom", event->atom);
    obj.Set("time", event->time);
    obj.Set("state", event->state);

    return obj;
}

static Napi::Value makeClientMessage(napi_env env, xcb_client_message_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("window", event->window);
    obj.Set("format", event->format);
    obj.Set("messageType", event->type);

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

        bool log = true;

        switch (type) {
        case XCB_BUTTON_PRESS:
        case XCB_BUTTON_RELEASE: {
            value = makeButtonPress(env, reinterpret_cast<xcb_button_press_event_t*>(xcb));
            break; }
        case XCB_MOTION_NOTIFY: {
            value = makeMotionNotify(env, reinterpret_cast<xcb_motion_notify_event_t*>(xcb));
            break; }
        case XCB_KEY_PRESS:
        case XCB_KEY_RELEASE: {
            value = makeKeyPress(env, reinterpret_cast<xcb_key_press_event_t*>(xcb));
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
        case XCB_CREATE_NOTIFY:
            // we don't care about these
            log = false;
            break;
        }
        free(xcb);

        if (value.IsEmpty()) {
            if (log)
                printf("unhandled xcb type %d\n", type);
            return;
        }

        Napi::Object obj = Napi::Object::New(env);
        obj.Set("type", "xcb");
        obj.Set("xcb", value);

        try {
            napi_value nvalue = obj;
            js.Call(1, &nvalue);
        } catch (const Napi::Error& e) {
            printf("exception from js: %s\n", e.what());
        }
    };

    auto status = tsfn.BlockingCall(event, callback);
    if (status != napi_ok) {
        // error?
    }
}

static Napi::Object initAtoms(napi_env env, const std::shared_ptr<WM>& wm)
{
    Napi::Object atoms = Napi::Object::New(env);

    for (const auto& a : wm->atoms) {
        atoms.Set(a.first, Napi::Number::New(env, a.second));
    }

    return atoms;
}

Napi::Value makeWindow(napi_env env, const Window& win)
{
    Napi::Object nwin = Napi::Object::New(env);

    auto makeAtomArray = [&env](const std::vector<xcb_atom_t>& atoms) -> Napi::Array {
        const size_t sz = atoms.size();
        Napi::Array arr = Napi::Array::New(env, sz);
        for (size_t i = 0; i < sz; ++i) {
            arr.Set(i, atoms[i]);
        }
        return arr;
    };

    nwin.Set("window", Napi::Number::New(env, win.window));
    nwin.Set("pid", Napi::Number::New(env, win.pid));
    nwin.Set("transientFor", Napi::Number::New(env, win.transientFor));
    nwin.Set("leader", Napi::Number::New(env, win.leader));
    nwin.Set("wmName", Napi::String::New(env, win.wmName));
    nwin.Set("wmProtocols", makeAtomArray(win.wmProtocols));
    nwin.Set("ewmhState", makeAtomArray(win.ewmhState));
    nwin.Set("ewmhWindowType", makeAtomArray(win.ewmhWindowType));

    Napi::Object nattributes = Napi::Object::New(env);
    nattributes.Set("bit_gravity", Napi::Number::New(env, win.attributes.bit_gravity));
    nattributes.Set("win_gravity", Napi::Number::New(env, win.attributes.win_gravity));
    nattributes.Set("map_state", Napi::Number::New(env, win.attributes.map_state));
    nattributes.Set("override_redirect", Napi::Number::New(env, win.attributes.override_redirect));
    nattributes.Set("all_event_masks", Napi::Number::New(env, win.attributes.all_event_masks));
    nattributes.Set("your_event_mask", Napi::Number::New(env, win.attributes.your_event_mask));
    nattributes.Set("do_not_propagate_mask", Napi::Number::New(env, win.attributes.do_not_propagate_mask));
    nwin.Set("attributes", nattributes);

    Napi::Object ngeometry = Napi::Object::New(env);
    ngeometry.Set("root", Napi::Number::New(env, win.geometry.root));
    ngeometry.Set("x", Napi::Number::New(env, win.geometry.x));
    ngeometry.Set("y", Napi::Number::New(env, win.geometry.y));
    ngeometry.Set("width", Napi::Number::New(env, win.geometry.width));
    ngeometry.Set("height", Napi::Number::New(env, win.geometry.height));
    ngeometry.Set("border_width", Napi::Number::New(env, win.geometry.border_width));
    nwin.Set("geometry", ngeometry);

    Napi::Object nsizehints = Napi::Object::New(env);
    nsizehints.Set("flags", Napi::Number::New(env, win.normalHints.flags));
    nsizehints.Set("x", Napi::Number::New(env, win.normalHints.x));
    nsizehints.Set("y", Napi::Number::New(env, win.normalHints.y));
    nsizehints.Set("width", Napi::Number::New(env, win.normalHints.width));
    nsizehints.Set("height", Napi::Number::New(env, win.normalHints.height));
    nsizehints.Set("min_width", Napi::Number::New(env, win.normalHints.min_width));
    nsizehints.Set("min_height", Napi::Number::New(env, win.normalHints.min_height));
    nsizehints.Set("max_width", Napi::Number::New(env, win.normalHints.max_width));
    nsizehints.Set("max_height", Napi::Number::New(env, win.normalHints.max_height));
    nsizehints.Set("width_inc", Napi::Number::New(env, win.normalHints.width_inc));
    nsizehints.Set("height_inc", Napi::Number::New(env, win.normalHints.height_inc));
    nsizehints.Set("min_aspect_num", Napi::Number::New(env, win.normalHints.min_aspect_num));
    nsizehints.Set("min_aspect_den", Napi::Number::New(env, win.normalHints.min_aspect_den));
    nsizehints.Set("max_aspect_num", Napi::Number::New(env, win.normalHints.max_aspect_num));
    nsizehints.Set("max_aspect_den", Napi::Number::New(env, win.normalHints.max_aspect_den));
    nsizehints.Set("base_width", Napi::Number::New(env, win.normalHints.base_width));
    nsizehints.Set("base_height", Napi::Number::New(env, win.normalHints.base_height));
    nsizehints.Set("win_gravity", Napi::Number::New(env, win.normalHints.win_gravity));
    nwin.Set("normalHints", nsizehints);

    Napi::Object nwmhints = Napi::Object::New(env);
    nwmhints.Set("flags", Napi::Number::New(env, win.wmHints.flags));
    nwmhints.Set("input", Napi::Number::New(env, win.wmHints.input));
    nwmhints.Set("initial_state", Napi::Number::New(env, win.wmHints.initial_state));
    nwmhints.Set("icon_pixmap", Napi::Number::New(env, win.wmHints.icon_pixmap));
    nwmhints.Set("icon_window", Napi::Number::New(env, win.wmHints.icon_window));
    nwmhints.Set("icon_x", Napi::Number::New(env, win.wmHints.icon_x));
    nwmhints.Set("icon_y", Napi::Number::New(env, win.wmHints.icon_y));
    nwmhints.Set("icon_mask", Napi::Number::New(env, win.wmHints.icon_mask));
    nwmhints.Set("window_group", Napi::Number::New(env, win.wmHints.window_group));
    nwin.Set("wmHints", nwmhints);

    Napi::Object nwmclass = Napi::Object::New(env);
    nwmclass.Set("instance_name", Napi::String::New(env, win.wmClass.instance_name));
    nwmclass.Set("class_name", Napi::String::New(env, win.wmClass.class_name));
    nwin.Set("wmClass", nwmclass);

    Napi::Object newmhexts = Napi::Object::New(env);
    newmhexts.Set("left", Napi::Number::New(env, win.ewmhStrut.left));
    newmhexts.Set("right", Napi::Number::New(env, win.ewmhStrut.right));
    newmhexts.Set("top", Napi::Number::New(env, win.ewmhStrut.top));
    newmhexts.Set("bottom", Napi::Number::New(env, win.ewmhStrut.bottom));
    nwin.Set("ewmhStrut", newmhexts);

    Napi::Object newmhstrutpartial = Napi::Object::New(env);
    newmhstrutpartial.Set("left", Napi::Number::New(env, win.ewmhStrutPartial.left));
    newmhstrutpartial.Set("right", Napi::Number::New(env, win.ewmhStrutPartial.right));
    newmhstrutpartial.Set("top", Napi::Number::New(env, win.ewmhStrutPartial.top));
    newmhstrutpartial.Set("bottom", Napi::Number::New(env, win.ewmhStrutPartial.bottom));
    newmhstrutpartial.Set("left_start_y", Napi::Number::New(env, win.ewmhStrutPartial.left_start_y));
    newmhstrutpartial.Set("left_end_y", Napi::Number::New(env, win.ewmhStrutPartial.left_end_y));
    newmhstrutpartial.Set("right_start_y", Napi::Number::New(env, win.ewmhStrutPartial.right_start_y));
    newmhstrutpartial.Set("right_end_y", Napi::Number::New(env, win.ewmhStrutPartial.right_end_y));
    newmhstrutpartial.Set("top_start_x", Napi::Number::New(env, win.ewmhStrutPartial.top_start_x));
    newmhstrutpartial.Set("top_end_x", Napi::Number::New(env, win.ewmhStrutPartial.top_end_x));
    newmhstrutpartial.Set("bottom_start_x", Napi::Number::New(env, win.ewmhStrutPartial.bottom_start_x));
    newmhstrutpartial.Set("bottom_end_x", Napi::Number::New(env, win.ewmhStrutPartial.bottom_end_x));
    nwin.Set("ewmhStrutPartial", newmhstrutpartial);

    return nwin;
}

static Napi::Object initEvents(napi_env env, const std::shared_ptr<WM>& wm)
{
    Napi::Object events = Napi::Object::New(env);

    events.Set("KEY_PRESS", Napi::Number::New(env, XCB_KEY_PRESS));
    events.Set("KEY_RELEASE", Napi::Number::New(env, XCB_KEY_RELEASE));
    events.Set("BUTTON_PRESS", Napi::Number::New(env, XCB_BUTTON_PRESS));
    events.Set("BUTTON_RELEASE", Napi::Number::New(env, XCB_BUTTON_RELEASE));
    events.Set("MOTION_NOTIFY", Napi::Number::New(env, XCB_MOTION_NOTIFY));
    events.Set("ENTER_NOTIFY", Napi::Number::New(env, XCB_ENTER_NOTIFY));
    events.Set("LEAVE_NOTIFY", Napi::Number::New(env, XCB_LEAVE_NOTIFY));
    events.Set("FOCUS_IN", Napi::Number::New(env, XCB_FOCUS_IN));
    events.Set("FOCUS_OUT", Napi::Number::New(env, XCB_FOCUS_OUT));
    events.Set("KEYMAP_NOTIFY", Napi::Number::New(env, XCB_KEYMAP_NOTIFY));
    events.Set("EXPOSE", Napi::Number::New(env, XCB_EXPOSE));
    events.Set("GRAPHICS_EXPOSURE", Napi::Number::New(env, XCB_GRAPHICS_EXPOSURE));
    events.Set("NO_EXPOSURE", Napi::Number::New(env, XCB_NO_EXPOSURE));
    events.Set("VISIBILITY_NOTIFY", Napi::Number::New(env, XCB_VISIBILITY_NOTIFY));
    events.Set("CREATE_NOTIFY", Napi::Number::New(env, XCB_CREATE_NOTIFY));
    events.Set("DESTROY_NOTIFY", Napi::Number::New(env, XCB_DESTROY_NOTIFY));
    events.Set("UNMAP_NOTIFY", Napi::Number::New(env, XCB_UNMAP_NOTIFY));
    events.Set("MAP_NOTIFY", Napi::Number::New(env, XCB_MAP_NOTIFY));
    events.Set("MAP_REQUEST", Napi::Number::New(env, XCB_MAP_REQUEST));
    events.Set("REPARENT_NOTIFY", Napi::Number::New(env, XCB_REPARENT_NOTIFY));
    events.Set("CONFIGURE_NOTIFY", Napi::Number::New(env, XCB_CONFIGURE_NOTIFY));
    events.Set("CONFIGURE_REQUEST", Napi::Number::New(env, XCB_CONFIGURE_REQUEST));
    events.Set("GRAVITY_NOTIFY", Napi::Number::New(env, XCB_GRAVITY_NOTIFY));
    events.Set("RESIZE_REQUEST", Napi::Number::New(env, XCB_RESIZE_REQUEST));
    events.Set("CIRCULATE_NOTIFY", Napi::Number::New(env, XCB_CIRCULATE_NOTIFY));
    events.Set("CIRCULATE_REQUEST", Napi::Number::New(env, XCB_CIRCULATE_REQUEST));
    events.Set("PROPERTY_NOTIFY", Napi::Number::New(env, XCB_PROPERTY_NOTIFY));
    events.Set("SELECTION_CLEAR", Napi::Number::New(env, XCB_SELECTION_CLEAR));
    events.Set("SELECTION_REQUEST", Napi::Number::New(env, XCB_SELECTION_REQUEST));
    events.Set("SELECTION_NOTIFY", Napi::Number::New(env, XCB_SELECTION_NOTIFY));
    events.Set("COLORMAP_NOTIFY", Napi::Number::New(env, XCB_COLORMAP_NOTIFY));
    events.Set("CLIENT_MESSAGE", Napi::Number::New(env, XCB_CLIENT_MESSAGE));
    events.Set("MAPPING_NOTIFY", Napi::Number::New(env, XCB_MAPPING_NOTIFY));

    return events;
}

static Napi::Object initEventMasks(napi_env env, const std::shared_ptr<WM>& wm)
{
    Napi::Object masks = Napi::Object::New(env);

    masks.Set("NO_EVENT", Napi::Number::New(env, XCB_EVENT_MASK_NO_EVENT));
    masks.Set("KEY_PRESS", Napi::Number::New(env, XCB_EVENT_MASK_KEY_PRESS));
    masks.Set("KEY_RELEASE", Napi::Number::New(env, XCB_EVENT_MASK_KEY_RELEASE));
    masks.Set("BUTTON_PRESS", Napi::Number::New(env, XCB_EVENT_MASK_BUTTON_PRESS));
    masks.Set("BUTTON_RELEASE", Napi::Number::New(env, XCB_EVENT_MASK_BUTTON_RELEASE));
    masks.Set("ENTER_WINDOW", Napi::Number::New(env, XCB_EVENT_MASK_ENTER_WINDOW));
    masks.Set("LEAVE_WINDOW", Napi::Number::New(env, XCB_EVENT_MASK_LEAVE_WINDOW));
    masks.Set("POINTER_MOTION", Napi::Number::New(env, XCB_EVENT_MASK_POINTER_MOTION));
    masks.Set("POINTER_MOTION_HINT", Napi::Number::New(env, XCB_EVENT_MASK_POINTER_MOTION_HINT));
    masks.Set("BUTTON_1_MOTION", Napi::Number::New(env, XCB_EVENT_MASK_BUTTON_1_MOTION));
    masks.Set("BUTTON_2_MOTION", Napi::Number::New(env, XCB_EVENT_MASK_BUTTON_2_MOTION));
    masks.Set("BUTTON_3_MOTION", Napi::Number::New(env, XCB_EVENT_MASK_BUTTON_3_MOTION));
    masks.Set("BUTTON_4_MOTION", Napi::Number::New(env, XCB_EVENT_MASK_BUTTON_4_MOTION));
    masks.Set("BUTTON_5_MOTION", Napi::Number::New(env, XCB_EVENT_MASK_BUTTON_5_MOTION));
    masks.Set("BUTTON_MOTION", Napi::Number::New(env, XCB_EVENT_MASK_BUTTON_MOTION));
    masks.Set("KEYMAP_STATE", Napi::Number::New(env, XCB_EVENT_MASK_KEYMAP_STATE));
    masks.Set("EXPOSURE", Napi::Number::New(env, XCB_EVENT_MASK_EXPOSURE));
    masks.Set("VISIBILITY_CHANGE", Napi::Number::New(env, XCB_EVENT_MASK_VISIBILITY_CHANGE));
    masks.Set("STRUCTURE_NOTIFY", Napi::Number::New(env, XCB_EVENT_MASK_STRUCTURE_NOTIFY));
    masks.Set("RESIZE_REDIRECT", Napi::Number::New(env, XCB_EVENT_MASK_RESIZE_REDIRECT));
    masks.Set("SUBSTRUCTURE_NOTIFY", Napi::Number::New(env, XCB_EVENT_MASK_SUBSTRUCTURE_NOTIFY));
    masks.Set("SUBSTRUCTURE_REDIRECT", Napi::Number::New(env, XCB_EVENT_MASK_SUBSTRUCTURE_REDIRECT));
    masks.Set("FOCUS_CHANGE", Napi::Number::New(env, XCB_EVENT_MASK_FOCUS_CHANGE));
    masks.Set("PROPERTY_CHANGE", Napi::Number::New(env, XCB_EVENT_MASK_PROPERTY_CHANGE));
    masks.Set("COLOR_MAP_CHANGE", Napi::Number::New(env, XCB_EVENT_MASK_COLOR_MAP_CHANGE));
    masks.Set("OWNER_GRAB_BUTTON", Napi::Number::New(env, XCB_EVENT_MASK_OWNER_GRAB_BUTTON));

    return masks;
}

static Napi::Object initPropModes(napi_env env, const std::shared_ptr<WM>& wm)
{
    Napi::Object modes = Napi::Object::New(env);

    modes.Set("REPLACE", Napi::Number::New(env, XCB_PROP_MODE_REPLACE));
    modes.Set("PREPEND", Napi::Number::New(env, XCB_PROP_MODE_PREPEND));
    modes.Set("APPEND", Napi::Number::New(env, XCB_PROP_MODE_APPEND));

    return modes;
}

static Napi::Object initInputFocus(napi_env env, const std::shared_ptr<WM>& wm)
{
    Napi::Object focus = Napi::Object::New(env);

    focus.Set("NONE", Napi::Number::New(env, XCB_INPUT_FOCUS_NONE));
    focus.Set("POINTER_ROOT", Napi::Number::New(env, XCB_INPUT_FOCUS_POINTER_ROOT));
    focus.Set("FOCUS_PARENT", Napi::Number::New(env, XCB_INPUT_FOCUS_PARENT));
    focus.Set("FOLLOWS_KEYBOARD", Napi::Number::New(env, XCB_INPUT_FOCUS_FOLLOW_KEYBOARD));

    return focus;
}

static Napi::Object initIcccm(napi_env env, const std::shared_ptr<WM>& wm)
{
    Napi::Object icccm = Napi::Object::New(env);

    Napi::Object hint = Napi::Object::New(env);
    hint.Set("INPUT", Napi::Number::New(env, XCB_ICCCM_WM_HINT_INPUT));
    hint.Set("STATE", Napi::Number::New(env, XCB_ICCCM_WM_HINT_STATE));
    hint.Set("ICON_PIXMAP", Napi::Number::New(env, XCB_ICCCM_WM_HINT_ICON_PIXMAP));
    hint.Set("ICON_WINDOW", Napi::Number::New(env, XCB_ICCCM_WM_HINT_ICON_WINDOW));
    hint.Set("ICON_POSITION", Napi::Number::New(env, XCB_ICCCM_WM_HINT_ICON_POSITION));
    hint.Set("ICON_MASK", Napi::Number::New(env, XCB_ICCCM_WM_HINT_ICON_MASK));
    hint.Set("WINDOW_GROUP", Napi::Number::New(env, XCB_ICCCM_WM_HINT_WINDOW_GROUP));
    hint.Set("X_URGENCY", Napi::Number::New(env, XCB_ICCCM_WM_HINT_X_URGENCY));
    icccm.Set("hint", hint);

    Napi::Object sizeHint = Napi::Object::New(env);
    sizeHint.Set("US_POSITION", Napi::Number::New(env, XCB_ICCCM_SIZE_HINT_US_POSITION));
    sizeHint.Set("US_SIZE", Napi::Number::New(env, XCB_ICCCM_SIZE_HINT_US_SIZE));
    sizeHint.Set("P_POSITION", Napi::Number::New(env, XCB_ICCCM_SIZE_HINT_P_POSITION));
    sizeHint.Set("P_SIZE", Napi::Number::New(env, XCB_ICCCM_SIZE_HINT_P_SIZE));
    sizeHint.Set("P_MIN_SIZE", Napi::Number::New(env, XCB_ICCCM_SIZE_HINT_P_MIN_SIZE));
    sizeHint.Set("P_MAX_SIZE", Napi::Number::New(env, XCB_ICCCM_SIZE_HINT_P_MAX_SIZE));
    sizeHint.Set("P_RESIZE_INC", Napi::Number::New(env, XCB_ICCCM_SIZE_HINT_P_RESIZE_INC));
    sizeHint.Set("P_ASPECT", Napi::Number::New(env, XCB_ICCCM_SIZE_HINT_P_ASPECT));
    sizeHint.Set("BASE_SIZE", Napi::Number::New(env, XCB_ICCCM_SIZE_HINT_BASE_SIZE));
    sizeHint.Set("P_WIN_GRAVITY", Napi::Number::New(env, XCB_ICCCM_SIZE_HINT_P_WIN_GRAVITY));
    icccm.Set("sizeHint", sizeHint);

    Napi::Object state = Napi::Object::New(env);
    state.Set("WITHDRAWN", Napi::Number::New(env, XCB_ICCCM_WM_STATE_WITHDRAWN));
    state.Set("NORMAL", Napi::Number::New(env, XCB_ICCCM_WM_STATE_NORMAL));
    state.Set("ICONIC", Napi::Number::New(env, XCB_ICCCM_WM_STATE_ICONIC));
    icccm.Set("state", state);

    return icccm;
}

static Napi::Object initEwmh(napi_env env, const std::shared_ptr<WM>& wm)
{
    Napi::Object ewmh = Napi::Object::New(env);

    Napi::Object clientSourceType = Napi::Object::New(env);
    clientSourceType.Set("NONE", Napi::Number::New(env, XCB_EWMH_CLIENT_SOURCE_TYPE_NONE));
    clientSourceType.Set("NORMAL", Napi::Number::New(env, XCB_EWMH_CLIENT_SOURCE_TYPE_NORMAL));
    clientSourceType.Set("OTHER", Napi::Number::New(env, XCB_EWMH_CLIENT_SOURCE_TYPE_OTHER));
    ewmh.Set("clientSourceType", clientSourceType);

    Napi::Object desktopLayoutOrientation = Napi::Object::New(env);
    desktopLayoutOrientation.Set("HORZ", Napi::Number::New(env, XCB_EWMH_WM_ORIENTATION_HORZ));
    desktopLayoutOrientation.Set("VERT", Napi::Number::New(env, XCB_EWMH_WM_ORIENTATION_VERT));
    ewmh.Set("desktopLayoutOrientation", desktopLayoutOrientation);

    Napi::Object desktopLayoutStartingCorner = Napi::Object::New(env);
    desktopLayoutStartingCorner.Set("TOPLEFT", Napi::Number::New(env, XCB_EWMH_WM_TOPLEFT));
    desktopLayoutStartingCorner.Set("TOPRIGHT", Napi::Number::New(env, XCB_EWMH_WM_TOPRIGHT));
    desktopLayoutStartingCorner.Set("BOTTOMRIGHT", Napi::Number::New(env, XCB_EWMH_WM_BOTTOMRIGHT));
    desktopLayoutStartingCorner.Set("BOTTOMLEFT", Napi::Number::New(env, XCB_EWMH_WM_BOTTOMLEFT));
    ewmh.Set("desktopLayoutStartingCorner", desktopLayoutStartingCorner);

    Napi::Object moveResizeWindow = Napi::Object::New(env);
    moveResizeWindow.Set("X", Napi::Number::New(env, XCB_EWMH_MOVERESIZE_WINDOW_X));
    moveResizeWindow.Set("Y", Napi::Number::New(env, XCB_EWMH_MOVERESIZE_WINDOW_Y));
    moveResizeWindow.Set("WIDTH", Napi::Number::New(env, XCB_EWMH_MOVERESIZE_WINDOW_WIDTH));
    moveResizeWindow.Set("HEIGHT", Napi::Number::New(env, XCB_EWMH_MOVERESIZE_WINDOW_HEIGHT));
    ewmh.Set("moveResizeWindow", moveResizeWindow);

    Napi::Object moveResizeDirection = Napi::Object::New(env);
    moveResizeDirection.Set("SIZE_TOPLEFT", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_SIZE_TOPLEFT));
    moveResizeDirection.Set("SIZE_TOP", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_SIZE_TOP));
    moveResizeDirection.Set("SIZE_TOPRIGHT", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_SIZE_TOPRIGHT));
    moveResizeDirection.Set("SIZE_RIGHT", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_SIZE_RIGHT));
    moveResizeDirection.Set("SIZE_BOTTOMRIGHT", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_SIZE_BOTTOMRIGHT));
    moveResizeDirection.Set("SIZE_BOTTOM", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_SIZE_BOTTOM));
    moveResizeDirection.Set("SIZE_BOTTOMLEFT", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_SIZE_BOTTOMLEFT));
    moveResizeDirection.Set("SIZE_LEFT", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_SIZE_LEFT));
    moveResizeDirection.Set("MOVE", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_MOVE));
    moveResizeDirection.Set("SIZE_KEYBOARD", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_SIZE_KEYBOARD));
    moveResizeDirection.Set("MOVE_KEYBOARD", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_MOVE_KEYBOARD));
    moveResizeDirection.Set("CANCEL", Napi::Number::New(env, XCB_EWMH_WM_MOVERESIZE_CANCEL));
    ewmh.Set("moveResizeDirection", moveResizeDirection);

    Napi::Object wmState = Napi::Object::New(env);
    wmState.Set("REMOVE", Napi::Number::New(env, XCB_EWMH_WM_STATE_REMOVE));
    wmState.Set("ADD", Napi::Number::New(env, XCB_EWMH_WM_STATE_ADD));
    wmState.Set("TOGGLE", Napi::Number::New(env, XCB_EWMH_WM_STATE_TOGGLE));
    ewmh.Set("state", wmState);

    return ewmh;
}

static inline const Screen* screenForWindow(const std::shared_ptr<WM>& wm, xcb_window_t win)
{
    // first, see if this window is a root window
    for (const auto& screen : wm->screens) {
        if (screen.screen->root == win)
            return &screen;
    }

    // no? well, let's query the root
    auto cookie = xcb_get_geometry_unchecked(wm->conn, win);
    auto reply = xcb_get_geometry_reply(wm->conn, cookie, nullptr);
    if (!reply)
        return nullptr;

    // find the screen of the root
    const auto root = reply->root;
    free(reply);

    for (const auto& screen : wm->screens) {
        if (screen.screen->root == root)
            return &screen;
    }

    return nullptr;
}

Napi::Value makeXcb(napi_env env, const std::shared_ptr<WM>& wm)
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
        }

        return env.Undefined();
    }));

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
        }

        return env.Undefined();
    }));
    xcb.Set("change_window_attributes", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "change_window_attributes requires two arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        uint32_t window;
        if (!arg.Has("window")) {
            throw Napi::TypeError::New(env, "change_window_attributes requires a window");
        }
        window = arg.Get("window").As<Napi::Number>().Uint32Value();

        uint32_t values[15];
        uint16_t mask = 0;
        uint32_t off = 0;

        if (arg.Has("back_pixmap")) {
            mask |= XCB_CW_BACK_PIXMAP;
            values[off++] = arg.Get("back_pixmap").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("back_pixel")) {
            mask |= XCB_CW_BACK_PIXEL;
            values[off++] = arg.Get("back_pixel").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("border_pixmap")) {
            mask |= XCB_CW_BORDER_PIXMAP;
            values[off++] = arg.Get("border_pixmap").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("border_pixel")) {
            mask |= XCB_CW_BORDER_PIXEL;
            values[off++] = arg.Get("border_pixel").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("bit_gravity")) {
            mask |= XCB_CW_BIT_GRAVITY;
            values[off++] = arg.Get("bit_gravity").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("win_gravity")) {
            mask |= XCB_CW_WIN_GRAVITY;
            values[off++] = arg.Get("win_gravity").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("backing_store")) {
            mask |= XCB_CW_BACKING_STORE;
            values[off++] = arg.Get("backing_store").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("backing_planes")) {
            mask |= XCB_CW_BACKING_PLANES;
            values[off++] = arg.Get("backing_planes").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("backing_pixel")) {
            mask |= XCB_CW_BACKING_PIXEL;
            values[off++] = arg.Get("backing_pixel").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("override_redirect")) {
            mask |= XCB_CW_OVERRIDE_REDIRECT;
            values[off++] = arg.Get("override_redirect").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("save_under")) {
            mask |= XCB_CW_SAVE_UNDER;
            values[off++] = arg.Get("save_under").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("event_mask")) {
            mask |= XCB_CW_EVENT_MASK;
            values[off++] = arg.Get("event_mask").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("dont_propagate")) {
            mask |= XCB_CW_DONT_PROPAGATE;
            values[off++] = arg.Get("dont_propagate").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("colormap")) {
            mask |= XCB_CW_COLORMAP;
            values[off++] = arg.Get("colormap").As<Napi::Number>().Uint32Value();
        }
        if (arg.Has("cursor")) {
            mask |= XCB_CW_CURSOR;
            values[off++] = arg.Get("cursor").As<Napi::Number>().Uint32Value();
        }

        if (off) {
            xcb_change_window_attributes(wm->conn, window, mask, values);
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

    xcb.Set("create_window", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "create_window requires two arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        int32_t x = 0, y = 0;
        uint32_t width, height;

        if (!arg.Has("width")) {
            throw Napi::TypeError::New(env, "create_window needs a width");
        }
        width = arg.Get("width").As<Napi::Number>().Uint32Value();

        if (!arg.Has("height")) {
            throw Napi::TypeError::New(env, "create_window needs a height");
        }
        height = arg.Get("height").As<Napi::Number>().Uint32Value();

        uint32_t parent;
        if (!arg.Has("parent")) {
            throw Napi::TypeError::New(env, "create_window requires a parent");
        }
        parent = arg.Get("parent").As<Napi::Number>().Uint32Value();

        auto screen = screenForWindow(wm, parent);
        if (!screen) {
            throw Napi::TypeError::New(env, "create_window couldn't find screen for parent");
        }

        if (arg.Has("x")) {
            x = arg.Get("x").As<Napi::Number>().Int32Value();
        }
        if (arg.Has("y")) {
            y = arg.Get("y").As<Napi::Number>().Int32Value();
        }

        auto win = xcb_generate_id(wm->conn);
        xcb_create_window(wm->conn, XCB_COPY_FROM_PARENT, win, parent, x, y, width, height, 0,
                          XCB_WINDOW_CLASS_INPUT_OUTPUT, screen->screen->root_visual, 0, nullptr);

        return Napi::Number::New(env, win);
    }));

    xcb.Set("flush", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "flush requires one arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        xcb_flush(wm->conn);

        return env.Undefined();
    }));

    xcb.Set("send_client_message", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "send_client_message requires two arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        xcb_client_message_event_t event;
        memset(&event, 0, sizeof(event));
        event.response_type = XCB_CLIENT_MESSAGE;
        event.format = 32;

        if (!arg.Has("window")) {
            throw Napi::TypeError::New(env, "send_client_message requires a window");
        }
        event.window = arg.Get("window").As<Napi::Number>().Uint32Value();

        if (!arg.Has("type")) {
            throw Napi::TypeError::New(env, "retype_type requires a type");
        }
        event.type = arg.Get("type").As<Napi::Number>().Uint32Value();

        if (!arg.Has("data")) {
            throw Napi::TypeError::New(env, "send_client_message requires a data");
        }
        Napi::ArrayBuffer data;
        const auto ndata = arg.Get("data");
        if (ndata.IsArrayBuffer()) {
            data = ndata.As<Napi::ArrayBuffer>();
        } else if (ndata.IsTypedArray()) {
            data = ndata.As<Napi::TypedArray>().ArrayBuffer();
        } else {
            throw Napi::TypeError::New(env, "send_client_message data must be an arraybuffer or typedarray");
        }
        if (data.ByteLength() % 4) {
            throw Napi::TypeError::New(env, "send_client_message data must be divisible by 4");
        }
        memcpy(&event.data.data8, data.Data(), data.ByteLength());

        xcb_send_event(wm->conn, false, event.window, XCB_EVENT_MASK_NO_EVENT,
                       reinterpret_cast<char*>(&event));

        return env.Undefined();
    }));

    xcb.Set("change_property", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "configure_window requires two arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!arg.Has("window")) {
            throw Napi::TypeError::New(env, "change_property requires a window");
        }
        const uint32_t window = arg.Get("window").As<Napi::Number>().Uint32Value();

        if (!arg.Has("mode")) {
            throw Napi::TypeError::New(env, "change_property requires a mode");
        }
        const uint32_t mode = arg.Get("mode").As<Napi::Number>().Uint32Value();

        if (!arg.Has("type")) {
            throw Napi::TypeError::New(env, "change_property requires a type");
        }
        const uint32_t type = arg.Get("type").As<Napi::Number>().Uint32Value();

        if (!arg.Has("property")) {
            throw Napi::TypeError::New(env, "change_property requires a property");
        }
        const uint32_t property = arg.Get("property").As<Napi::Number>().Uint32Value();

        if (!arg.Has("format")) {
            throw Napi::TypeError::New(env, "change_property requires a format");
        }
        const uint32_t format = arg.Get("format").As<Napi::Number>().Uint32Value();

        if (format != 8 && format != 16 && format != 32) {
            throw Napi::TypeError::New(env, "change_property format needs to be 8/16/32");
        }

        const uint32_t bpe = format / 8;

        Napi::ArrayBuffer data;
        const auto ndata = arg.Get("data");
        if (ndata.IsArrayBuffer()) {
            data = ndata.As<Napi::ArrayBuffer>();
        } else if (ndata.IsTypedArray()) {
            data = ndata.As<Napi::TypedArray>().ArrayBuffer();
        } else {
            throw Napi::TypeError::New(env, "change_property data must be an arraybuffer or typedarray");
        }
        if (data.ByteLength() % bpe) {
            throw Napi::TypeError::New(env, "change_property data must be divisible by format/8");
        }

        const uint32_t elems = data.ByteLength() / bpe;

        xcb_change_property(wm->conn, mode, window, property, type, format, elems, data.Data());

        return env.Undefined();
    }));

    xcb.Set("reparent_window", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "reparent_window requires two arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        int32_t x = 0, y = 0;
        uint32_t window, parent;

        if (!arg.Has("window")) {
            throw Napi::TypeError::New(env, "reparent_window requires a window");
        }
        window = arg.Get("window").As<Napi::Number>().Uint32Value();

        if (!arg.Has("parent")) {
            throw Napi::TypeError::New(env, "reparent_window requires a parent");
        }
        parent = arg.Get("parent").As<Napi::Number>().Uint32Value();

        if (arg.Has("x")) {
            x = arg.Get("x").As<Napi::Number>().Int32Value();
        }
        if (arg.Has("y")) {
            y = arg.Get("y").As<Napi::Number>().Int32Value();
        }

        xcb_reparent_window(wm->conn, window, parent, x, y);

        return env.Undefined();
    }));

    xcb.Set("set_input_focus", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "set_input_focus requires two arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        uint32_t window, revert_to, time = XCB_TIME_CURRENT_TIME;

        if (!arg.Has("window")) {
            throw Napi::TypeError::New(env, "set_input_focus requires a window");
        }
        window = arg.Get("window").As<Napi::Number>().Uint32Value();

        if (!arg.Has("revert_to")) {
            throw Napi::TypeError::New(env, "set_input_focus requires a revert_to");
        }
        revert_to = arg.Get("revert_to").As<Napi::Number>().Uint32Value();

        if (arg.Has("time")) {
            time = arg.Get("time").As<Napi::Number>().Uint32Value();
        }

        xcb_set_input_focus(wm->conn, revert_to, window, time);

        return env.Undefined();
    }));

    xcb.Set("map_window", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsNumber()) {
            throw Napi::TypeError::New(env, "map_window requires two arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        const auto window = info[1].As<Napi::Number>().Uint32Value();

        xcb_map_window(wm->conn, window);

        return env.Undefined();
    }));

    xcb.Set("unmap_window", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsNumber()) {
            throw Napi::TypeError::New(env, "unmap_window requires two arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        const auto window = info[1].As<Napi::Number>().Uint32Value();

        xcb_unmap_window(wm->conn, window);

        return env.Undefined();
    }));

    xcb.Set("atom", initAtoms(env, wm));
    xcb.Set("event", initEvents(env, wm));
    xcb.Set("eventMask", initEventMasks(env, wm));
    xcb.Set("propMode", initPropModes(env, wm));
    xcb.Set("inputFocus", initInputFocus(env, wm));
    xcb.Set("icccm", initIcccm(env, wm));
    xcb.Set("ewmh", initEwmh(env, wm));
    xcb.Set("currentTime", Napi::Number::New(env, XCB_TIME_CURRENT_TIME));

    return xcb;
}

} // namespace owm
