#ifndef OWM_H
#define OWM_H

#include <napi.h>
#include <uv.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <xcb/xcb.h>
#include <xcb/xcb_ewmh.h>
#include <xcb/xcb_icccm.h>
#include <xcb/xcb_aux.h>
#include <xcb/xcb_keysyms.h>
#include <xkbcommon/xkbcommon.h>
#include <xkbcommon/xkbcommon-x11.h>
// uuuugh
#define explicit _explicit
#include <xcb/xkb.h>
#undef explicit
#include <xcb/randr.h>
#include <assert.h>
#include <array>
#include <vector>
#include <mutex>
#include <memory>
#include <thread>
#include <unordered_map>
#include <type_traits>

namespace owm {

std::string latin1toutf8(const std::string& input);
void printException(const char *func, const Napi::Error& e);

struct Screen
{
    Screen(int16_t xx, int16_t yy, uint16_t ww, uint16_t hh, std::string&& nn, std::vector<std::string>&& oo, bool pp)
        : x(xx), y(yy), w(ww), h(hh), name(std::forward<std::string>(nn)), outputs(std::forward<std::vector<std::string> >(oo)), primary(pp)
    {
    }

    int16_t x { 0 };
    int16_t y { 0 };
    uint16_t w { 0 };
    uint16_t h { 0 };
    std::string name;
    std::vector<std::string> outputs;
    bool primary;
};

struct Window
{
    xcb_window_t window;

    struct Attributes
    {
        uint8_t bit_gravity;
        uint8_t win_gravity;
        uint8_t map_state;
        uint8_t override_redirect;
        uint32_t all_event_masks;
        uint32_t your_event_mask;
        uint16_t do_not_propagate_mask;
    } attributes;

    struct Geometry
    {
        xcb_window_t root;
        int16_t x;
        int16_t y;
        uint16_t width;
        uint16_t height;
        uint16_t border_width;
    } geometry;

    struct SizeHints
    {
        uint32_t flags;
        int32_t x, y, width, height;
        int32_t min_width, min_height;
        int32_t max_width, max_height;
        int32_t width_inc, height_inc;
        int32_t min_aspect_num, min_aspect_den;
        int32_t max_aspect_num, max_aspect_den;
        int32_t base_width, base_height;
        uint32_t win_gravity;
    } normalHints;

    struct WMHints
    {
        int32_t flags;
        uint32_t input;
        int32_t initial_state;
        xcb_pixmap_t icon_pixmap;
        xcb_window_t icon_window;
        int32_t icon_x, icon_y;
        xcb_pixmap_t icon_mask;
        xcb_window_t window_group;
    } wmHints;

    struct WMClass
    {
        std::string instance_name;
        std::string class_name;
    } wmClass;

    std::string wmRole;
    std::string wmName;
    std::string ewmhName;

    std::vector<xcb_atom_t> wmProtocols, ewmhState, ewmhWindowType;

    struct EWMHExtents
    {
        uint32_t left, right;
        uint32_t top, bottom;
    } ewmhStrut;

    struct EWMHStrutPartial
    {
        uint32_t left, right;
        uint32_t top, bottom;
        uint32_t left_start_y, left_end_y;
        uint32_t right_start_y, right_end_y;
        uint32_t top_start_x, top_end_x;
        uint32_t bottom_start_x, bottom_end_x;
    } ewmhStrutPartial;

    uint32_t pid;

    xcb_window_t transientFor, leader;
    uint32_t desktop;
};

typedef std::unordered_map<std::string, xcb_atom_t> Atoms;

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
    int defaultScreenNo { 0 };
    xcb_screen_t* defaultScreen;
    Atoms atoms;
    uv_async_t* asyncFlush { nullptr };

    struct XKB
    {
        uint8_t event { 0 };
        xkb_context* ctx { nullptr };
        xcb_key_symbols_t* syms { nullptr };
        xkb_keymap* keymap { nullptr };
        xkb_state* state { nullptr };
        int32_t device { 0 };
    } xkb;

    struct Randr
    {
        uint8_t event { 0 };
    } randr;
};

void handleXcb(const std::shared_ptr<WM>& wm, const Napi::FunctionReference& fn, xcb_generic_event_t* event);
void queryScreens(std::shared_ptr<WM>& wm);
Napi::Value makeScreens(napi_env env, const std::shared_ptr<WM>&wm);
Napi::Value makeXcb(napi_env env, const std::shared_ptr<WM>& wm);
Napi::Value makeXkb(napi_env env, const std::shared_ptr<WM>& wm);
Napi::Value makeWindow(napi_env env, const Window& win);

typedef union {
    /* All XKB events share these fields. */
    struct {
        uint8_t response_type;
        uint8_t xkbType;
        uint16_t sequence;
        xcb_timestamp_t time;
        uint8_t deviceID;
    } any;
    xcb_xkb_map_notify_event_t map_notify;
    xcb_xkb_state_notify_event_t state_notify;
} _xkb_event;
void handleXkb(std::shared_ptr<owm::WM>& wm, const Napi::FunctionReference& fn, _xkb_event* event);

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

inline Window::SizeHints makeSizeHint(const xcb_size_hints_t& in)
{
    Window::SizeHints out;
    static_assert(sizeof(in) == sizeof(out));
    memcpy(&out, &in, sizeof(in));
    return out;
}

inline Window::WMHints makeWMHints(const xcb_icccm_wm_hints_t& in)
{
    Window::WMHints out;
    static_assert(sizeof(in) == sizeof(out));
    memcpy(&out, &in, sizeof(in));
    return out;
}

inline Window::WMClass makeWMClass(const xcb_icccm_get_wm_class_reply_t& in)
{
    Window::WMClass out;
    if (in.instance_name)
        out.instance_name = in.instance_name;
    if (in.class_name)
        out.class_name = in.class_name;
    return out;
}

inline std::string makeString(const xcb_icccm_get_text_property_reply_t& in, bool isUtf8)
{
    if (in.format == 8 && in.name && in.name_len > 0) {
        if (isUtf8) {
            return std::string(in.name, in.name_len);
        } else {
            return latin1toutf8(std::string(in.name, in.name_len));
        }
    }
    return std::string();
}

inline std::string makeString(const xcb_ewmh_get_utf8_strings_reply_t& in, bool isUtf8)
{
    if (in.strings && in.strings_len > 0) {
        if (isUtf8) {
            return std::string(in.strings, in.strings_len);
        } else {
            return latin1toutf8(std::string(in.strings, in.strings_len));
        }
    }
    return std::string();
}

template<typename T>
inline std::vector<xcb_atom_t> makeAtoms(const T& in)
{
    std::vector<xcb_atom_t> out;
    out.reserve(in.atoms_len);
    for (uint32_t i = 0; i < in.atoms_len; ++i) {
        out.push_back(in.atoms[i]);
    }
    return out;
}

inline Window::EWMHExtents makeExtents(const xcb_ewmh_get_extents_reply_t& in)
{
    Window::EWMHExtents out;
    static_assert(sizeof(in) == sizeof(out));
    memcpy(&out, &in, sizeof(in));
    return out;
}

inline Window::EWMHStrutPartial makeStrutPartial(const xcb_ewmh_wm_strut_partial_t& in)
{
    Window::EWMHStrutPartial out;
    static_assert(sizeof(in) == sizeof(out));
    memcpy(&out, &in, sizeof(in));
    return out;
}

} // namespace owm

#endif
