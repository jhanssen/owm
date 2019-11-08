import { XCB, OWM } from "native";
import { Policy } from "./policy";
import { Keybindings } from "./keybindings";
import { Logger, ConsoleLogger } from "./logger";
import { Workspace, Workspaces } from "./workspace";
import { Client } from "./client";
import { EventEmitter } from "events";
import { default as hexRgb } from "hex-rgb";

interface ClientInternal
{
    readonly _parent: number;
    readonly _window: XCB.Window;
};

function makePixel(hex: string): number
{
    const rgba = hexRgb(hex);
    return ((rgba.alpha * 255) << 24) | (rgba.red << 16) | (rgba.green << 8) | rgba.blue;
}

export class OWMLib {
    private readonly _wm: OWM.WM;
    private readonly _xcb: OWM.XCB;
    private readonly _xkb: OWM.XKB;
    private _clients: Client[];
    private _workspaces: Workspaces;
    private _currentTime: number;
    private _clientsByWindow: Map<number, Client>;
    private _clientsByFrame: Map<number, Client>;
    private _policy: Policy;
    private _focused: Client | undefined;
    private _log: Logger;
    private _bindings: Keybindings;
    private _root: number;
    private _events: EventEmitter;
    private _settled: boolean;
    private _onsettled: { (): void }[];

    public readonly Workspace = Workspace;

    constructor(wm: OWM.WM, xcb: OWM.XCB, xkb: OWM.XKB, loglevel: Logger.Level) {
        this._wm = wm;
        this._xcb = xcb;
        this._xkb = xkb;
        this._settled = false;
        this._onsettled = [];

        this._log = new ConsoleLogger(loglevel);
        this._root = 0;
        this._events = new EventEmitter();

        this._policy = new Policy(this);

        this._clients = [];
        this._workspaces = new Workspaces(this);
        this._clientsByWindow = new Map<number, Client>();
        this._clientsByFrame = new Map<number, Client>();
        this._currentTime = 0;
        this._focused = undefined;
        this._bindings = new Keybindings(this);
    };

    get wm() {
        return this._wm;
    }

    get xcb() {
        return this._xcb;
    }

    get xkb() {
        return this._xkb;
    }

    get root() {
        return this._root;
    }

    get clients(): Client[] {
        return this._clients;
    }

    get currentTime(): number {
        return this._currentTime;
    }

    get policy(): Policy {
        return this._policy;
    }

    get bindings() {
        return this._bindings;
    }

    get logger() {
        return this._log;
    }

    get workspaces() {
        return this._workspaces;
    }

    get events() {
        return this._events;
    }

    findClient(window: number): Client | undefined {
        let client = this._clientsByWindow.get(window);
        if (!client) {
            client = this._clientsByFrame.get(window);
        }
        return client;
    }

    addClient(win: XCB.Window, map?: boolean) {
        this._log.debug("client", win);

        // reparent to new window
        const border = 10;
        const parent = this.xcb.create_window(this.wm, { x: win.geometry.x, y: win.geometry.y,
                                                         width: win.geometry.width + (border * 2),
                                                         height: win.geometry.height + (border * 2),
                                                         parent: win.geometry.root });

        const frameMask = this.xcb.eventMask.STRUCTURE_NOTIFY |
            this.xcb.eventMask.ENTER_WINDOW |
            this.xcb.eventMask.LEAVE_WINDOW |
            this.xcb.eventMask.EXPOSURE |
            this.xcb.eventMask.SUBSTRUCTURE_REDIRECT |
            this.xcb.eventMask.POINTER_MOTION |
            this.xcb.eventMask.BUTTON_PRESS |
            this.xcb.eventMask.BUTTON_RELEASE;
        const winMask = this.xcb.eventMask.PROPERTY_CHANGE |
            this.xcb.eventMask.STRUCTURE_NOTIFY |
            this.xcb.eventMask.FOCUS_CHANGE;

        this.xcb.change_window_attributes(this.wm, { window: parent, override_redirect: 1, event_mask: frameMask, back_pixel: 0 });
        // make sure we don't get an unparent notify for this window when we reparent
        this.xcb.change_window_attributes(this.wm, { window: win.window, event_mask: 0 });
        this.xcb.reparent_window(this.wm, { window: win.window, parent: parent, x: border, y: border });
        this.xcb.change_window_attributes(this.wm, { window: win.window, event_mask: winMask });
        if (map) {
            this.xcb.map_window(this.wm, win.window);
        }
        this.xcb.map_window(this.wm, parent);
        this.xcb.change_save_set(this.wm, { window: win.window, mode: this.xcb.setMode.INSERT });
        this.xcb.flush(this.wm);

        const client = new Client(this, parent, win, border);
        this._clientsByWindow.set(win.window, client);
        this._clientsByFrame.set(parent, client);
        this._log.info("client", win.window, win.wmClass, parent);
        this._clients.push(client);

        this._events.emit("client", client);
    }

