import { Client, isClient as itemIsClient } from "../../client";
import { Workspace, Monitor, Geometry, Logger, ContainerItem } from "../..";
import { Graphics } from "../../../native";
import { LayoutPolicy, LayoutConfig } from ".";
import { Policy } from "..";
import { default as hexRgb } from "hex-rgb";

function makeColor(color: string) {
    const c = hexRgb(color);
    c.red /= 255;
    c.green /= 255;
    c.blue /= 255;
    return c;
}

export class StackingLayoutConfig implements LayoutConfig
{
    private _type: string;
    private _font: string | undefined;
    private _height: number | undefined;
    private _pad: number | undefined;
    private _textY: number | undefined;
    private _inactiveColor: string | undefined;
    private _activeColor: string | undefined;
    private _backgroundColor: string | undefined;
    private _inactiveTextColor: string | undefined;
    private _activeTextColor: string | undefined;
    private _stackTitle: boolean;

    constructor() {
        this._type = "stacking";
        this._stackTitle = true;
    }

    get type() {
        return this._type;
    }

    get stackTitle() {
        return this._stackTitle;
    }

    set stackTitle(t: boolean) {
        this._stackTitle = t;
    }

    get textY() {
        return this._textY;
    }

    set textY(y: number | undefined) {
        this._textY = y;
    }

    get font() {
        return this._font;
    }

    set font(f: string | undefined) {
        this._font = f;
    }

    get height() {
        return this._height;
    }

    set height(h: number | undefined) {
        this._height = h;
    }

    get pad() {
        return this._pad;
    }

    set pad(p: number | undefined) {
        this._pad = p;
    }

    get inactiveColor() {
        return this._inactiveColor;
    }

    set inactiveColor(c: string | undefined) {
        this._inactiveColor = c;
    }

    get activeColor() {
        return this._activeColor;
    }

    set activeColor(c: string | undefined) {
        this._activeColor = c;
    }

    get backgroundColor() {
        return this._backgroundColor;
    }

    set backgroundColor(c: string | undefined) {
        this._backgroundColor = c;
    }

    get inactiveTextColor() {
        return this._inactiveTextColor;
    }

    set inactiveTextColor(c: string | undefined) {
        this._inactiveTextColor = c;
    }

    get activeTextColor() {
        return this._activeTextColor;
    }

    set activeTextColor(c: string | undefined) {
        this._activeTextColor = c;
    }
}

function isStackingLayoutConfig(o: any): o is StackingLayoutConfig {
    return o._type === "stacking";
}

export class StackingLayoutPolicy implements LayoutPolicy
{
    readonly Config = StackingLayoutConfig;

    private _policy: Policy;
    private _log: Logger;
    private _type: string;
    private _cfg: StackingLayoutConfig;
    private _ws: Workspace;
    private _win: number | undefined;
    private _gc: number | undefined;
    private _pixmap: number | undefined;
    private _ctx: Graphics.Context | undefined;
    private _text: Graphics.Text | undefined;
    private _width: number | undefined;
    private _height: number | undefined;
    private _copyArgs: { src_d: number, dst_d: number, gc: number, width: number, height: number };

    constructor(policy: Policy, ws: Workspace, cfg: LayoutConfig) {
        if (!isStackingLayoutConfig(cfg)) {
            throw new Error("Config needs to be a StackingLayoutConfig");
        }

        this._copyArgs = { src_d: 0, dst_d: 0, gc: 0, width: 0, height: 0 };
        this._ws = ws;

        this._type = "stacking";
        this._policy = policy;
        this._log = policy.owm.logger.prefixed("StackingLayout");
        this._cfg = cfg as StackingLayoutConfig;

        const owm = policy.owm;

        owm.events.on("windowExpose", (win: number) => {
            if (win === this._win && win !== undefined) {
                this._expose();
            }
        });
        owm.events.on("workspaceActivated", (monitor: Monitor) => {
            if (this._win === undefined)
                return;
            if (monitor === this._ws.monitor) {
                const owm = this._policy.owm;
                if (monitor.workspace === this._ws) {
                    owm.xcb.map_window(owm.wm, this._win);
                } else {
                    owm.xcb.unmap_window(owm.wm, this._win);
                }
            }
        });
    }

    get type() {
        return this._type;
    }

    get config() {
        return this._cfg as LayoutConfig;
    }

