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
#include <memory>
#include <thread>
#include <variant>
#include <type_traits>

namespace owm {

enum UndefinedType { Undefined };

typedef std::variant<double, std::string, const char*, bool, UndefinedType> Variant;

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

struct Window
{
    Window(xcb_window_t w, uint8_t bg, uint8_t wg, uint8_t ms, uint8_t ore,
           uint32_t aem, uint32_t yem, uint16_t dnpm,
           xcb_window_t r, int16_t xx, int16_t yy, uint16_t wd, uint16_t hg, uint16_t bw)
        : window(w), bit_gravity(bg), win_gravity(wg), map_state(ms), override_redirect(ore),
          all_event_masks(aem), your_event_mask(yem), do_not_propagate_mask(dnpm),
          root(r), x(xx), y(yy), width(wd), height(hg), border_width(bw)
    {
    }

    xcb_window_t window;

    // attributes
    uint8_t bit_gravity;
    uint8_t win_gravity;
    uint8_t map_state;
    uint8_t override_redirect;
    uint32_t all_event_masks;
    uint32_t your_event_mask;
    uint16_t do_not_propagate_mask;

    // geometry
    xcb_window_t root;
    int16_t x;
    int16_t y;
    uint16_t width;
    uint16_t height;
    uint16_t border_width;
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

template<typename T>
struct Wrap
{
    static Napi::Value wrap(napi_env env, const T& t);
    static Napi::Value wrap(napi_env env, T&& wrap);
    static T unwrap(const Napi::Value& value);
};

struct WM
{
    xcb_connection_t* conn { nullptr };
    xcb_ewmh_connection_t* ewmh { nullptr };
    std::vector<Screen> screens;

    Stack<Response> responsePool;
    std::vector<Response*> responses;
};

void handleXcb(const std::shared_ptr<WM>& wm, const Napi::ThreadSafeFunction& tsfn, xcb_generic_event_t* event);
Napi::Value makeXcb(napi_env env, const std::shared_ptr<WM>& wm);

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

struct RunLater
{
    RunLater()
        : created(std::this_thread::get_id())
    {
        uv_async_init(uv_default_loop(), &async, callback);
        async.data = this;
    }

    ~RunLater()
    {
        assert(std::this_thread::get_id() == created);
        uv_close(reinterpret_cast<uv_handle_t*>(&async), nullptr);
    }

    template<typename Func, typename ...Args>
    void call(Func&& func, Args&& ...args)
    {
        auto tuple = std::make_tuple(std::forward<Args>(args)...);
        std::scoped_lock locker(mutex);
        funcs.push_back([tuple{std::move(tuple)}, func{std::move(func)}]() {
            std::apply(func, tuple);
        });
        uv_async_send(&async);
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
    uv_async_t async;
    std::thread::id created;

    RunLater(const RunLater&) = delete;
    RunLater& operator=(const RunLater&) = delete;
    RunLater(RunLater&&) = delete;
    RunLater& operator=(RunLater&&) = delete;
};

// needs to be constructed in the right thread, can be resolved or rejected in any thread
class ThreadSafePromise : public std::enable_shared_from_this<ThreadSafePromise>
{
public:
    // Non-thread safe, these need to be called in the js thread
    ThreadSafePromise(napi_env env, const std::shared_ptr<Napi::AsyncContext>& c);
    ~ThreadSafePromise();

    Napi::Promise Promise() const { return deferred.Promise(); }
    Napi::Env Env() const { return deferred.Env(); }

    // Thread safe, can be called from anywhere
    void Resolve(const Variant& value) const;
    void Reject(const Variant& value) const;

    template<typename Callable, typename std::enable_if<std::is_invocable_r<Napi::Value, Callable, napi_env>::value>::type* = nullptr>
    void Resolve(Callable&& callable) const;
    template<typename Callable, typename std::enable_if<std::is_invocable_r<Napi::Value, Callable, napi_env>::value>::type* = nullptr>
    void Reject(Callable&& callable) const;

private:
    static void callback(uv_async_t* async);

private:
    Napi::Promise::Deferred deferred;
    std::shared_ptr<Napi::AsyncContext> ctx;
    mutable uv_async_t async;
    mutable std::mutex mutex;
    mutable std::function<void()> run;
    std::thread::id created;

