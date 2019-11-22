#include "graphics.h"
#include "owm.h"
#include <cairo-xcb.h>
#include <pango/pangocairo.h>

using namespace graphics;
template<typename T>
using Wrap = owm::Wrap<T>;
using WM = owm::WM;

struct Cairo
{
    Cairo(cairo_surface_t* s, cairo_t* c)
        : surface(s), path(nullptr), cairo(c), transformId(0), pathChanged(false)
    {
    }
    Cairo(const std::shared_ptr<Cairo>& other)
        : cairo(cairo_create(surface)), transformId(0), pathChanged(false)
    {
        surface = cairo_surface_reference(other->surface);
    }
    ~Cairo()
    {
        if (cairo) {
            cairo_destroy(cairo);
        }
        if (surface) {
            cairo_surface_destroy(surface);
        }
        if (path) {
            cairo_path_destroy(path);
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
    cairo_path_t* path;
    cairo_t* cairo;
    uint32_t transformId;
    bool pathChanged;
};

struct Surface
{
    Surface(cairo_surface_t* s, const std::shared_ptr<Cairo>& parent)
        : surface(s)
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
    std::weak_ptr<Cairo> cairo;
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
        const auto drawable = arg.Get("window").As<Napi::Number>().Uint32Value();

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

        auto c = std::make_shared<Cairo>(surface, cairo);

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

    graphics.Set("destroy", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.destroy takes one argument");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!c->cairo) {
            return env.Undefined();
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

    graphics.Set("appendPath", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.appendPath takes two arguments");
        }

        auto dc = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto sc = Wrap<std::shared_ptr<Cairo> >::unwrap(info[1]);

        if (!dc->cairo || !sc->cairo) {
            return env.Undefined();
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
            return env.Undefined();
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
            return env.Undefined();
        }

        cairo_restore(c->cairo);

        return env.Undefined();
    }));

    graphics.Set("createPNGSurface", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.createPNGSurface takes two arguments");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!c->cairo) {
            throw Napi::TypeError::New(env, "cairo.createPNGSurface invalid cairo");
        }

        if (!arg.Has("data")) {
            throw Napi::TypeError::New(env, "cairo.createPNGSurface requires a data");
        }

        size_t size;
        size_t offset;

        const auto ndata = arg.Get("data");
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
            throw Napi::TypeError::New(env, "cairo.createPNGSurface data must be an arraybuffer or typedarray");
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

        auto s = std::make_shared<Surface>(pngs, c);

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

