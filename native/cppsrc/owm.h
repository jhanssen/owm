#ifndef OWM_H
#define OWM_H

#include <napi.h>
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

} // namespace owm

#endif
