import { OWMLib } from "./owm";
import { Logger } from "./logger";
import { ContainerItem } from "./container";
import { Workspace } from "./workspace";
import { Geometry } from "./utils";
import { XCB } from "native";

interface ConfigureArgs {
    readonly window: number;
    readonly x?: number;
    readonly y?: number;
    readonly width?: number;
    readonly height?: number;
    readonly border_width?: number;
    readonly sibling?: number;
    readonly stack_mode?: number;
}

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
    private _gc: number | undefined;
    private _pixel: number | undefined;
    private _prevPixel: number | undefined;
    private _state: Client.State;
    private _workspace: Workspace | undefined;
    private _floating: boolean;
    private _group: ClientGroup;

    constructor(owm: OWMLib, parent: number, window: XCB.Window, border: number, group: ClientGroup) {
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
        this._floating = false;
        this._type = "Client";
        this._group = group;

        this._noinput = false;
        if (window.wmHints.flags & owm.xcb.icccm.hint.INPUT)
            this._noinput = window.wmHints.input === 0;

        this._log = owm.logger.prefixed("Client");
        this._state = Client.State.Withdrawn;
    }

    get root() {
        return this._window.geometry.root;
    }

    get window() {
        return this._window;
    }

    get geometry() {
        return this._geometry;
    }

    get frame() {
        return this._parent;
    }

    get framePixel() {
        return this._pixel;
    }

    set framePixel(p: number | undefined) {
        this._pixel = p;
    }

    get frameGC() {
        if (this._prevPixel !== this._pixel) {
            this._prevPixel = this._pixel;
            this._createGC();
        }
        return this._gc;
    }

    get frameWidth() {
        return this._geometry.width + (this._border * 2);
    }

    get frameHeight() {
        return this._geometry.height + (this._border * 2);
    }

    get state() {
        return this._state;
    }

    set state(state: Client.State) {
        const xcb = this._owm.xcb;

        // we'll change the WM_STATE property regardless of the current state
        const buf = new Uint32Array(2);
        switch (state) {
        case Client.State.Normal:
            buf[0] = xcb.icccm.state.NORMAL;
            break;
        case Client.State.Withdrawn:
            buf[0] = xcb.icccm.state.WITHDRAWN;
            break;
        }

        buf[1] = xcb.none;
        xcb.change_property(this._owm.wm,
                            { window: this._window.window, mode: xcb.propMode.REPLACE,
                              property: xcb.atom.WM_STATE, type: xcb.atom.WM_STATE,
                              format: 32, data: buf });

        if (this._state === state) {
            xcb.flush(this._owm.wm);
            return;
        }

        this._state = state;

        let winMask = 0;
        let frameMask = 0;

        if (state === Client.State.Normal) {
            frameMask = xcb.eventMask.STRUCTURE_NOTIFY |
                xcb.eventMask.ENTER_WINDOW |
                xcb.eventMask.LEAVE_WINDOW |
                xcb.eventMask.EXPOSURE |
                xcb.eventMask.SUBSTRUCTURE_REDIRECT |
                xcb.eventMask.POINTER_MOTION |
                xcb.eventMask.BUTTON_PRESS |
                xcb.eventMask.BUTTON_RELEASE;
            winMask = xcb.eventMask.PROPERTY_CHANGE |
                xcb.eventMask.STRUCTURE_NOTIFY |
                xcb.eventMask.FOCUS_CHANGE;

            xcb.change_window_attributes(this._owm.wm, { window: this._window.window, event_mask: winMask });
            xcb.change_window_attributes(this._owm.wm, { window: this._parent, event_mask: frameMask });

            xcb.map_window(this._owm.wm, this._window.window);
            xcb.map_window(this._owm.wm, this._parent);
        } else {
            // make sure we change the window attributes before unmapping,
            // otherwise we'll destroy the client when we get the unmap notify
            xcb.change_window_attributes(this._owm.wm, { window: this._window.window, event_mask: winMask });
            xcb.change_window_attributes(this._owm.wm, { window: this._parent, event_mask: frameMask });

            xcb.unmap_window(this._owm.wm, this._parent);
            xcb.unmap_window(this._owm.wm, this._window.window);
        }

        xcb.flush(this._owm.wm);
    }

    get visible() {
        return this._state === Client.State.Normal;
    }

    set visible(v: boolean) {
        this.state = v ? Client.State.Normal : Client.State.Withdrawn;
    }

    get floating() {
        return this._floating;
    }

    set floating(s: boolean) {
        if (this._floating === s)
            return;
        this._floating = s;
        if (this._workspace) {
            this._workspace.relayout();
        }
        if (s) {
            // we didn't skip before, but now we do.
            // let's go back to our original geometry

            const x = this._geometry.x = this._window.geometry.x;
            const y = this._geometry.y = this._window.geometry.y;
            const width = this._geometry.width = this._window.geometry.width;
            const height = this._geometry.height = this._window.geometry.height;

            const px = x - this._border;
            const py = y - this._border;
            const pwidth = width + (this._border * 2);
            const pheight = height + (this._border * 2);

            this._owm.xcb.configure_window(this._owm.wm, {
                window: this._parent,
                x: px, y: py, width: pwidth, height: pheight
            });
            this._owm.xcb.configure_window(this._owm.wm, {
                window: this._window.window,
                x: this._border, y: this._border, width: width, height: height
            });
            this._owm.xcb.flush(this._owm.wm);
        }
    }

    get workspace() {
        return this._workspace;
    }

    set workspace(ws: Workspace | undefined) {
        this._workspace = ws;
    }

    get group() {
        return this._group;
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

    configure(cfg: ConfigureArgs) {
        if (cfg.window !== this._window.window) {
            throw new Error("configuring wrong window");
        }
        if (this._floating) {
            // let's do it
            let x, y, width, height;
            if (cfg.x !== undefined) {
                x = cfg.x;
                this._geometry.x = cfg.x;
                this._window.geometry.x = cfg.x;
            } else {
                x = this._geometry.x;
            }
            if (cfg.y !== undefined) {
                y = cfg.y;
                this._geometry.y = cfg.y;
                this._window.geometry.y = cfg.y;
            } else {
                y = this._geometry.y;
            }
            if (cfg.width !== undefined) {
                width = cfg.width;
                this._geometry.width = cfg.width;
                this._window.geometry.width = cfg.width;
            } else {
                width = this._geometry.width;
            }
            if (cfg.height !== undefined) {
                height = cfg.height;
                this._geometry.height = cfg.height;
                this._window.geometry.height = cfg.height;
            } else {
                height = this._geometry.height;
            }

            const px = x - this._border;
            const py = y - this._border;
            const pwidth = width + (this._border * 2);
            const pheight = height + (this._border * 2);

            this._owm.xcb.configure_window(this._owm.wm, {
                window: this._parent,
                x: px, y: py, width: pwidth, height: pheight
            });
            this._owm.xcb.configure_window(this._owm.wm, {
                window: cfg.window,
                x: this._border, y: this._border, width: width, height: height
            });
            this._owm.xcb.flush(this._owm.wm);
        } else {
            this._log.info("trying to configure window in layout, ignoring");
            // keep track of where the client really wants us
            if (cfg.x !== undefined) {
                this._window.geometry.x = cfg.x;
            }
            if (cfg.y !== undefined) {
                this._window.geometry.y = cfg.y;
            }
            if (cfg.width !== undefined) {
                this._window.geometry.width = cfg.width;
            }
            if (cfg.height !== undefined) {
                this._window.geometry.height = cfg.height;
            }
            this._owm.xcb.send_configure_notify(this._owm.wm, {
                window: cfg.window,
                x: this._geometry.x,
                y: this._geometry.y,
                width: this._geometry.width,
                height: this._geometry.height,
                border_width: 0
            });
        }
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
        if (this._noinput) {
            return false;
        }
        if (this._owm.focused === this) {
            return true;
        }

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

        this._owm.focused = this;

        return true;
    }

    private _createGC() {
        if (this._gc) {
            if (this._pixel) {
                this._owm.xcb.change_gc(this._owm.wm, { gc: this._gc, values: { foreground: this._pixel } });
            } else {
                this._owm.xcb.free_gc(this._owm.wm, this._gc);
                this._gc = undefined;
            }
        } else if (this._pixel !== undefined) {
            this._gc = this._owm.xcb.create_gc(this._owm.wm, { window: this._parent, values: { foreground: this._pixel } })
        }
        this._owm.xcb.flush(this._owm.wm);
    }
}

