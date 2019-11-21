#ifndef OWM_GRAPHICS_H
#define OWM_GRAPHICS_H

#include <napi.h>
#include <uv.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <xcb/xcb.h>

namespace graphics {

Napi::Object make(napi_env env);

}

#endif