    updateScreens(screens: OWM.Screens) {
        this._log.info("screens", screens);
        this._root = screens.root;
        this._workspaces.update(screens.entries);
    }

    mapRequest(event: XCB.MapRequest) {
        const win = this.xcb.request_window_information(this.wm, event.window);
        this._log.info("maprequest", event.window, win);
        if (!win || win.attributes.override_redirect) {
            this.xcb.map_window(this.wm, event.window);
            this.xcb.flush(this.wm);
            return;
        }
        this.addClient(win, true);
    }

    configureRequest(event: XCB.ConfigureRequest) {
        this._log.info("configurerequest", event);
        const cfg: { window: number,
                     x?: number,
                     y?: number,
                     width?: number,
                     height?: number,
                     border_width?: number,
                     sibling?: number,
                     stack_mode?: number
                   } = { window: event.window };
        if (event.value_mask & this.xcb.configWindow.X)
            cfg.x = event.x;
        if (event.value_mask & this.xcb.configWindow.Y)
            cfg.y = event.y;
        if (event.value_mask & this.xcb.configWindow.WIDTH)
            cfg.width = event.width;
        if (event.value_mask & this.xcb.configWindow.HEIGHT)
            cfg.height = event.height;
        if (event.value_mask & this.xcb.configWindow.BORDER_WIDTH)
            cfg.border_width = event.border_width;
        if (event.value_mask & this.xcb.configWindow.SIBLING)
            cfg.sibling = event.sibling;
        if (event.value_mask & this.xcb.configWindow.STACK_MODE)
            cfg.stack_mode = event.stack_mode;
        this.xcb.configure_window(this.wm, cfg);
        this.xcb.flush(this.wm);
    }

    configureNotify(event: XCB.ConfigureNotify) {
        this._log.info("configurenotify", event.window);
    }

    unmapNotify(event: XCB.UnmapNotify) {
        this._log.info("unmapnotify", event);
        const client = this.findClient(event.window);
        if (!client)
            return;

        this._clientsByWindow.delete(event.window);
        this._clientsByFrame.delete(client.frame);

        this._workspaces.removeItem(client);

        this._events.emit("clientRemoved", client);

        this.xcb.change_window_attributes(this.wm, { window: event.window, event_mask: 0 });
        this.xcb.unmap_window(this.wm, client.frame);
        this.xcb.reparent_window(this.wm, { window: event.window, parent: client.root, x: 0, y: 0 });
        this.xcb.destroy_window(this.wm, client.frame);
        this.xcb.flush(this.wm);
    }

    focusIn(event: XCB.FocusIn) {
    }

    focusOut(event: XCB.FocusIn) {
    }

    expose(event: XCB.Expose) {
        if (event.count !== 0)
            return;
        const client = this._clientsByFrame.get(event.window);
        if (!client)
            return;
        this._log.info("expose", client.frame, client.framePixel, client.frameGC);
        const gc = client.frameGC;
        if (!gc)
            return;
        this.xcb.poly_fill_rectangle(this.wm, { window: client.frame, gc: gc, rects: { width: client.frameWidth, height: client.frameHeight } });
    }

    buttonPress(event: XCB.ButtonPress) {
        this._log.info("press", event);
        this._currentTime = event.time;
        this._policy.buttonPress(event);
    }

    buttonRelease(event: XCB.ButtonPress) {
        this._currentTime = event.time;
        this._policy.buttonRelease(event);
    }

    keyPress(event: XCB.KeyPress) {
        this._currentTime = event.time;
        this._policy.keyPress(event);
        this._bindings.feed(event);
    }

    keyRelease(event: XCB.KeyPress) {
        this._currentTime = event.time;
        this._policy.keyRelease(event);
    }

    enterNotify(event: XCB.EnterNotify) {
        this._currentTime = event.time;
        this._policy.enterNotify(event);
    }

    leaveNotify(event: XCB.EnterNotify) {
        this._currentTime = event.time;
        this._policy.leaveNotify(event);
    }

    get focused() {
        return this._focused;
    }