export namespace Client {
    export enum State {
        Normal,
        Withdrawn
    }
}

export function isClient(o: any): o is Client {
    return o._type === "Client";
}

export class ClientGroup {
    private _transients: Map<number, number>;
    private _followers: Set<number>;
    private _leader: number;
    private _ref: number;
    private _owm: OWMLib;

    constructor(owm: OWMLib, leader: number) {
        this._transients = new Map<number, number>();
        this._followers = new Set<number>();
        this._ref = 1;
        this._owm = owm;
        this._leader = leader;
    }

    get leaderClient(): Client | undefined {
        return this._owm.findClientByWindow(this._leader);
    }

    get leaderWindow() {
        return this._leader;
    }

    transientsForClient(client: Client): Client[] {
        const ret: Client[] = [];
        const cid = client.window.window;
        for (const [f, t] of this._transients) {
            if (t === cid) {
                const c = this._owm.findClientByWindow(f);
                if (c) {
                    ret.push(c);
                }
            }
        }
        return ret;
    }

    followerClients(): Client[] {
        const ret: Client[] = [];
        for (const f of this._followers) {
            const c = this._owm.findClientByWindow(f);
            if (c) {
                ret.push(c);
            }
        }
        return ret;
    }

    addTransient(from: number, to: number) {
        if (this._transients.has(from)) {
            throw new Error(`Group already has a transient with id ${from} (to ${to})`);
        }
        this._transients.set(from, to);
    }

    removeTransient(from: number) {
        this._transients.delete(from);
    }

    addFollower(follower: number) {
        this._followers.add(follower);
    }

    removeFollower(follower: number) {
        this._followers.delete(follower);
    }

    remove(window: number) {
        this._followers.delete(window);
        this._transients.delete(window);
        for (const [f, t] of this._transients) {
            if (t === window) {
                this._transients.delete(f);
            }
        }
    }

    ref() {
        ++this._ref;
    }

    deref() {
        return !--this._ref;
    }
}
