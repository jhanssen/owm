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

    return obj;
}

void handleXcb(WM& wm, const Napi::ThreadSafeFunction& tsfn, xcb_generic_event_t* event)
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

        napi_value nvalue = value;
        js.Call(1, &nvalue);
    };

    auto status = tsfn.BlockingCall(event, callback);
    if (status != napi_ok) {
        // error?
    }
}

} // namespace owm