    graphics.Set("setSourceSurface", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.setSourceSurface takes two arguments");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto s = Wrap<std::shared_ptr<Surface> >::unwrap(info[1]);

        cairo_set_source_surface(c->cairo, s->surface, 0., 0.);

        return env.Undefined();
    }));

    graphics.Set("setSourceRGBA", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.setSourceRGBA takes two arguments");
        }

        auto cairo = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        double r, g, b, a;

        if (!arg.Has("r")) {
            throw Napi::TypeError::New(env, "cairo.setSourceRGBA requires a r");
        }
        r = arg.Get("r").As<Napi::Number>().DoubleValue();

        if (!arg.Has("g")) {
            throw Napi::TypeError::New(env, "cairo.setSourceRGBA requires a g");
        }
        g = arg.Get("g").As<Napi::Number>().DoubleValue();

        if (!arg.Has("b")) {
            throw Napi::TypeError::New(env, "cairo.setSourceRGBA requires a b");
        }
        b = arg.Get("b").As<Napi::Number>().DoubleValue();

        if (!arg.Has("a")) {
            throw Napi::TypeError::New(env, "cairo.setSourceRGBA requires a a");
        }
        a = arg.Get("a").As<Napi::Number>().DoubleValue();

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

    graphics.Set("paint", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.restore takes one argument");
        }

        auto c = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);

        if (!c->cairo) {
            return env.Undefined();
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
            return env.Undefined();
        }

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
            return env.Undefined();
        }

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
            return env.Undefined();
        }

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
            return env.Undefined();
        }

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
            return env.Undefined();
        }

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
            return env.Undefined();
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

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.pathArc takes two arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathArc path finalized?");
        }

        double xc, yc, radius, angle1, angle2;

        if (!arg.Has("xc")) {
            throw Napi::TypeError::New(env, "cairo.pathArc requires a xc");
        }
        xc = arg.Get("xc").As<Napi::Number>().DoubleValue();

        if (!arg.Has("yc")) {
            throw Napi::TypeError::New(env, "cairo.pathArc requires a yc");
        }
        yc = arg.Get("yc").As<Napi::Number>().DoubleValue();

        if (!arg.Has("radius")) {
            throw Napi::TypeError::New(env, "cairo.pathArc requires a radius");
        }
        radius = arg.Get("radius").As<Napi::Number>().DoubleValue();

        if (!arg.Has("angle1")) {
            throw Napi::TypeError::New(env, "cairo.pathArc requires a angle1");
        }
        angle1 = arg.Get("angle1").As<Napi::Number>().DoubleValue();

        if (!arg.Has("angle2")) {
            throw Napi::TypeError::New(env, "cairo.pathArc requires a angle2");
        }
        angle2 = arg.Get("angle2").As<Napi::Number>().DoubleValue();

        path->pathChanged = true;
        cairo_arc(path->cairo, xc, yc, radius, angle1, angle2);

        return env.Undefined();
    }));

    graphics.Set("pathArcNegative", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.pathArcNegative takes two arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathArcNegative path finalized?");
        }

        double xc, yc, radius, angle1, angle2;

        if (!arg.Has("xc")) {
            throw Napi::TypeError::New(env, "cairo.pathArcNegative requires a xc");
        }
        xc = arg.Get("xc").As<Napi::Number>().DoubleValue();

        if (!arg.Has("yc")) {
            throw Napi::TypeError::New(env, "cairo.pathArcNegative requires a yc");
        }
        yc = arg.Get("yc").As<Napi::Number>().DoubleValue();

        if (!arg.Has("radius")) {
            throw Napi::TypeError::New(env, "cairo.pathArcNegative requires a radius");
        }
        radius = arg.Get("radius").As<Napi::Number>().DoubleValue();

        if (!arg.Has("angle1")) {
            throw Napi::TypeError::New(env, "cairo.pathArcNegative requires a angle1");
        }
        angle1 = arg.Get("angle1").As<Napi::Number>().DoubleValue();

        if (!arg.Has("angle2")) {
            throw Napi::TypeError::New(env, "cairo.pathArcNegative requires a angle2");
        }
        angle2 = arg.Get("angle2").As<Napi::Number>().DoubleValue();

        path->pathChanged = true;
        cairo_arc_negative(path->cairo, xc, yc, radius, angle1, angle2);

        return env.Undefined();
    }));

    graphics.Set("pathCurveTo", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.pathCurveTo takes two arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathCurveTo path finalized?");
        }

        double x1, y1, x2, y2, x3, y3;

        if (!arg.Has("x1")) {
            throw Napi::TypeError::New(env, "cairo.pathCurveTo requires a x1");
        }
        x1 = arg.Get("x1").As<Napi::Number>().DoubleValue();

        if (!arg.Has("y1")) {
            throw Napi::TypeError::New(env, "cairo.pathCurveTo requires a y1");
        }
        y1 = arg.Get("y1").As<Napi::Number>().DoubleValue();

        if (!arg.Has("x2")) {
            throw Napi::TypeError::New(env, "cairo.pathCurveTo requires a x2");
        }
        x2 = arg.Get("x2").As<Napi::Number>().DoubleValue();

        if (!arg.Has("y2")) {
            throw Napi::TypeError::New(env, "cairo.pathCurveTo requires a y2");
        }
        y2 = arg.Get("y2").As<Napi::Number>().DoubleValue();

        if (!arg.Has("x3")) {
            throw Napi::TypeError::New(env, "cairo.pathCurveTo requires a x3");
        }
        x3 = arg.Get("x3").As<Napi::Number>().DoubleValue();

        if (!arg.Has("y3")) {
            throw Napi::TypeError::New(env, "cairo.pathCurveTo requires a y3");
        }
        y3 = arg.Get("y3").As<Napi::Number>().DoubleValue();

        path->pathChanged = true;
        cairo_curve_to(path->cairo, x1, y1, x2, y2, x3, y3);

        return env.Undefined();
    }));

    graphics.Set("pathLineTo", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.pathLineTo takes two arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathLineTo path finalized?");
        }

        double x, y;

        if (!arg.Has("x")) {
            throw Napi::TypeError::New(env, "cairo.pathLineTo requires a x");
        }
        x = arg.Get("x").As<Napi::Number>().DoubleValue();

        if (!arg.Has("y")) {
            throw Napi::TypeError::New(env, "cairo.pathLineTo requires a y");
        }
        y = arg.Get("y").As<Napi::Number>().DoubleValue();

        path->pathChanged = true;
        cairo_line_to(path->cairo, x, y);

        return env.Undefined();
    }));

    graphics.Set("pathMoveTo", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.pathMoveTo takes two arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathMoveTo path finalized?");
        }

        double x, y;

        if (!arg.Has("x")) {
            throw Napi::TypeError::New(env, "cairo.pathMoveTo requires a x");
        }
        x = arg.Get("x").As<Napi::Number>().DoubleValue();

        if (!arg.Has("y")) {
            throw Napi::TypeError::New(env, "cairo.pathMoveTo requires a y");
        }
        y = arg.Get("y").As<Napi::Number>().DoubleValue();

        path->pathChanged = true;
        cairo_move_to(path->cairo, x, y);

        return env.Undefined();
    }));

    graphics.Set("pathRectangle", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
        auto env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            throw Napi::TypeError::New(env, "cairo.pathRectangle takes two arguments");
        }

        auto path = Wrap<std::shared_ptr<Cairo> >::unwrap(info[0]);
        auto arg = info[1].As<Napi::Object>();

        if (!path->cairo) {
            throw Napi::TypeError::New(env, "cairo.pathRectangle path finalized?");
        }

        double x, y, width, height;

        if (!arg.Has("x")) {
            throw Napi::TypeError::New(env, "cairo.pathRectangle requires a x");
        }
        x = arg.Get("x").As<Napi::Number>().DoubleValue();

        if (!arg.Has("y")) {
            throw Napi::TypeError::New(env, "cairo.pathRectangle requires a y");
        }
        y = arg.Get("y").As<Napi::Number>().DoubleValue();

        if (!arg.Has("width")) {
            throw Napi::TypeError::New(env, "cairo.pathRectangle requires a width");
        }
        width = arg.Get("width").As<Napi::Number>().DoubleValue();

        if (!arg.Has("height")) {
            throw Napi::TypeError::New(env, "cairo.pathRectangle requires a height");
        }
        height = arg.Get("height").As<Napi::Number>().DoubleValue();

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
            return env.Undefined();
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
        const auto pc = p->cairo.lock();

        if (!pc->cairo || !p->layout) {
            return env.Undefined();
        }

        if (p->cairoId != pc->transformId) {
            // cairo has changed, update pango
            pango_cairo_update_layout(pc->cairo, p->layout);
            p->cairoId = pc->transformId;
        }

        int w, h;
        pango_layout_get_size(p->layout, &w, &h);

        auto ret = Napi::Object::New(env);
        ret.Set("width", Napi::Number::New(env, w / PANGO_SCALE));
        ret.Set("height", Napi::Number::New(env, w / PANGO_SCALE));

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
            return env.Undefined();
        }

        const auto pc = p->cairo.lock();
        if (pc != c) {
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
