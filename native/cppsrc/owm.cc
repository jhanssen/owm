#include "owm.h"
#include <stdlib.h>

namespace owm {

Napi::Value makeButtonPress(napi_env env, xcb_button_press_event_t* event)
{
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("type", event->response_type & ~0x80);
    obj.Set("detail", event->detail);
    obj.Set("sequence", event->sequence);
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

    return xcb;
}

} // namespace owm