    set config(cfg: LayoutConfig) {
        if (!isStackingLayoutConfig(cfg)) {
            throw new Error("Config needs to be a StackingLayoutConfig");
        }
        this._cfg = cfg as StackingLayoutConfig;
    }

    layout(items: ContainerItem[], geometry: Geometry) {
        const filtered = items.filter((item: ContainerItem) => {
            return item.fullscreen || (!item.floating && !item.ignoreWorkspace);
        });

        const newgeom = this._updateWindow(filtered, geometry);

        if (filtered.length === 0) {
            // nothing to lay out
            return;
        }

        if (filtered.length === 1 && filtered[0].fullscreen) {
            const item = filtered[0];
            item.move(newgeom.x, newgeom.y);
            item.resize(newgeom.width, newgeom.height);
            return;
        }

        // top item gets it all
        const item = filtered[filtered.length - 1];
        item.raiseWithFloating();
        item.move(newgeom.x, newgeom.y);
        item.resize(newgeom.width, newgeom.height);
    }

    initialize() {
    }

    deinitialize() {
    }

    update() {
        // make sure we recreate & repaint everything on the next layout
        this._destroy();
    }

    private _recreatePixmap() {
        if (this._width === undefined || this._height === undefined) {
            throw new Error("_recreatePixmap called with undefined width/height");
        }
        if (this._win === undefined || this._gc === undefined) {
            throw new Error("_recreatePixmap called with undefined win/gc");
        }

        const owm = this._policy.owm;
        const xcb = owm.xcb;

        if (this._pixmap !== undefined) {
            xcb.free_pixmap(owm.wm, this._pixmap);
        }
        this._pixmap = xcb.create_pixmap(owm.wm, { width: this._width, height: this._height });
        this._ctx = owm.engine.createFromDrawable(owm.wm, { drawable: this._pixmap, width: this._width, height: this._height });
        this._text = owm.engine.createText(this._ctx);

        this._copyArgs = {
            src_d: this._pixmap,
            dst_d: this._win,
            gc: this._gc,
            width: this._width,
            height: this._height
        };
    }

    private _repaint(items: ContainerItem[]) {
        if (this._pixmap === undefined || this._ctx === undefined || this._width === undefined || this._text === undefined) {
            throw new Error(`pixmap/ctx/width/text undefined ${this._pixmap} - ${this._ctx} - ${this._width} - ${this._text}`);
        }

        const engine = this._policy.owm.engine;
        const h = this._cfg.height || 25;
        const p = this._cfg.pad || 0;
        const yoff = this._cfg.textY || 4;
        const ctx = this._ctx;
        const width = this._width;
        const text = this._text;

        engine.textSetFont(text, this._cfg.font || "Sans Bold 10");

        const { red: backRed, green: backGreen, blue: backBlue } = makeColor(this._cfg.backgroundColor || "#000");
        engine.setSourceRGB(ctx, backRed, backGreen, backBlue);
        engine.paint(ctx);

        const { red: inRed, green: inGreen, blue: inBlue } = makeColor(this._cfg.inactiveColor || "#292");
        const { red: actRed, green: actGreen, blue: actBlue } = makeColor(this._cfg.activeColor || "#4B4");
        const { red: inTxtRed, green: inTxtGreen, blue: inTxtBlue } = makeColor(this._cfg.inactiveTextColor || "#922");
        const { red: actTxtRed, green: actTxtGreen, blue: actTxtBlue } = makeColor(this._cfg.activeTextColor || "#B44");

        let y = 0;
        const len = items.length;
        items.forEach((item, idx) => {
            if (!itemIsClient(item))
                return;
            const client = item as Client;
            if (idx < len - 1) {
                engine.setSourceRGB(ctx, inRed, inGreen, inBlue);
            } else {
                engine.setSourceRGB(ctx, actRed, actGreen, actBlue);
            }
            engine.pathRectangle(ctx, 0, y, width, h);
            engine.fill(ctx);

            engine.textSetText(text, client.name);
            const metrics = engine.textMetrics(text);

            // center
            engine.save(ctx);
            engine.translate(ctx, (width / 2) - (metrics.width / 2), y + yoff);
            if (idx < len - 1) {
                engine.setSourceRGB(ctx, inTxtRed, inTxtGreen, inTxtBlue);
            } else {
                engine.setSourceRGB(ctx, actTxtRed, actTxtGreen, actTxtBlue);
            }
            engine.drawText(ctx, text);
            engine.restore(ctx);

            y += h + p;
        });
    }

