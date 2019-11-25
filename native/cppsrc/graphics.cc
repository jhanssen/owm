#include "graphics.h"
#include "owm.h"
#include <cairo-xcb.h>
#include <pango/pangocairo.h>

template<typename T>
using Wrap = owm::Wrap<T>;
using WM = owm::WM;

struct Cairo
{
    Cairo(cairo_surface_t* s, cairo_t* c, uint32_t w, uint32_t h)
        : surface(s), cairo(c), path(nullptr), width(w), height(h),
          transformId(0), pathChanged(false)
    {
    }
    Cairo(const std::shared_ptr<Cairo>& other)
        : path(nullptr), width(other->width), height(other->height),
          transformId(0), pathChanged(false)
    {
        if (other->surface) {
            surface = cairo_surface_reference(other->surface);
            cairo = cairo_create(other->surface);
        } else {
            surface = nullptr;
            cairo = nullptr;
        }
    }
    ~Cairo()
    {
        if (path) {
            cairo_path_destroy(path);
        }
        if (cairo) {
            cairo_destroy(cairo);
        }
        if (surface) {
            cairo_surface_destroy(surface);
        }
    }

    cairo_path_t* finalizePath()
    {
        if (pathChanged || !path) {
            if (path) {
                cairo_path_destroy(path);
            }
            path = cairo_copy_path(cairo);
            pathChanged = false;
        }
        return path;
    }

    cairo_surface_t* surface;
    cairo_t* cairo;
    cairo_path_t* path;
    uint32_t width, height;
    uint32_t transformId;
    bool pathChanged;
};

struct Surface
{
    Surface(cairo_surface_t* s, uint32_t w, uint32_t h)
        : surface(s), width(w), height(h)
    {
    }
    ~Surface()
    {
        if (surface) {
            cairo_surface_destroy(surface);
        }
    }

    struct Data
    {
        const uint8_t* data;
        size_t off, rem;
    };

    cairo_surface_t* surface;
    uint32_t width, height;
};

struct Pango
{
    Pango(const std::shared_ptr<Cairo>& c)
        : cairo(c)
    {
        layout = pango_cairo_create_layout(c->cairo);
        cairoId = c->transformId;
    }
    ~Pango()
    {
        if (layout) {
            g_object_unref(layout);
        }
    }

    bool setFont(const std::string& font)
    {
        if (!layout)
            return false;
        auto desc = pango_font_description_from_string(font.c_str());
        if (!desc)
            return false;
        pango_layout_set_font_description(layout, desc);
        pango_font_description_free(desc);
        return true;
    }

    bool setText(const std::string& text)
    {
        if (!layout)
            return false;
        pango_layout_set_text(layout, text.c_str(), text.size());
        return true;
    }

    PangoLayout* layout;
    uint32_t cairoId;
    std::shared_ptr<Cairo> cairo;
};

static inline xcb_visualtype_t* find_visual(xcb_connection_t* c, xcb_visualid_t visual)
{
    xcb_screen_iterator_t screen_iter = xcb_setup_roots_iterator(xcb_get_setup(c));
    for (; screen_iter.rem; xcb_screen_next(&screen_iter)) {
        xcb_depth_iterator_t depth_iter = xcb_screen_allowed_depths_iterator(screen_iter.data);
        for (; depth_iter.rem; xcb_depth_next(&depth_iter)) {
            xcb_visualtype_iterator_t visual_iter = xcb_depth_visuals_iterator(depth_iter.data);
            for (; visual_iter.rem; xcb_visualtype_next(&visual_iter))
                if (visual == visual_iter.data->visual_id)
                    return visual_iter.data;
        }
    }
    return nullptr;
}

