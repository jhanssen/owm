#include "owm.h"

namespace owm {

void handleXcb(WM& wm, const Napi::ThreadSafeFunction& tsfn, const xcb_generic_event_t* event)
{
    auto callback = [&wm](Napi::Env env, Napi::Function js, owm::Response* resp) {
        //js.Call({ Napi::Number::New(env, *value) });
        wm.responsePool.release(resp);
    };

    auto resp = wm.responsePool.acquire();
    resp->type = owm::Response::NewWindow;
    auto status = tsfn.BlockingCall(resp, callback);
    if (status != napi_ok) {
        // error?
    }
}

} // namespace owm
