#ifndef OWM_H
#define OWM_H

#include <napi.h>
#include <uv.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <xcb/xcb.h>
#include <xcb/xcb_ewmh.h>
#include <xcb/xcb_aux.h>
#include <assert.h>
#include <array>
#include <vector>
#include <mutex>
#include <thread>
#include <variant>

namespace owm {

enum UndefinedType { Undefined };

typedef std::variant<double, std::string, bool, UndefinedType> Variant;

Variant toVariant(Napi::Value value);
Napi::Value fromVariant(napi_env env, const Variant& variant);

struct Rect
{
    int x { 0 };
    int y { 0 };
    int w { 0 };
    int h { 0 };
};

struct Screen
{
    xcb_screen_t* screen { nullptr };
    xcb_visualtype_t* visual { nullptr };
    Rect rect;
};

struct Request
{
    enum Type { Start, Stop } type;
};

struct Response
{
    enum Type { NewWindow } type;
};

template<typename T, size_t Count = 10>
struct Stack
{
    T* acquire();
    void release(T* cmd);

private:
    std::mutex mutex;
    std::array<T, Count> entries;
    std::array<bool, Count> taken;
};

struct WM
{
    xcb_connection_t* conn { nullptr };
    xcb_ewmh_connection_t* ewmh { nullptr };
    std::vector<Screen> screens;

    Stack<Response> responsePool;
    std::vector<Response*> responses;
};

void handleXcb(WM& wm, const Napi::ThreadSafeFunction& tsfn, const xcb_generic_event_t* event);

template<typename T, size_t Count>
T* Stack<T, Count>::acquire()
{
    std::scoped_lock locker(mutex);
    for (unsigned int i = 0; i < Count; ++i) {
        if (!taken[i]) {
            taken[i] = true;
            return &entries[i];
        }
    }
    return new T;
}

template<typename T, size_t Count>
void Stack<T, Count>::release(T* cmd)
{
    std::scoped_lock locker(mutex);
    if (cmd < entries.begin() || cmd >= entries.end()) {
        delete cmd;
        return;
    }
    assert(taken[entries.begin() - cmd]);
    taken[entries.begin() - cmd] = false;
}

template<typename Func>
struct RunLater
{
    RunLater(uv_loop_t* loop)
        : async(new uv_async_t)
    {
        uv_async_init(loop, async.get(), callback);
        async->data = this;
    }

    ~RunLater()
    {
        if (async) {
            async->data = nullptr;
            uv_close(reinterpret_cast<uv_handle_t*>(async.get()), nullptr);
        }
    }

    template<typename ...Args>
    void call(Func&& func, Args&& ...args)
    {
        auto tuple = std::make_tuple(std::forward<Args>(args)...);
        std::scoped_lock locker(mutex);
        funcs.push_back([tuple{std::move(tuple)}, func{std::move(func)}]() {
            std::apply(func, tuple);
        });
        uv_async_send(async.get());
    }

private:
    static void callback(uv_async_t* async)
    {
        RunLater* later = static_cast<RunLater*>(async->data);
        std::vector<std::function<void()> > fs;
        {
            std::scoped_lock locker(later->mutex);
            std::swap(later->funcs, fs);
        }
        for (const auto& f : fs) {
            f();
        }
    }

private:
    std::mutex mutex;
    std::vector<std::function<void()> > funcs;
    std::unique_ptr<uv_async_t> async;

    RunLater(const RunLater&) = delete;
    RunLater& operator=(const RunLater&) = delete;
    RunLater(RunLater&&) = delete;
    RunLater& operator=(RunLater&&) = delete;
};

// needs to be constructed in the right thread, can be resolved or rejected in any thread
class ThreadSafePromise
{
public:
    // Non-thread safe, these need to be called in the js thread
    ThreadSafePromise(napi_env env);
    ~ThreadSafePromise();

    Napi::Promise Promise() const { return deferred.Promise(); }
    Napi::Env Env() const { return deferred.Env(); }

    // Thread safe, can be called from anywhere
    void Resolve(const Variant& value) const;
    void Reject(const Variant& value) const;

private:
    static void callback(uv_async_t* async);

private:
    Napi::Promise::Deferred deferred;
    mutable uv_async_t async;
    mutable std::mutex mutex;
    mutable std::function<void()> run;
    std::thread::id created;

    ThreadSafePromise(const ThreadSafePromise&) = delete;
    ThreadSafePromise(ThreadSafePromise&&) = delete;
    ThreadSafePromise& operator=(const ThreadSafePromise&) = delete;
    ThreadSafePromise& operator=(ThreadSafePromise&&) = delete;
};

inline ThreadSafePromise::ThreadSafePromise(napi_env env)
    : deferred(env), created(std::this_thread::get_id())
{
    uv_async_init(uv_default_loop(), &async, callback);
    async.data = this;
}

inline ThreadSafePromise::~ThreadSafePromise()
{
    uv_close(reinterpret_cast<uv_handle_t*>(&async), nullptr);
}

inline void ThreadSafePromise::Resolve(const Variant& value) const
{
    if (std::this_thread::get_id() == created) {
        deferred.Resolve(fromVariant(deferred.Env(), value));
        return;
    }

    std::scoped_lock locker(mutex);
    run = [value, this]() {
        auto env = deferred.Env();
        Napi::HandleScope scope(env);
        deferred.Resolve(fromVariant(deferred.Env(), value));
    };
    uv_async_send(&async);
}

inline void ThreadSafePromise::Reject(const Variant& value) const
{
    if (std::this_thread::get_id() == created) {
        deferred.Reject(fromVariant(deferred.Env(), value));
        return;
    }

    std::scoped_lock locker(mutex);
    run = [value, this]() {
        auto env = deferred.Env();
        Napi::HandleScope scope(env);
        deferred.Reject(fromVariant(env, value));
    };
    uv_async_send(&async);
}

inline void ThreadSafePromise::callback(uv_async_t* async)
{
    ThreadSafePromise* that = static_cast<ThreadSafePromise*>(async->data);
    if (!that)
        return;
    std::function<void()> run;
    {
        std::scoped_lock locker(that->mutex);
        std::swap(run, that->run);
    }
    run();
}

inline Variant toVariant(Napi::Value value)
{
    switch (value.Type()) {
    case napi_undefined:
    case napi_null:
    case napi_symbol:
    case napi_object:
    case napi_function:
    case napi_external:
    case napi_bigint:
        return Variant(Undefined);
    case napi_boolean:
        return Variant(value.As<Napi::Boolean>().Value());
    case napi_number:
        return Variant(value.As<Napi::Number>().DoubleValue());
    case napi_string:
        return Variant(value.As<Napi::String>().Utf8Value());
    }
}

inline Napi::Value fromVariant(napi_env env, const Variant& variant)
{
    if (auto b = std::get_if<bool>(&variant)) {
        return Napi::Boolean::New(env, *b);
    } else if (auto n = std::get_if<double>(&variant)) {
        return Napi::Number::New(env, *n);
    } else if (auto s = std::get_if<std::string>(&variant)) {
        return Napi::String::New(env, *s);
    }
    return Napi::Env(env).Undefined();
}

} // namespace owm

#endif