    ThreadSafePromise(const ThreadSafePromise&) = delete;
    ThreadSafePromise(ThreadSafePromise&&) = delete;
    ThreadSafePromise& operator=(const ThreadSafePromise&) = delete;
    ThreadSafePromise& operator=(ThreadSafePromise&&) = delete;
};

inline ThreadSafePromise::ThreadSafePromise(napi_env env, const std::shared_ptr<Napi::AsyncContext>& c)
    : deferred(env), ctx(c), created(std::this_thread::get_id())
{
    uv_async_init(uv_default_loop(), &async, callback);
    async.data = this;
}

inline ThreadSafePromise::~ThreadSafePromise()
{
    assert(created == std::this_thread::get_id());
    uv_close(reinterpret_cast<uv_handle_t*>(&async), nullptr);
}

template<typename Callable, typename std::enable_if<std::is_invocable_r<Napi::Value, Callable, napi_env>::value>::type*>
inline void ThreadSafePromise::Resolve(Callable&& callable) const
{
    if (std::this_thread::get_id() == created) {
        auto env = deferred.Env();
        Napi::HandleScope scope(env);
        Napi::CallbackScope callback(env, *ctx);
        deferred.Resolve(callable(env));
        return;
    }

    auto ptr = shared_from_this();
    auto c = std::move(ctx);

    std::scoped_lock locker(mutex);
    run = [callable{std::move(callable)}, ptr, c]() {
        auto env = ptr->deferred.Env();
        Napi::HandleScope scope(env);
        Napi::CallbackScope callback(env, *c);
        ptr->deferred.Resolve(callable(env));
    };
    uv_async_send(&async);
}

inline void ThreadSafePromise::Resolve(const Variant& value) const
{
    if (std::this_thread::get_id() == created) {
        auto env = deferred.Env();
        Napi::HandleScope scope(env);
        Napi::CallbackScope callback(env, *ctx);
        deferred.Resolve(fromVariant(deferred.Env(), value));
        return;
    }

    auto ptr = shared_from_this();
    auto c = std::move(ctx);

    std::scoped_lock locker(mutex);
    run = [value, ptr, c]() {
        auto env = ptr->deferred.Env();
        Napi::HandleScope scope(env);
        Napi::CallbackScope callback(env, *c);
        ptr->deferred.Resolve(fromVariant(env, value));
    };
    uv_async_send(&async);
}

template<typename Callable, typename std::enable_if<std::is_invocable_r<Napi::Value, Callable, napi_env>::value>::type*>
inline void ThreadSafePromise::Reject(Callable&& callable) const
{
    if (std::this_thread::get_id() == created) {
        auto env = deferred.Env();
        Napi::HandleScope scope(env);
        Napi::CallbackScope callback(env, *ctx);
        deferred.Reject(callable(env));
        return;
    }

    auto ptr = shared_from_this();
    auto c = std::move(ctx);

    std::scoped_lock locker(mutex);
    run = [callable{std::move(callable)}, ptr, c]() {
        auto env = ptr->deferred.Env();
        Napi::HandleScope scope(env);
        Napi::CallbackScope callback(env, *c);
        ptr->deferred.Reject(callable(env));
    };
    uv_async_send(&async);
}

inline void ThreadSafePromise::Reject(const Variant& value) const
{
    if (std::this_thread::get_id() == created) {
        auto env = deferred.Env();
        Napi::HandleScope scope(env);
        Napi::CallbackScope callback(env, *ctx);
        deferred.Reject(fromVariant(deferred.Env(), value));
        return;
    }

    auto ptr = shared_from_this();
    auto c = std::move(ctx);

    std::scoped_lock locker(mutex);
    run = [value, ptr, c]() {
        auto env = ptr->deferred.Env();
        Napi::HandleScope scope(env);
        Napi::CallbackScope callback(env, *c);
        ptr->deferred.Reject(fromVariant(env, value));
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
    } else if (auto s = std::get_if<const char*>(&variant)) {
        return Napi::String::New(env, *s);
    }
    return Napi::Env(env).Undefined();
}

template<typename T>
Napi::Value Wrap<T>::wrap(napi_env env, const T& t)
{
    Napi::Object obj = Napi::Object::New(env);
    if (napi_wrap(env, obj, new T(t),
                  [](napi_env env, void* data, void* /*hint*/) {
                      delete reinterpret_cast<T*>(data);
                  },
                  nullptr, nullptr) == napi_ok) {
        return obj;
    }
    return Napi::Env(env).Undefined();
}

template<typename T>
Napi::Value Wrap<T>::wrap(napi_env env, T&& t)
{
    Napi::Object obj = Napi::Object::New(env);
    if (napi_wrap(env, obj, new T(std::forward<T>(t)),
                  [](napi_env env, void* data, void* /*hint*/) {
                      delete reinterpret_cast<T*>(data);
                  },
                  nullptr, nullptr) == napi_ok) {
        return obj;
    }
    return Napi::Env(env).Undefined();
}

template<typename T>
T Wrap<T>::unwrap(const Napi::Value& value)
{
    void* t;
    if (napi_unwrap(value.Env(), value, &t) == napi_ok) {
        return *reinterpret_cast<T*>(t);
    }
    return T();
}

} // namespace owm

#endif
