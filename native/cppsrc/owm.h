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

namespace owm {

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

} // namespace owm

#endif
