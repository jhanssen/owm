/* cppsrc/main.cpp */
#include <napi.h>
#include <thread>
#include <mutex>
#include <condition_variable>

struct Command
{
};

struct WM
{
    bool started { false };
    std::thread thread;
    std::mutex mutex;
    std::condition_variable cond;
    std::vector<Command> cmds;
    Napi::ThreadSafeFunction tsfn;
};

static WM wm;

void Start(const Napi::CallbackInfo& info)
{
    if (wm.started)
        return;

    auto env = info.Env();

    if (!info[0].IsFunction()) {
        throw Napi::TypeError::New(env, "First argument needs to be a callback function");
    }

    wm.started = true;
    wm.tsfn = Napi::ThreadSafeFunction::New(env,
                                            info[0].As<Napi::Function>(),
                                            "owm callback",
                                            0,              // unlimited queue
                                            1,              // number of threads using this
                                            [](Napi::Env) { // finalizer
                                                wm.thread.join();
                                            });
    wm.thread = std::thread([]() {
        auto callback = [](Napi::Env env, Napi::Function callback, int* value) {
            callback.Call({ Napi::Number::New(env, *value) });
            delete value;
        };

        int* foo = new int(5);
        auto status = wm.tsfn.BlockingCall(foo, callback);
        if (status != napi_ok) {
            // error?
        }

        wm.tsfn.Release();
    });
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
