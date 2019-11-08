import { OWMLib } from "./owm";
import { Logger } from "./logger";
import { ContainerItem } from "./container";
import { Geometry } from "./utils";
import { XCB } from "native";

export class Client implements ContainerItem
{
    private readonly _parent: number;
    private readonly _window: XCB.Window;
    private readonly _owm: OWMLib;
    private readonly _border: number;
    private _geometry: Geometry;
    private _noinput: boolean;
    private _log: Logger;
    private _type: string;

    constructor(owm: OWMLib, parent: number, window: XCB.Window, border: number) {
        this._owm = owm;
        this._parent = parent;
        this._window = window;
        this._border = border;
        this._geometry = {
            x: window.geometry.x,
            y: window.geometry.y,
            width: window.geometry.width,
            height: window.geometry.height
        };
        this._type = "Client";

        this._noinput = false;
        if (window.wmHints.flags & owm.xcb.icccm.hint.INPUT)
            this._noinput = window.wmHints.input === 0;

        this._log = owm.logger.prefixed("Client");
    }

    get root() {
        return this._window.geometry.root;
    }

    get geometry() {
        return this._geometry;
    }

    get frame() {
        return this._parent;
    }

    move(x: number, y: number) {
        this._owm.xcb.configure_window(this._owm.wm, {
            window: this._parent,
            x: x,
            y: y
        });
        this._geometry.x = x + this._border;
        this._geometry.y = y + this._border;
        this._owm.xcb.flush(this._owm.wm);
    }

    resize(width: number, height: number) {
        if (width <= (this._border * 2) || height <= (this._border * 2)) {
            throw new Error("size too small");
        }
        this._owm.xcb.configure_window(this._owm.wm, {
            window: this._parent,
            width: width,
            height: height
        });
        this._geometry.width = width - (this._border * 2);
        this._geometry.height = height - (this._border * 2);
        this._owm.xcb.configure_window(this._owm.wm, {
            window: this._window.window,
            width: this._geometry.width,
            height: this._geometry.height
        });
        this._owm.xcb.flush(this._owm.wm);
    }

    map() {
        this._owm.xcb.map_window(this._owm.wm, this._parent);
        this._owm.xcb.flush(this._owm.wm);
    }

    unmap() {
        this._owm.xcb.unmap_window(this._owm.wm, this._parent);
        this._owm.xcb.flush(this._owm.wm);
    }

    focus() {
        if (this._noinput)
            return;

        const takeFocus = this._owm.xcb.atom.WM_TAKE_FOCUS;
        if (this._window.wmProtocols.includes(takeFocus)) {
            this._log.info("sending client message");
            const data = new Uint32Array(2);
            data[0] = takeFocus;
            data[1] = this._owm.currentTime;
            this._owm.xcb.send_client_message(this._owm.wm, { window: this._window.window, type: this._owm.xcb.atom.WM_PROTOCOLS, data: data });
        }

        this._owm.xcb.set_input_focus(this._owm.wm, { window: this._window.window, revert_to: this._owm.xcb.inputFocus.FOCUS_PARENT,
                                                      time: this._owm.currentTime });

        const activeData = new Uint32Array(1);
        activeData[0] = this._window.window;
        this._owm.xcb.change_property(this._owm.wm, { window: this._window.geometry.root, mode: this._owm.xcb.propMode.REPLACE,
                                                      property: this._owm.xcb.atom._NET_ACTIVE_WINDOW, type: this._owm.xcb.atom.WINDOW,
                                                      format: 32, data: activeData });
        this._owm.xcb.flush(this._owm.wm);

        this._owm.setFocused(this);
    }
};

export function isClient(o: any): o is Client {
    return o._type === "Client";
}
