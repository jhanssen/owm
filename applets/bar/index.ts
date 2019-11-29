import { OWMLib, Geometry, Monitor } from "../../lib";
import { Graphics } from "../../native";
import { Clock, ClockConfig,
         Load, LoadConfig,
         IpAddress, IpAddressConfig,
         Message, MessageConfig,
         Title, TitleConfig,
         Workspace, WorkspaceConfig } from "./modules";
import { EventEmitter } from "events";
import { default as hexRgb } from "hex-rgb";

export interface BarModuleConfig
{
}

export interface BarModule extends EventEmitter
{
    paint: (engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) => void;
    geometry: (geometry: Geometry) => Geometry;
}
type BarModuleConstructor = { new(owm: OWMLib, bar: Bar, config: BarModuleConfig): BarModule };

interface BarConfig
{
    backgroundColor: string;
    modules: {[key: string]: { position: Bar.Position, config: BarModuleConfig }};
    height?: number;
}

interface Module
{
    position: Bar.Position;
    geometry: Geometry;
    module: BarModule;
}

function makeColor(color: string) {
    const c = hexRgb(color);
    c.red /= 255;
    c.green /= 255;
    c.blue /= 255;
    return c;
}

function align(from: number, to: number, position: Bar.Position) {
    switch (position) {
    case Bar.Position.Left:
        return 0;
    case Bar.Position.Middle:
        return (to / 2) - (from / 2);
    case Bar.Position.Right:
        return to - from;
    }
    throw new Error("can't happen");
}

export class Bar
{
    public static readonly Pad = { x: 2, y: 2 };
    public static readonly makeColor = makeColor;
    public static readonly align = align;

    private _width: number;
    private _height: number;
    private _win: number;
    private _pixmap: number;
    private _gc: number;
    private _ready: boolean;
    private _owm: OWMLib;
    private _ctx: Graphics.Context;
    private _copyArgs: { src_d: number, dst_d: number, gc: number, width: number, height: number };
    private _modules: Map<Bar.Position, Module[]>;
    private _backgroundColor: { red: number, green: number, blue: number, alpha: number };
    private _availableModules: {[key: string]: BarModuleConstructor };
    private _monitor: Monitor;

    constructor(owm: OWMLib, output: string, config: BarConfig, extraModules?: {[key: string]: BarModuleConstructor }) {
        this._owm = owm;
        this._modules = new Map<Bar.Position, Module[]>();
        this._ready = false;

        this._availableModules = {
            clock: Clock,
            load: Load,
            ipaddress: IpAddress,
            message: Message,
            title: Title,
            workspace: Workspace
        };

        const monitor = owm.monitors.monitorByOutput(output);
        if (!monitor) {
            throw new Error(`No monitor called ${output}`);
        }
        this._monitor = monitor;
        const width = monitor.screen.width;

        // console.log("bar width", width);
        this._width = width;
        this._height = config.height || 20;

        const xcb = owm.xcb;
        const win = xcb.create_window(owm.wm, {
            parent: owm.root,
            x: monitor.geometry.x,
            y: monitor.geometry.y,
            width: this._width,
            height: this._height
        });
        this._win = win;

        // console.log("parent is/was", owm.root.toString(16));

        const strutData = new Uint32Array(12);
        strutData[2] = this._height;
        xcb.change_property(owm.wm, {
            window: win,
            mode: xcb.propMode.REPLACE,
            property: xcb.atom._NET_WM_STRUT_PARTIAL,
            type: xcb.atom.CARDINAL,
            format: 32, data: strutData
        });

        const windowTypeData = new Uint32Array(1);
        windowTypeData[0] = xcb.atom._NET_WM_WINDOW_TYPE_DOCK;
        xcb.change_property(owm.wm, {
            window: win,
            mode: xcb.propMode.REPLACE,
            property: xcb.atom._NET_WM_WINDOW_TYPE,
            type: xcb.atom.ATOM,
            format: 32, data: windowTypeData
        });

        const desktopData = new Uint32Array(1);
        desktopData[0] = 0xffffffff;
        xcb.change_property(owm.wm, {
            window: win,
            mode: xcb.propMode.REPLACE,
            property: xcb.atom._NET_WM_DESKTOP,
            type: xcb.atom.CARDINAL,
            format: 32, data: desktopData
        });

        const instanceName = Buffer.from("owmbar");
        const className = Buffer.from("OwmBar");
        const zero = Buffer.alloc(1);
        const wmClass = Buffer.concat([ instanceName, zero, className, zero ]);
        xcb.change_property(owm.wm, {
            window: win,
            mode: xcb.propMode.REPLACE,
            property: xcb.atom.WM_CLASS,
            type: xcb.atom.STRING,
            format: 8, data: wmClass
        });

        xcb.flush(owm.wm);

        process.nextTick(() => {
            const wininfo = xcb.request_window_information(owm.wm, win);
            if (!wininfo) {
                throw new Error("No wininfo for bar");
            }
            // console.log("gugug", this._win.toString(16), wininfo);

            owm.addClient(wininfo);
        });

        this._pixmap = xcb.create_pixmap(owm.wm, { width: this._width, height: this._height });
        this._ctx = owm.engine.createFromDrawable(owm.wm, { drawable: this._pixmap, width: this._width, height: this._height });
        // this._surface = owm.engine.createPNGSurface(this._ctx, pngBuffer);
        // this._surfaceSize = owm.engine.surfaceSize(this._surface);
        // this._surfaceRatio = this._height / this._surfaceSize.width;

        const barMatchClassCondition = new owm.Match.MatchWMClass({ class: "OwmBar" });
        const barMatch = new owm.Match((client) => {
            if (client.window.window !== this._win) {
                return;
            }
            this._ready = true;

            const xcb = owm.xcb;
            const winMask = xcb.eventMask.ENTER_WINDOW |
                xcb.eventMask.LEAVE_WINDOW |
                xcb.eventMask.EXPOSURE |
                xcb.eventMask.POINTER_MOTION |
                xcb.eventMask.BUTTON_PRESS |
                xcb.eventMask.BUTTON_RELEASE |
                xcb.eventMask.PROPERTY_CHANGE |
                xcb.eventMask.STRUCTURE_NOTIFY |
                xcb.eventMask.FOCUS_CHANGE;

            xcb.change_window_attributes(owm.wm, { window: client.window.window, event_mask: winMask });
            this._update();
        });
        barMatch.addCondition(barMatchClassCondition);
        owm.addMatch(barMatch);

        owm.events.on("clientExpose", client => {
            if (client.window.window === this._win) {
                this._onExpose();
            }
        });

        const black = owm.makePixel("#000");
        const white = owm.makePixel("#fff");
        this._gc = xcb.create_gc(owm.wm, { window: win, values: { foreground: black, background: white, graphics_exposures: 0 } });

        this._copyArgs = {
            src_d: this._pixmap,
            dst_d: win,
            gc: this._gc,
            width: this._width,
            height: this._height
        };

        this._backgroundColor = makeColor(config.backgroundColor);

        // initialize modules
        const fullGeom = new Geometry({ x: 0, y: 0, width: this._width, height: this._height });

        const createModule = (module: { position: Bar.Position, config: BarModuleConfig }, ctor: BarModuleConstructor) => {
            const c = new ctor(owm, this, module.config || {});
            const m = { position: module.position, geometry: fullGeom, module: c };
            const a = this._modules.get(m.position);
            if (a !== undefined) {
                a.push(m);
            } else {
                this._modules.set(m.position, [m]);
            }
            c.on("updated", () => { this._update(); });
            c.on("geometryChanged", () => { this._relayout(); });
        };

        for (const [name, module] of Object.entries(config.modules)) {
            if (name in this._availableModules) {
                createModule(module, this._availableModules[name]);
            } else if (extraModules && name in extraModules) {
                createModule(module, extraModules[name]);
            } else {
                throw new Error(`unknown bar module ${name}`);
            }
        }

        this._relayout();
    }

