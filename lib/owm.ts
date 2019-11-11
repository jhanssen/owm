import { XCB, OWM } from "native";
import { Policy } from "./policy";
import { Keybindings } from "./keybindings";
import { Logger, ConsoleLogger } from "./logger";
import { Workspace } from "./workspace";
import { Monitors } from "./monitor";
import { Client, ClientGroup } from "./client";
import { Match } from "./match";
import { EventEmitter } from "events";
import { spawn } from "child_process";
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
    private _clients: Set<Client>;
    private _matches: Set<Match>;
    private _monitors: Monitors;
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
    private _activeColor: number;
    private _inactiveColor: number;
    private _display: string | undefined;
    private _groups: Map<number, ClientGroup>;

    public readonly Workspace = Workspace;
    public readonly Match = Match;

    constructor(wm: OWM.WM, xcb: OWM.XCB, xkb: OWM.XKB, display: string | undefined, loglevel: Logger.Level) {
        this._wm = wm;
        this._xcb = xcb;
        this._xkb = xkb;
        this._settled = false;
        this._display = display;
        this._onsettled = [];

        this._log = new ConsoleLogger(loglevel);
        this._root = 0;
        this._events = new EventEmitter();

        this._policy = new Policy(this);

        this._clients = new Set<Client>();
        this._matches = new Set<Match>();
        this._monitors = new Monitors(this);
        this._clientsByWindow = new Map<number, Client>();
        this._clientsByFrame = new Map<number, Client>();
        this._groups = new Map<number, ClientGroup>();
        this._currentTime = 0;
        this._focused = undefined;
        this._bindings = new Keybindings(this);

        this._activeColor = makePixel("#00f");
        this._inactiveColor = makePixel("#555");
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

    get clients(): Set<Client> {
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

    get events() {
        return this._events;
    }

    get activeColor(): number | string {
        return this._activeColor;
    }

    set activeColor(c: number | string) {
        if (typeof c === "string") {
            this._activeColor = makePixel(c);
            return;
        }
        this._activeColor = c;
    }

    get inactiveColor(): number | string {
        return this._inactiveColor;
    }

    set inactiveColor(c: number | string) {
        if (typeof c === "string") {
            this._inactiveColor = makePixel(c);
            return;
        }
        this._inactiveColor = c;
    }

    get monitors() {
        return this._monitors;
    }

    findClient(window: number): Client | undefined {
        let client = this._clientsByWindow.get(window);
        if (!client) {
            client = this._clientsByFrame.get(window);
        }
        return client;
    }

    findClientByWindow(window: number): Client | undefined {
        return this._clientsByWindow.get(window);
    }

    findClientByFrame(window: number): Client | undefined {
        return this._clientsByFrame.get(window);
    }

    addClient(win: XCB.Window, focus?: boolean) {
        this._log.debug("client", win);

        // reparent to new window
        const border = 10;
        const parent = this.xcb.create_window(this.wm, { x: win.geometry.x, y: win.geometry.y,
                                                         width: win.geometry.width + (border * 2),
                                                         height: win.geometry.height + (border * 2),
                                                         parent: win.geometry.root });

        this.xcb.change_window_attributes(this.wm, { window: parent, override_redirect: 1, back_pixel: 0 });
        // make sure we don't get an unparent notify for this window when we reparent
        this.xcb.change_window_attributes(this.wm, { window: win.window, event_mask: 0 });
        this.xcb.reparent_window(this.wm, { window: win.window, parent: parent, x: border, y: border });
        this.xcb.change_save_set(this.wm, { window: win.window, mode: this.xcb.setMode.INSERT });
        this.xcb.flush(this.wm);

        const leader = win.leader || win.transientFor || win.window;
        let grp = this._groups.get(leader);
        if (!grp) {
            grp = new ClientGroup(this, leader);
            this._groups.set(leader, grp);
        } else {
            grp.ref();
        }
        grp.addFollower(win.window);

        const client = new Client(this, parent, win, border, grp);

        if (win.transientFor !== 0 && win.transientFor !== win.window) {
            client.floating = true;
            grp.addTransient(win.window, win.transientFor);
        }

        this._clientsByWindow.set(win.window, client);
        this._clientsByFrame.set(parent, client);
        this._log.info("client", win.window, win.wmClass, parent);
        this._clients.add(client);

        for (let m of this._matches) {
            m.match(client);
        }

        this._events.emit("client", client);

        // is this client in a visible workspace?
        const ws = client.workspace;
        if (ws && ws.visible) {
            client.state = Client.State.Normal;
            let focused = false;
            if (focus === true || focus === undefined) {
                if (client.focus())
                    focused = true;
            }
            if (!focused) {
                client.framePixel = this._inactiveColor;
            }
            this.xcb.send_expose(this.wm, { window: client.frame, width: client.frameWidth, height: client.frameHeight });
        } else {
            // no, this window is withdrawn
            client.state = Client.State.Withdrawn;
        }
    }

    addMatch(match: Match) {
        this._matches.add(match);
        for (let c of this._clients) {
            match.match(c);
        }
    }

    removeMatch(match: Match) {
        this._matches.delete(match);
    }

    updateScreens(screens: OWM.Screens) {
        this._log.info("screens", screens);
        this._root = screens.root;
        this._monitors.update(screens.entries);
    }

    mapRequest(event: XCB.MapRequest) {
        // check if we already have a client for this window
        const client = this.findClient(event.window);
        if (client)
            return;

        const win = this.xcb.request_window_information(this.wm, event.window);
        this._log.info("maprequest", event.window, win);
        if (!win || win.attributes.override_redirect) {
            this.xcb.map_window(this.wm, event.window);
            this.xcb.flush(this.wm);
            return;
        }
        this.addClient(win);
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

        const client = this.findClient(event.window);
        if (client) {
            client.configure(cfg);
        } else {
            this.xcb.configure_window(this.wm, cfg);
            this.xcb.flush(this.wm);
        }
    }

    configureNotify(event: XCB.ConfigureNotify) {
        this._log.info("configurenotify", event.window);
    }

    unmapNotify(event: XCB.UnmapNotify) {
        this._log.info("unmapnotify", event);
        this._destroyClient(event.window);
    }

    destroyNotify(event: XCB.DestroyNotify) {
        this._log.info("destroynotify", event);
        this._destroyClient(event.window);
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
        if (gc === undefined)
            return;
        this.xcb.poly_fill_rectangle(this.wm, { window: client.frame, gc: gc, rects: { width: client.frameWidth, height: client.frameHeight } });
        this.xcb.flush(this.wm);
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
            this._focused.framePixel = this._inactiveColor;
            this.xcb.send_expose(this.wm, { window: this._focused.frame, width: this._focused.frameWidth, height: this._focused.frameHeight });
            this.xcb.flush(this.wm);

            this._events.emit("clientFocusOut", this._focused);
        }

        this._focused = client;

        this._focused.framePixel = this._activeColor;
        this.xcb.send_expose(this.wm, { window: this._focused.frame, width: this._focused.frameWidth, height: this._focused.frameHeight });
        this.xcb.flush(this.wm);

        this._events.emit("clientFocusIn", this._focused);
    }

    revertFocus() {
        if (!this._focused)
            return;

        this._focused.framePixel = this._inactiveColor;
        this.xcb.send_expose(this.wm, { window: this._focused.frame, width: this._focused.frameWidth, height: this._focused.frameHeight });
        this.xcb.flush(this.wm);

        this._events.emit("clientFocusOut", this._focused);

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
        this._monitors.relayout();
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

    launch(cmd: string, ...args: string[]) {
        let env = process.env;
        if (this._display !== undefined) {
            env = Object.assign({}, env);
            env.DISPLAY = this._display;
        }
        const subprocess = spawn(cmd, args, {
            detached: true,
            stdio: 'ignore',
            env: env
        });

        subprocess.unref();
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
        this._clients.clear();
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
        case this.xcb.event.DESTROY_NOTIFY:
            this.destroyNotify(e.xcb as XCB.DestroyNotify);
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

    _destroyClient(window: number) {
        const client = this.findClient(window);
        if (!client)
            return;
        // if this is our focused client, revert focus somewhere else
        if (client === this._focused) {
            this.revertFocus();
        }
        if (client.group.deref()) {
            this._groups.delete(client.group.leaderWindow);
        }

        this._clientsByWindow.delete(window);
        this._clientsByFrame.delete(client.frame);
        const ws = client.workspace;
        if (ws) {
            ws.removeItem(client);
        }

        this._events.emit("clientRemoved", client);

        this.xcb.change_window_attributes(this.wm, { window: window, event_mask: 0 });
        this.xcb.unmap_window(this.wm, client.frame);
        this.xcb.reparent_window(this.wm, { window: window, parent: client.root, x: 0, y: 0 });
        const gc = client.frameGC;
        if (gc !== undefined) {
            this.xcb.free_gc(this.wm, gc)
        }
        this.xcb.destroy_window(this.wm, client.frame);
        this.xcb.flush(this.wm);
    }
};