    private _expose() {
        const owm = this._policy.owm;
        const xcb = owm.xcb;
        xcb.copy_area(owm.wm, this._copyArgs);
    }

    private _createWindow(x: number, y: number) {
        if (this._width === undefined || this._height === undefined) {
            throw new Error("_createWindow called with undefined width/height");
        }

        const owm = this._policy.owm;
        const xcb = owm.xcb;

        const win = xcb.create_window(owm.wm, {
            parent: owm.root,
            x: x,
            y: y,
            width: this._width,
            height: this._height
        });

        const instanceName = Buffer.from("owmstackingtitle");
        const className = Buffer.from("OwmStackingTitle");
        const zero = Buffer.alloc(1);
        const wmClass = Buffer.concat([ instanceName, zero, className, zero ]);
        xcb.change_property(owm.wm, {
            window: win,
            mode: xcb.propMode.REPLACE,
            property: xcb.atom.WM_CLASS,
            type: xcb.atom.STRING,
            format: 8, data: wmClass
        });

        const winMask = xcb.eventMask.ENTER_WINDOW |
            xcb.eventMask.LEAVE_WINDOW |
            xcb.eventMask.EXPOSURE |
            xcb.eventMask.BUTTON_PRESS |
            xcb.eventMask.BUTTON_RELEASE;
        xcb.change_window_attributes(owm.wm, { window: win, event_mask: winMask, override_redirect: 1 });

        const black = owm.makePixel("#000");
        const white = owm.makePixel("#fff");
        this._gc = xcb.create_gc(owm.wm, { window: win, values: { foreground: black, background: white, graphics_exposures: 0 } });

        if (this._ws.active) {
            xcb.map_window(owm.wm, win);
        }

        return win;
    }

    private _updateWindow(items: ContainerItem[], geometry: Geometry) {
        if (!this._cfg.stackTitle) {
            return geometry;
        }

        // special case, do nothing if we have no window and no items
        if (items.length === 0 && this._width === undefined && this._height === undefined) {
            return geometry;
        }

        // ### if any of the items are not clients then they should not be counted for this
        const newHeight = (items.length * (this._cfg.height || 25)) + (items.length > 0 ? ((items.length - 1) * (this._cfg.pad || 0)) : 0);
        const newWidth = geometry.width;

        const owm = this._policy.owm;
        const xcb = owm.xcb;

        // if our new height is 0, delete what we have
        if (newHeight === 0) {
            this._destroy();
            return geometry;
        }

        if (newHeight !== this._height || newWidth !== this._width) {
            this._height = newHeight;
            this._width = newWidth;

            if (this._win === undefined) {
                this._win = this._createWindow(geometry.x, geometry.y);
            } else {
                xcb.configure_window(owm.wm, { window: this._win, x: geometry.x, y: geometry.y, width: newWidth, height: newHeight });
            }

            this._recreatePixmap();
        } else {
            if (this._win === undefined) {
                throw new Error("_updateWindow called with undefined win");
            }

            xcb.configure_window(owm.wm, { window: this._win, x: geometry.x, y: geometry.y });
        }

        this._repaint(items);
        this._expose();

        return new Geometry({ x: geometry.x, y: geometry.y + newHeight, width: geometry.width, height: geometry.height - newHeight });
    }

    private _destroy() {
        const owm = this._policy.owm;
        const xcb = owm.xcb;

        this._width = undefined;
        this._height = undefined;
        // ### should we reintroduce the destroy_ctx function?
        this._ctx = undefined;
        if (this._pixmap) {
            xcb.free_pixmap(owm.wm, this._pixmap);
            this._pixmap = undefined;
        }
        if (this._gc) {
            xcb.free_gc(owm.wm, this._gc);
            this._gc = undefined;
        }
        if (this._win) {
            xcb.destroy_window(owm.wm, this._win);
            this._win = undefined;
        }
        this._copyArgs = { src_d: 0, dst_d: 0, gc: 0, width: 0, height: 0 };
    }
}

export function isStackingLayout(o: any): o is StackingLayoutPolicy {
    return o._type === "stacking";
}