    get ctx() {
        return this._ctx;
    }

    get monitor() {
        return this._monitor;
    }

    modules(position: Bar.Position) {
        return this._modules.get(position);
    }

    private _update() {
        if (!this._ready)
            return;

        this._redraw();
        const owm = this._owm;
        owm.xcb.send_expose(owm.wm, { window: this._win, width: this._width, height: this._height });
    }

    private _relayout() {
        // calculate positions
        const fullGeom = new Geometry({ x: 0, y: 0, width: this._width, height: this._height });

        const lefts = this._modules.get(Bar.Position.Left);
        if (lefts !== undefined) {
            let x = Bar.Pad.x;
            for (const e of lefts) {
                const ng = e.module.geometry(fullGeom);
                e.geometry = new Geometry(ng);
                e.geometry.x = x;
                e.geometry.y += Bar.Pad.y;

                x += e.geometry.width + Bar.Pad.x;
            }
        }
        const rights = this._modules.get(Bar.Position.Right);
        if (rights !== undefined) {
            let x = this._width - Bar.Pad.x;
            for (const e of rights) {
                const ng = e.module.geometry(fullGeom);
                x -= ng.width;
                e.geometry = new Geometry(ng);
                e.geometry.x = x;
                e.geometry.y += Bar.Pad.y;

                x -= Bar.Pad.x;
            }
        }
        const mids = this._modules.get(Bar.Position.Middle);
        if (mids !== undefined) {
            let x = 0;
            const last = mids.length;
            for (const [idx, e] of mids.entries()) {
                const ng = e.module.geometry(fullGeom);
                e.geometry = new Geometry(ng);
                e.geometry.x = x;
                e.geometry.y += Bar.Pad.y;

                x += e.geometry.width;
                if (idx < last - 1)
                    x += Bar.Pad.x;
            }

            const off = (this._width / 2) - (x / 2);
            for (const e of mids) {
                e.geometry.x += off;
            }
        }

        this._update();
    }

    private _onExpose() {
        const xcb = this._owm.xcb;
        xcb.copy_area(this._owm.wm, this._copyArgs);
    }

    private _redraw() {
        const engine = this._owm.engine;

        const { red, green, blue } = this._backgroundColor;
        engine.setSourceRGB(this._ctx, red, green, blue);
        engine.paint(this._ctx);

        for (const [position, modules] of this._modules) {
            for (const module of modules) {
                engine.save(this._ctx);
                engine.pathRectangle(this._ctx, module.geometry.x, module.geometry.y, module.geometry.width, module.geometry.height);
                engine.clip(this._ctx);
                engine.translate(this._ctx, module.geometry.x, module.geometry.y);
                module.module.paint(engine, this._ctx, module.geometry);
                engine.restore(this._ctx);
            }
        }
    }
}

export namespace Bar {
    export enum Position {
        Left,
        Middle,
        Right
    }
}