namespace graphics {
Napi::Object make(napi_env env)
{
    Napi::Object graphics = Napi::Object::New(env);

    graphics.Set("createFromDrawable", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.createFromDrawable requires two arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!arg.Has("drawable")) {
            throw Napi::TypeError::New(env, "cairo.createFromDrawable requires a drawable");
        }
        const auto drawable = arg.Get("drawable").As<Napi::Number>().Uint32Value();

        if (!arg.Has("width")) {
            throw Napi::TypeError::New(env, "cairo.createFromDrawable requires a width");
        }
        const auto width = arg.Get("width").As<Napi::Number>().Uint32Value();

        if (!arg.Has("height")) {
            throw Napi::TypeError::New(env, "cairo.createFromDrawable requires a height");
        }
        const auto height = arg.Get("height").As<Napi::Number>().Uint32Value();

        auto visual = find_visual(wm->conn, wm->defaultScreen->root_visual);
        if (!visual) {
            throw Napi::TypeError::New(env, "cairo.createFromDrawable couldn't find root visual from id");
        }

        auto surface = cairo_xcb_surface_create(wm->conn, drawable, visual, width, height);
        auto cairo = cairo_create(surface);

        auto c = std::make_shared<Cairo>(surface, cairo, width, height);

        return Wrap<std::shared_ptr<Cairo> >::wrap(env, c);
    }));

    graphics.Set("createFromContext", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.createFromContext takes one argument");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!c->cairo) {
            throw Napi::TypeError::New(env, "cairo.createFromContext invalid cairo");
        }

        auto nc = std::make_shared<Cairo>(c);

        return Wrap<std::shared_ptr<Cairo> >::wrap(env, nc);
    }));

    graphics.Set("createFromSurface", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.createFromSurface takes one argument");
        }

        auto s = Wrap<std::shared_ptr<Surface> >::unwrap(info[0]);

        if (!s->surface) {
            throw Napi::TypeError::New(env, "cairo.createFromSurface invalid cairo");
        }

        auto cairo = cairo_create(s->surface);
        auto c = std::make_shared<Cairo>(cairo_surface_reference(s->surface), cairo, s->width, s->height);

        return Wrap<std::shared_ptr<Cairo> >::wrap(env, c);
    }));

    graphics.Set("destroy", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.destroy takes one argument");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!c->cairo) {
            throw Napi::TypeError::New(env, "cairo.destroy no cairo?");
        }

        if (c->path) {
            cairo_path_destroy(c->path);
            c->path = nullptr;
        }
        cairo_destroy(c->cairo);
        cairo_surface_destroy(c->surface);
        c->cairo = nullptr;
        c->surface = nullptr;

        return env.Undefined();
    }));

    graphics.Set("size", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.destroy takes one argument");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!c->cairo) {
            throw Napi::TypeError::New(env, "cairo.destroy no cairo?");
        }

        auto ret = Napi::Object::New(env);
        ret.Set("width", Napi::Number::New(env, c->width));
        ret.Set("height", Napi::Number::New(env, c->height));
        return ret;
    }));

    graphics.Set("appendPath", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.appendPath takes two arguments");
        }

        auto dc = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto sc = Wrap<std::shared_ptr<Cairo> >::unwrap(info[1]);

        if (!dc->cairo || !sc->cairo) {
            throw Napi::TypeError::New(env, "cairo.appendPath no cairo?");
        }

        cairo_append_path(dc->cairo, sc->finalizePath());

        return env.Undefined();
    }));

    graphics.Set("save", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.save takes one argument");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!c->cairo) {
            throw Napi::TypeError::New(env, "cairo.save no cairo?");
        }

        cairo_save(c->cairo);

        return env.Undefined();
    }));

    graphics.Set("restore", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.restore takes one argument");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!c->cairo) {
            throw Napi::TypeError::New(env, "cairo.restore no cairo?");
        }

        cairo_restore(c->cairo);

        return env.Undefined();
    }));

    graphics.Set("createSurfaceFromContext", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.createSurfaceFromContext takes two arguments");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!c->cairo || !c->surface) {
            throw Napi::TypeError::New(env, "cairo.createSurfaceFromContext invalid cairo");
        }

        auto s = std::make_shared<Surface>(cairo_surface_reference(c->surface), c->width, c->height);

        return Wrap<std::shared_ptr<Surface> >::wrap(env, s);
    }));

    graphics.Set("createSurfaceFromDrawable", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.createSurfaceFromDrawable requires two arguments");
        }

        auto wm = Wrap<std::shared_ptr<WM> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!arg.Has("drawable")) {
            throw Napi::TypeError::New(env, "cairo.createSurfaceFromDrawable requires a drawable");
        }
        const auto drawable = arg.Get("drawable").As<Napi::Number>().Uint32Value();

        if (!arg.Has("width")) {
            throw Napi::TypeError::New(env, "cairo.createSurfaceFromDrawable requires a width");
        }
        const auto width = arg.Get("width").As<Napi::Number>().Uint32Value();

        if (!arg.Has("height")) {
            throw Napi::TypeError::New(env, "cairo.createSurfaceFromDrawable requires a height");
        }
        const auto height = arg.Get("height").As<Napi::Number>().Uint32Value();

        auto visual = find_visual(wm->conn, wm->defaultScreen->root_visual);
        if (!visual) {
            throw Napi::TypeError::New(env, "cairo.createSurfaceFromDrawable couldn't find root visual from id");
        }

        auto surface = cairo_xcb_surface_create(wm->conn, drawable, visual, width, height);
        auto s = std::make_shared<Surface>(surface, width, height);

        return Wrap<std::shared_ptr<Surface> >::wrap(env, s);
    }));

    graphics.Set("createSurfaceFromPNG", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || (!info[1].IsArrayBuffer() && !info[1].IsTypedArray())) {
            throw Napi::TypeError::New(env, "cairo.createSurfaceFromPNG takes two arguments");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!c->cairo) {
            throw Napi::TypeError::New(env, "cairo.createSurfaceFromPNG invalid cairo");
        }

        size_t size;
        size_t offset;

        const auto ndata = info[1];
        Napi::ArrayBuffer data;
        if (ndata.IsArrayBuffer()) {
            data = ndata.As<Napi::ArrayBuffer>();
            size = data.ByteLength();
            offset = 0;
        } else if (ndata.IsTypedArray()) {
            const auto tdata = ndata.As<Napi::TypedArray>();
            size = tdata.ByteLength();
            offset = tdata.ByteOffset();
            data = tdata.ArrayBuffer();
        } else {
            throw Napi::TypeError::New(env, "cairo.createSurfaceFromPNG data must be an arraybuffer or typedarray");
        }

        Surface::Data surfaceData { reinterpret_cast<uint8_t*>(data.Data()) + offset, 0, size };
        auto pngs = cairo_image_surface_create_from_png_stream([](void* user, unsigned char* data, unsigned int length) {
            Surface::Data* d = static_cast<Surface::Data*>(user);
            if (length > d->rem) {
                return CAIRO_STATUS_READ_ERROR;
            }
            memcpy(data, d->data + d->off, length);
            d->off += length;
            d->rem -= length;
            return CAIRO_STATUS_SUCCESS;
        }, &surfaceData);

        const uint32_t w = cairo_image_surface_get_width(pngs);
        const uint32_t h = cairo_image_surface_get_height(pngs);

        auto s = std::make_shared<Surface>(pngs, w, h);

        return Wrap<std::shared_ptr<Surface> >::wrap(env, s);
    }));

    graphics.Set("destroySurface", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.destroySurface takes one argument");
        }

        auto c = Wrap<std::shared_ptr<Surface> >::unwrap(info[0]);

        if (c->surface) {
            cairo_surface_destroy(c->surface);
            c->surface = nullptr;
        }

        return env.Undefined();
    }));

    graphics.Set("surfaceSize", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.surfaceSize takes one argument");
        }

        auto s = Wrap<std::shared_ptr<Surface> >::unwrap(info[0]);

        if (!s->surface) {
            throw Napi::TypeError::New(env, "cairo.surfaceSize no cairo?");
        }

        auto ret = Napi::Object::New(env);
        ret.Set("width", Napi::Number::New(env, s->width));
        ret.Set("height", Napi::Number::New(env, s->height));
        return ret;
    }));

    graphics.Set("surfaceFlush", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.surfaceFlush takes one argument");
        }

        auto s = Wrap<std::shared_ptr<Surface> >::unwrap(info[0]);

        if (!s->surface) {
            throw Napi::TypeError::New(env, "cairo.surfaceFlush no cairo?");
        }

        cairo_surface_flush(s->surface);

        return env.Undefined();
    }));

    graphics.Set("setSourceSurface", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.setSourceSurface takes two arguments");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto s = Wrap<std::shared_ptr<Surface> >::unwrap(info[1]);

        double x = 0, y = 0;
        if (info.Length() > 2 && info[2].IsNumber()) {
            x = info[2].As<Napi::Number>().DoubleValue();
        }
        if (info.Length() > 3 && info[3].IsNumber()) {
            y = info[3].As<Napi::Number>().DoubleValue();
        }

        cairo_set_source_surface(c->cairo, s->surface, x, y);

        return env.Undefined();
    }));

    graphics.Set("setSourceRGB", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 4 || !info[0].IsObject() || !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsNumber()) {
            throw Napi::TypeError::New(env, "cairo.setSourceRGB takes four arguments");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        const double r = info[1].As<Napi::Number>().DoubleValue();
        const double g = info[2].As<Napi::Number>().DoubleValue();
        const double b = info[3].As<Napi::Number>().DoubleValue();

        cairo_set_source_rgb(cairo->cairo, r, g, b);

        return env.Undefined();
    }));

    graphics.Set("setSourceRGBA", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 5 || !info[0].IsObject() || !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsNumber() || !info[4].IsNumber()) {
            throw Napi::TypeError::New(env, "cairo.setSourceRGBA takes five arguments");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        const double r = info[1].As<Napi::Number>().DoubleValue();
        const double g = info[2].As<Napi::Number>().DoubleValue();
        const double b = info[3].As<Napi::Number>().DoubleValue();
        const double a = info[4].As<Napi::Number>().DoubleValue();

        cairo_set_source_rgba(cairo->cairo, r, g, b, a);

        return env.Undefined();
    }));

    graphics.Set("stroke", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.stroke takes one argument");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        cairo_save(cairo->cairo);

        if (info.Length() > 1 && info[1].IsObject()) {
            auto args = info[1].As<Napi::Object>();
            if (args.Has("path")) {
                auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(args.Get("path").As<Napi::Object>());
                cairo_append_path(cairo->cairo, path->finalizePath());
            }

            // extract stroke params
            if (args.Has("lineWidth")) {
                cairo_set_line_width(cairo->cairo, args.Get("lineWidth").As<Napi::Number>().DoubleValue());
            }
            if (args.Has("lineJoin")) {
                cairo_set_line_join(cairo->cairo, static_cast<cairo_line_join_t>(args.Get("lineWidth").As<Napi::Number>().Uint32Value()));
            }
            if (args.Has("lineCap")) {
                cairo_set_line_join(cairo->cairo, static_cast<cairo_line_join_t>(args.Get("lineCap").As<Napi::Number>().Uint32Value()));
            }
            if (args.Has("dash")) {
                // TODO
            }
        }

        cairo_stroke(cairo->cairo);
        cairo_restore(cairo->cairo);

        return env.Undefined();
    }));

    graphics.Set("fill", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.fill takes one argument");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (info.Length() > 1 && info[1].IsObject()) {
            auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[1]);
            cairo_append_path(cairo->cairo, path->finalizePath());
        }

        cairo_fill(cairo->cairo);

        return env.Undefined();
    }));

    graphics.Set("clip", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.clip takes one argument");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (info.Length() > 1 && info[1].IsObject()) {
            auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[1]);
            cairo_append_path(cairo->cairo, path->finalizePath());
        }

        cairo_clip(cairo->cairo);

        return env.Undefined();
    }));

    graphics.Set("paint", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.restore takes one argument");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!c->cairo) {
            throw Napi::TypeError::New(env, "cairo.paint no cairo?");
        }

        cairo_paint(c->cairo);

        return env.Undefined();
    }));

    graphics.Set("translate", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 3 || !info[0].IsObject() || !info[1].IsNumber() || !info[2].IsNumber()) {
            throw Napi::TypeError::New(env, "cairo.translate takes three arguments");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        const double tx = info[1].As<Napi::Number>().DoubleValue();
        const double ty = info[2].As<Napi::Number>().DoubleValue();

        if (!cairo->cairo) {
            throw Napi::TypeError::New(env, "cairo.translate no cairo?");
        }

        ++cairo->transformId;

        cairo_translate(cairo->cairo, tx, ty);

        return env.Undefined();
    }));

    graphics.Set("scale", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 3 || !info[0].IsObject() || !info[1].IsNumber() || !info[2].IsNumber()) {
            throw Napi::TypeError::New(env, "cairo.scale takes three arguments");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        const double sx = info[1].As<Napi::Number>().DoubleValue();
        const double sy = info[2].As<Napi::Number>().DoubleValue();

        if (!cairo->cairo) {
            throw Napi::TypeError::New(env, "cairo.scale no cairo?");
        }

        ++cairo->transformId;

        cairo_scale(cairo->cairo, sx, sy);

        return env.Undefined();
    }));

    graphics.Set("rotate", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsNumber()) {
            throw Napi::TypeError::New(env, "cairo.rotate takes two arguments");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        const double a = info[1].As<Napi::Number>().DoubleValue();

        if (!cairo->cairo) {
            throw Napi::TypeError::New(env, "cairo.rotate no cairo?");
        }

        ++cairo->transformId;

        cairo_rotate(cairo->cairo, a);

        return env.Undefined();
    }));

    graphics.Set("transform", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.transform takes two arguments");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!cairo->cairo) {
            throw Napi::TypeError::New(env, "cairo.transform no cairo?");
        }

        ++cairo->transformId;

        // ### should probably expose cairo_matrix_t as a wrapped object
        cairo_matrix_t mat;

        if (!arg.Has("xx")) {
            throw Napi::TypeError::New(env, "cairo.transform requires a xx");
        }
        mat.xx = arg.Get("xx").As<Napi::Number>().DoubleValue();

        if (!arg.Has("yx")) {
            throw Napi::TypeError::New(env, "cairo.transform requires a yx");
        }
        mat.yx = arg.Get("yx").As<Napi::Number>().DoubleValue();

        if (!arg.Has("xy")) {
            throw Napi::TypeError::New(env, "cairo.transform requires a xy");
        }
        mat.xy = arg.Get("xy").As<Napi::Number>().DoubleValue();

        if (!arg.Has("yy")) {
            throw Napi::TypeError::New(env, "cairo.transform requires a yy");
        }
        mat.yy = arg.Get("yy").As<Napi::Number>().DoubleValue();

        if (!arg.Has("x0")) {
            throw Napi::TypeError::New(env, "cairo.transform requires a x0");
        }
        mat.x0 = arg.Get("x0").As<Napi::Number>().DoubleValue();

        if (!arg.Has("y0")) {
            throw Napi::TypeError::New(env, "cairo.transform requires a y0");
        }
        mat.y0 = arg.Get("y0").As<Napi::Number>().DoubleValue();

        cairo_transform(cairo->cairo, &mat);

        return env.Undefined();
    }));

    graphics.Set("setMatrix", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.setMatrix takes two arguments");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!cairo->cairo) {
            throw Napi::TypeError::New(env, "cairo.setMatrix no cairo?");
        }

        ++cairo->transformId;

        // ### should probably expose cairo_matrix_t as a wrapped object
        cairo_matrix_t mat;

        if (!arg.Has("xx")) {
            throw Napi::TypeError::New(env, "cairo.setMatrix requires a xx");
        }
        mat.xx = arg.Get("xx").As<Napi::Number>().DoubleValue();

        if (!arg.Has("yx")) {
            throw Napi::TypeError::New(env, "cairo.setMatrix requires a yx");
        }
        mat.yx = arg.Get("yx").As<Napi::Number>().DoubleValue();

        if (!arg.Has("xy")) {
            throw Napi::TypeError::New(env, "cairo.setMatrix requires a xy");
        }
        mat.xy = arg.Get("xy").As<Napi::Number>().DoubleValue();

        if (!arg.Has("yy")) {
            throw Napi::TypeError::New(env, "cairo.setMatrix requires a yy");
        }
        mat.yy = arg.Get("yy").As<Napi::Number>().DoubleValue();

        if (!arg.Has("x0")) {
            throw Napi::TypeError::New(env, "cairo.setMatrix requires a x0");
        }
        mat.x0 = arg.Get("x0").As<Napi::Number>().DoubleValue();

        if (!arg.Has("y0")) {
            throw Napi::TypeError::New(env, "cairo.setMatrix requires a y0");
        }
        mat.y0 = arg.Get("y0").As<Napi::Number>().DoubleValue();

        cairo_set_matrix(cairo->cairo, &mat);

        return env.Undefined();
    }));

    graphics.Set("getMatrix", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.getMatrix takes two arguments");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!cairo->cairo) {
            throw Napi::TypeError::New(env, "cairo.getMatrix no cairo?");
        }

        // ### should probably expose cairo_matrix_t as a wrapped object
        cairo_matrix_t mat;
        cairo_get_matrix(cairo->cairo, &mat);

        auto ret = Napi::Object::New(env);
        ret.Set("xx", Napi::Number::New(env, mat.xx));
        ret.Set("yx", Napi::Number::New(env, mat.yx));
        ret.Set("xy", Napi::Number::New(env, mat.xy));
        ret.Set("yy", Napi::Number::New(env, mat.yy));
        ret.Set("x0", Napi::Number::New(env, mat.x0));
        ret.Set("y0", Napi::Number::New(env, mat.y0));

        return ret;
    }));

    graphics.Set("identityMatrix", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.identityMatrix takes two arguments");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!cairo->cairo) {
            throw Napi::TypeError::New(env, "cairo.identityMatrix no cairo?");
        }

        ++cairo->transformId;

        cairo_identity_matrix(cairo->cairo);

        return env.Undefined();
    }));

    graphics.Set("pathClose", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.pathClose takes one argument");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathClose path finalized?");
        }

        path->pathChanged = true;
        cairo_close_path(path->cairo);

        return env.Undefined();
    }));

    graphics.Set("pathArc", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 6 || !info[0].IsObject() || !info[1].IsNumber() || !info[2].IsNumber()
            || !info[3].IsNumber() || !info[4].IsNumber() || !info[5].IsNumber()) {
            throw Napi::TypeError::New(env, "cairo.pathArc takes six arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathArc path finalized?");
        }

        const double xc = info[1].As<Napi::Number>().DoubleValue();
        const double yc = info[2].As<Napi::Number>().DoubleValue();
        const double radius = info[3].As<Napi::Number>().DoubleValue();
        const double angle1 = info[4].As<Napi::Number>().DoubleValue();
        const double angle2 = info[5].As<Napi::Number>().DoubleValue();

        path->pathChanged = true;
        cairo_arc(path->cairo, xc, yc, radius, angle1, angle2);

        return env.Undefined();
    }));

    graphics.Set("pathArcNegative", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 6 || !info[0].IsObject() || !info[1].IsNumber() || !info[2].IsNumber()
            || !info[3].IsNumber() || !info[4].IsNumber() || !info[5].IsNumber()) {
            throw Napi::TypeError::New(env, "cairo.pathArcNegative takes six arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathArcNegative path finalized?");
        }

        const double xc = info[1].As<Napi::Number>().DoubleValue();
        const double yc = info[2].As<Napi::Number>().DoubleValue();
        const double radius = info[3].As<Napi::Number>().DoubleValue();
        const double angle1 = info[4].As<Napi::Number>().DoubleValue();
        const double angle2 = info[5].As<Napi::Number>().DoubleValue();

        path->pathChanged = true;
        cairo_arc_negative(path->cairo, xc, yc, radius, angle1, angle2);

        return env.Undefined();
    }));

    graphics.Set("pathCurveTo", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 7 || !info[0].IsObject() || !info[1].IsNumber() || !info[2].IsNumber()
            || !info[3].IsNumber() || !info[4].IsNumber() || !info[5].IsNumber() || !info[6].IsNumber()) {
            throw Napi::TypeError::New(env, "cairo.pathCurveTo takes seven arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathCurveTo path finalized?");
        }

        const double x1 = info[1].As<Napi::Number>().DoubleValue();
        const double y1 = info[2].As<Napi::Number>().DoubleValue();
        const double x2 = info[3].As<Napi::Number>().DoubleValue();
        const double y2 = info[4].As<Napi::Number>().DoubleValue();
        const double x3 = info[5].As<Napi::Number>().DoubleValue();
        const double y3 = info[6].As<Napi::Number>().DoubleValue();

        path->pathChanged = true;
        cairo_curve_to(path->cairo, x1, y1, x2, y2, x3, y3);

        return env.Undefined();
    }));

    graphics.Set("pathLineTo", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 3 || !info[0].IsObject() || !info[1].IsNumber() || !info[2].IsNumber()) {
            throw Napi::TypeError::New(env, "cairo.pathLineTo takes three arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathLineTo path finalized?");
        }

        const double x = info[1].As<Napi::Number>().DoubleValue();
        const double y = info[2].As<Napi::Number>().DoubleValue();

        path->pathChanged = true;
        cairo_line_to(path->cairo, x, y);

        return env.Undefined();
    }));

    graphics.Set("pathMoveTo", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 3 || !info[0].IsObject() || !info[1].IsNumber() || !info[2].IsNumber()) {
            throw Napi::TypeError::New(env, "cairo.pathMoveTo takes three arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathMoveTo path finalized?");
        }

        const double x = info[1].As<Napi::Number>().DoubleValue();
        const double y = info[2].As<Napi::Number>().DoubleValue();

        path->pathChanged = true;
        cairo_move_to(path->cairo, x, y);

        return env.Undefined();
    }));

    graphics.Set("pathRectangle", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 5 || !info[0].IsObject() || !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsNumber() || !info[4].IsNumber()) {
            throw Napi::TypeError::New(env, "cairo.pathRectangle takes five arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathRectangle path finalized?");
        }

        const double x = info[1].As<Napi::Number>().DoubleValue();
        const double y = info[2].As<Napi::Number>().DoubleValue();
        const double width = info[3].As<Napi::Number>().DoubleValue();
        const double height = info[4].As<Napi::Number>().DoubleValue();

        path->pathChanged = true;
        cairo_rectangle(path->cairo, x, y, width, height);

        return env.Undefined();
    }));

    graphics.Set("createText", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.createText takes one argument");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!cairo->cairo) {
            throw Napi::TypeError::New(env, "cairo.createText no cairo?");
        }

        auto txt = std::make_shared<Pango>(cairo);

        return Wrap<std::shared_ptr<Pango> >::wrap(env, txt);
    }));

    graphics.Set("destroyText", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.destroyText takes one argument");
        }

        auto p = Wrap<std::shared_ptr<Pango> >::unwrap(info[0]);

        if (p->layout) {
            g_object_unref(p->layout);
            p->layout = nullptr;
        }

        return env.Undefined();
    }));

    graphics.Set("textSetFont", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsString()) {
            throw Napi::TypeError::New(env, "cairo.textSetFont takes two arguments");
        }

        auto p = Wrap<std::shared_ptr<Pango> >::unwrap(info[0]);
        const std::string f = info[1].As<Napi::String>();

        if (!p->setFont(f)) {
            throw Napi::TypeError::New(env, "cairo.textSetFont couldn't update font");
        }

        return env.Undefined();
    }));

    graphics.Set("textSetText", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsString()) {
            throw Napi::TypeError::New(env, "cairo.textSetText takes two arguments");
        }

        auto p = Wrap<std::shared_ptr<Pango> >::unwrap(info[0]);
        const std::string t = info[1].As<Napi::String>();

        if (!p->setText(t)) {
            throw Napi::TypeError::New(env, "cairo.textSetText couldn't update text");
        }

        return env.Undefined();
    }));

    graphics.Set("textMetrics", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.textMetrics takes one arguments");
        }

        auto p = Wrap<std::shared_ptr<Pango> >::unwrap(info[0]);
        const auto pc = p->cairo;

        if (!pc->cairo || !p->layout) {
            throw Napi::TypeError::New(env, "cairo.textMetrics no cairo?");
        }

        if (p->cairoId != pc->transformId) {
            // cairo has changed, update pango
            pango_cairo_update_layout(pc->cairo, p->layout);
            p->cairoId = pc->transformId;
        }

        int w, h;
        pango_layout_get_size(p->layout, &w, &h);

        auto ret = Napi::Object::New(env);
        ret.Set("width", Napi::Number::New(env, w / static_cast<double>(PANGO_SCALE)));
        ret.Set("height", Napi::Number::New(env, h / static_cast<double>(PANGO_SCALE)));
        return ret;
    }));

    graphics.Set("drawText", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.drawText takes two arguments");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto p = Wrap<std::shared_ptr<Pango> >::unwrap(info[1]);

        if (!c->cairo || !p->layout) {
            throw Napi::TypeError::New(env, "cairo.drawText no cairo?");
        }

        if (p->cairo != c) {
            throw Napi::TypeError::New(env, "cairo.drawText cairo vs pango mismatch");
        }

        if (p->cairoId != c->transformId) {
            // cairo has changed, update pango
            pango_cairo_update_layout(c->cairo, p->layout);
            p->cairoId = c->transformId;
        }

        pango_cairo_show_layout(c->cairo, p->layout);

        return env.Undefined();
    }));

    return graphics;
}
} // namespace graphics