    set focused(client: Client | undefined) {
        if (client === undefined) {
            this.revertFocus();
            return;
        }
        let gc;
        if (this._focused) {
            this._focused.framePixel = makePixel("#555");
            gc = this._focused.frameGC;
            if (gc) {
                this.xcb.poly_fill_rectangle(this.wm, { window: this._focused.frame, gc: gc,
                                                        rects: { width: this._focused.frameWidth, height: this._focused.frameHeight } });
            }

            this._events.emit("this._focusedFocusOut", this._focused);
        }

        this._focused = client;

        this._focused.framePixel = makePixel("#00f");
        gc = this._focused.frameGC;
        if (gc) {
            this.xcb.poly_fill_rectangle(this.wm, { window: this._focused.frame, gc: gc,
                                                    rects: { width: this._focused.frameWidth, height: this._focused.frameHeight } });
        }
        this.xcb.flush(this.wm);

        this._events.emit("this._focusedFocusin", this._focused);
    }

    revertFocus() {
        if (!this._focused)
            return;

        this._focused.framePixel = makePixel("#555");
        this.xcb.flush(this.wm);
        this.xcb.send_expose(this.wm, { window: this._focused.frame, width: this._focused.frameWidth, height: this._focused.frameHeight });

        const root = this._focused.root;
        this._focused = undefined;

        this.xcb.set_input_focus(this.wm, { window: root, revert_to: this.xcb.inputFocus.NONE, time: this.currentTime });

        const activeData = new Uint32Array(1);
        activeData[0] = root;
        this.xcb.change_property(this.wm, { window: root, mode: this.xcb.propMode.REPLACE,
                                            property: this.xcb.atom._NET_ACTIVE_WINDOW, type: this.xcb.atom.WINDOW,
                                            format: 32, data: activeData });
        this.xcb.flush(this.wm);
    }

    relayout() {
        this._workspaces.relayout();
    }

    recreateKeyBindings() {
        this._bindings.recreate();
    }

    onsettled(func: () => void) {
        if (this._settled) {
            func();
        } else {
            this._onsettled.push(func);
        }
    }

    settled() {
        this._settled = true;
        for (let func of this._onsettled) {
            func();
        }
        this._onsettled = [];
    }

    cleanup() {
        for (const client of this._clients) {
            const window = ((client as unknown) as ClientInternal)._window.window;
            this.xcb.change_window_attributes(this.wm, { window: window, event_mask: 0 });
            this.xcb.reparent_window(this.wm, {
                window: window,
                parent: ((client as unknown) as ClientInternal)._window.geometry.root,
                x: ((client as unknown) as ClientInternal)._window.geometry.x,
                y: ((client as unknown) as ClientInternal)._window.geometry.y
            });
            this.xcb.flush(this.wm);
        }
        this._clients = [];
    }

    handleXCB(e: OWM.Event) {
        if (!e.xcb)
            return;
        switch (e.xcb.type) {
        case this.xcb.event.BUTTON_PRESS:
            this.buttonPress(e.xcb as XCB.ButtonPress);
            break;
        case this.xcb.event.BUTTON_RELEASE:
            this.buttonRelease(e.xcb as XCB.ButtonPress);
            break;
        case this.xcb.event.KEY_PRESS:
            this.keyPress(e.xcb as XCB.KeyPress);
            break;
        case this.xcb.event.KEY_RELEASE:
            this.keyRelease(e.xcb as XCB.KeyPress);
            break;
        case this.xcb.event.ENTER_NOTIFY:
            this.enterNotify(e.xcb as XCB.EnterNotify);
            break;
        case this.xcb.event.LEAVE_NOTIFY:
            this.leaveNotify(e.xcb as XCB.EnterNotify);
            break;
        case this.xcb.event.MAP_REQUEST:
            this.mapRequest(e.xcb as XCB.MapRequest);
            break;
        case this.xcb.event.CONFIGURE_REQUEST:
            this.configureRequest(e.xcb as XCB.ConfigureRequest);
            break;
        case this.xcb.event.CONFIGURE_NOTIFY:
            this.configureNotify(e.xcb as XCB.ConfigureNotify);
            break;
        case this.xcb.event.UNMAP_NOTIFY:
            this.unmapNotify(e.xcb as XCB.UnmapNotify);
            break;
        case this.xcb.event.FOCUS_IN:
            this.focusIn(e.xcb as XCB.FocusIn);
            break;
        case this.xcb.event.FOCUS_OUT:
            this.focusOut(e.xcb as XCB.FocusIn);
            break;
        case this.xcb.event.EXPOSE:
            this.expose(e.xcb as XCB.Expose);
            break;
        }
    }
};
