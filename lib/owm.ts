import { XCB, OWM } from "native";
import { Policy } from "./policy";
import { Keybindings, KeybindingsMode } from "./keybindings";
import { Logger, ConsoleLogger } from "./logger";
import { Workspace } from "./workspace";
import { Monitors } from "./monitor";
import { Client, ClientGroup } from "./client";
import { Match } from "./match";
import { EventEmitter } from "events";
import { spawn, StdioOptions } from "child_process";
import { default as hexRgb } from "hex-rgb";
import { quote } from "shell-quote";

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

interface LaunchOptions
{
    command: string;
    detached?: boolean;
    shell?: string;
    shellArgs?: string[];
    env?: { [key: string]: string };
    stdio?: string;
};

export class OWMLib {
    private readonly _wm: OWM.WM;
    private readonly _xcb: OWM.XCB;
    private readonly _xkb: OWM.XKB;
    private _clients: Client[];
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
    private _moveModifier: string;
    private _moveModifierMask: number;
    private _moving: { client: Client, x: number, y: number } | undefined;

    public readonly Client = Client;
    public readonly Workspace = Workspace;
    public readonly Match = Match;
    public readonly KeybindingsMode = KeybindingsMode;

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

        this._clients = [];
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

        this._moveModifierMask = this._parseMoveModifier("Alt");
        this._moveModifier = "Alt";
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

    get display() {
        return this._display || process.env.DISPLAY;
    }

    get root() {
        return this._root;
    }

    get clients() {
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

    get moveModifier() {
        return this._moveModifier;
    }

    set moveModifier(mod: string) {
        this._moveModifierMask = this._parseMoveModifier(mod);
        this._moveModifier = mod;

        this._releaseMoveGrab();
        this.createMoveGrab();
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

    findClientByPosition(x: number, y: number) {
        // we'll eventually have to do some stacking checking here
        let candidate: Client | undefined;
        for (const [window, client] of this._clientsByFrame) {
            const geom = client.frameGeometry;
            if (x >= geom.x && x <= geom.x + geom.width &&
                y >= geom.y && y <= geom.y + geom.height) {
                if (candidate === undefined || !candidate.floating)
                    candidate = client;
            }
        }
        return candidate;
    }

    findClientUnderCursor() : Client | undefined {
        const ptr = this._xcb.query_pointer(this._wm);
        return this.findClientByPosition(ptr.root_x, ptr.root_y);
    }

    addClient(win: XCB.Window, focus?: boolean) {
        this._log.debug("client", win);

        const dock = win.ewmhWindowType.includes(this._xcb.atom._NET_WM_WINDOW_TYPE_DOCK);

        // reparent to new window
        const border = dock ? 0 : 2;
        const parent = this._xcb.create_window(this._wm, { x: win.geometry.x, y: win.geometry.y,
                                                         width: win.geometry.width + (border * 2),
                                                         height: win.geometry.height + (border * 2),
                                                         parent: win.geometry.root });

        this._xcb.change_window_attributes(this._wm, { window: parent, override_redirect: 1, back_pixel: 0 });
        // make sure we don't get an unparent notify for this window when we reparent
        this._xcb.change_window_attributes(this._wm, { window: win.window, event_mask: 0 });
        this._xcb.reparent_window(this._wm, { window: win.window, parent: parent, x: border, y: border });
        this._xcb.change_save_set(this._wm, { window: win.window, mode: this._xcb.setMode.INSERT });
        this._xcb.flush(this._wm);

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
            const clientFor = this._clientsByWindow.get(win.transientFor);
            if (clientFor) {
                client.centerOn(clientFor);
            }

            client.floating = true;
            grp.addTransient(win.window, win.transientFor);
        }

        this._clientsByWindow.set(win.window, client);
        this._clientsByFrame.set(parent, client);
        this._log.info("client", win.window, win.wmClass, parent);
        this._clients.push(client);

        this._updateClientList();

        for (let m of this._matches) {
            m.match(client);
        }

        this._events.emit("client", client);

        // is this client in a visible workspace?
        const ws = client.workspace;
        if (client.ignoreWorkspace || (ws && ws.visible)) {
            client.state = Client.State.Normal;
            let focused = false;
            if (focus === true || focus === undefined) {
                if (client.focus())
                    focused = true;
            }
            if (!focused) {
                client.framePixel = this._inactiveColor;
            }
            this._xcb.send_expose(this._wm, { window: client.frame, width: client.frameWidth, height: client.frameHeight });
        } else {
            // no, this window is iconic
            client.state = Client.State.Iconic;
        }

        if (client.ignoreWorkspace) {
            this.relayout();
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

        process.nextTick(() => {
            this._updateSupported();
        });
    }

    mapRequest(event: XCB.MapRequest) {
        // check if we already have a client for this window
        const client = this.findClient(event.window);
        if (client)
            return;

        const win = this._xcb.request_window_information(this._wm, event.window);
        this._log.info("maprequest", event.window, win);
        if (!win || win.attributes.override_redirect) {
            this._xcb.map_window(this._wm, event.window);
            this._xcb.flush(this._wm);
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
        if (event.value_mask & this._xcb.configWindow.X)
            cfg.x = event.x;
        if (event.value_mask & this._xcb.configWindow.Y)
            cfg.y = event.y;
        if (event.value_mask & this._xcb.configWindow.WIDTH)
            cfg.width = event.width;
        if (event.value_mask & this._xcb.configWindow.HEIGHT)
            cfg.height = event.height;
        if (event.value_mask & this._xcb.configWindow.BORDER_WIDTH)
            cfg.border_width = event.border_width;
        if (event.value_mask & this._xcb.configWindow.SIBLING)
            cfg.sibling = event.sibling;
        if (event.value_mask & this._xcb.configWindow.STACK_MODE)
            cfg.stack_mode = event.stack_mode;

        const client = this.findClient(event.window);
        if (client) {
            client.configure(cfg);
        } else {
            this._xcb.configure_window(this._wm, cfg);
            this._xcb.flush(this._wm);
        }
    }

    configureNotify(event: XCB.ConfigureNotify) {
        this._log.info("configurenotify", event.window);
    }

    mapNotify(event: XCB.MapNotify) {
        this._log.info("mapnotify", event);
        const client = this.findClient(event.window);
        if (!client)
            return;
        if (this.focused == client) {
            client.focus();
        }
    }

    unmapNotify(event: XCB.UnmapNotify) {
        this._log.info("unmapnotify", event);
        const client = this.findClient(event.window);
        if (!client)
            return;
        this._destroyClient(client);
    }

    destroyNotify(event: XCB.DestroyNotify) {
        this._log.info("destroynotify", event);
        const client = this.findClient(event.window);
        if (!client)
            return;
        this._destroyClient(client);
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
        this._xcb.poly_fill_rectangle(this._wm, { window: client.frame, gc: gc, rects: { width: client.frameWidth, height: client.frameHeight } });
        this._xcb.flush(this._wm);
    }

    buttonPress(event: XCB.ButtonPress) {
        this._log.info("press", event);
        this._currentTime = event.time;

        // if this is our move grab, process that
        if (event.detail === 1 && event.state === this._moveModifierMask) {
            // yup.
            this._log.info("moving window");
            const client = this.findClientByPosition(event.root_x, event.root_y);
            if (!client || !client.floating) {
                // keep processing events
                this._xcb.allow_events(this._wm, { mode: this._xcb.allow.ASYNC_POINTER, time: event.time });
                this._xcb.flush(this._wm);
                return;
            }

            // grab the pointer, asking for move and release events
            const events = this._xcb.eventMask.BUTTON_RELEASE | this._xcb.eventMask.POINTER_MOTION;
            const asyncMode = this._xcb.grabMode.ASYNC;
            this._xcb.grab_pointer(this._wm, { window: this._root, owner_events: 1, event_mask: events,
                                               pointer_mode: asyncMode, keyboard_mode: asyncMode,
                                               time: event.time });
            this._xcb.allow_events(this._wm, { mode: this._xcb.allow.ASYNC_POINTER, time: event.time });
            this._xcb.flush(this._wm);

            const geom = client.frameGeometry;
            this._moving = { client: client, x: geom.x - event.root_x, y: geom.y - event.root_y };
        } else {
            this._policy.buttonPress(event);
        }
    }

    buttonRelease(event: XCB.ButtonPress) {
        this._log.info("release", event);
        this._currentTime = event.time;
        if (this._moving) {
            this._moving.client.move(this._moving.x + event.root_x, this._moving.y + event.root_y);
            this._xcb.ungrab_pointer(this._wm, event.time);
            this._moving = undefined;
        } else {
            this._policy.buttonRelease(event);
        }
    }

    motionNotify(event: XCB.MotionNotify) {
        this._log.info("motion", event);
        this._currentTime = event.time;
        if (this._moving) {
            // move
            this._moving.client.move(this._moving.x + event.root_x, this._moving.y + event.root_y);
        }
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
            this._xcb.send_expose(this._wm, { window: this._focused.frame, width: this._focused.frameWidth, height: this._focused.frameHeight });
            this._xcb.flush(this._wm);

            this._events.emit("clientFocusOut", this._focused);
        }

        this._focused = client;

        this._focused.framePixel = this._activeColor;
        this._xcb.send_expose(this._wm, { window: this._focused.frame, width: this._focused.frameWidth, height: this._focused.frameHeight });
        this._xcb.flush(this._wm);

        this._events.emit("clientFocusIn", this._focused);
    }

    revertFocus() {
        if (!this._focused)
            return;

        this._focused.framePixel = this._inactiveColor;
        this._xcb.send_expose(this._wm, { window: this._focused.frame, width: this._focused.frameWidth, height: this._focused.frameHeight });
        this._xcb.flush(this._wm);

        this._events.emit("clientFocusOut", this._focused);

        const root = this._focused.root;
        this._focused = undefined;

        this._xcb.set_input_focus(this._wm, { window: root, revert_to: this._xcb.inputFocus.NONE, time: this.currentTime });

        const activeData = new Uint32Array(1);
        activeData[0] = root;
        this._xcb.change_property(this._wm, { window: root, mode: this._xcb.propMode.REPLACE,
                                            property: this._xcb.atom._NET_ACTIVE_WINDOW, type: this._xcb.atom.WINDOW,
                                            format: 32, data: activeData });
        this._xcb.flush(this._wm);
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

    launch(opts: string | LaunchOptions, ...args: string[]) {
        if (typeof opts === "string")
            opts = { command: opts };

        let {
            env = process.env,
            command = opts.command,
            detached = true,
            shell = "/bin/sh",
            shellArgs = [ "-c" ],
            stdio = "ignore"
        } = opts;

        if (this._display !== undefined) {
            env = Object.assign({}, env);
            env.DISPLAY = this._display;
        }
        const spawnArgs = shellArgs.concat([`${quote([ opts.command ].concat(args))}`]);
        let stdioValue: StdioOptions;
        switch (stdio) {
        case "ignore": stdioValue = "ignore"; break;
        case "pipe": stdioValue = "pipe"; break;
        case "inherit": stdioValue = "inherit"; break;
        default: throw new Error(`Bad stdio ${stdio}`); break;
        }

        const subprocess = spawn(shell, spawnArgs, {
            detached: detached,
            stdio: stdioValue,
            env: env
        });

        if (detached)
            subprocess.unref();
    }

    createMoveGrab() {
        const grabMode = this._xcb.grabMode;
        const events = this._xcb.eventMask.BUTTON_PRESS;

        this._xcb.grab_button(this._wm, { window: this._root, modifiers: this._moveModifierMask,
                                          button: 1, owner_events: 1, event_mask: events,
                                          pointer_mode: grabMode.SYNC, keyboard_mode: grabMode.ASYNC });
        this._xcb.flush(this._wm);
    }

    cleanup() {
        for (const client of this._clients) {
            const window = ((client as unknown) as ClientInternal)._window.window;
            this._xcb.change_window_attributes(this._wm, { window: window, event_mask: 0 });
            this._xcb.reparent_window(this._wm, {
                window: window,
                parent: ((client as unknown) as ClientInternal)._window.geometry.root,
                x: ((client as unknown) as ClientInternal)._window.geometry.x,
                y: ((client as unknown) as ClientInternal)._window.geometry.y
            });
            this._xcb.flush(this._wm);
        }
        this._clients = [];
    }

    handleXCB(e: OWM.Event) {
        if (!e.xcb)
            return;
        switch (e.xcb.type) {
        case this._xcb.event.BUTTON_PRESS:
            this.buttonPress(e.xcb as XCB.ButtonPress);
            break;
        case this._xcb.event.BUTTON_RELEASE:
            this.buttonRelease(e.xcb as XCB.ButtonPress);
            break;
        case this._xcb.event.MOTION_NOTIFY:
            this.motionNotify(e.xcb as XCB.MotionNotify);
            break;
        case this._xcb.event.KEY_PRESS:
            this.keyPress(e.xcb as XCB.KeyPress);
            break;
        case this._xcb.event.KEY_RELEASE:
            this.keyRelease(e.xcb as XCB.KeyPress);
            break;
        case this._xcb.event.ENTER_NOTIFY:
            this.enterNotify(e.xcb as XCB.EnterNotify);
            break;
        case this._xcb.event.LEAVE_NOTIFY:
            this.leaveNotify(e.xcb as XCB.EnterNotify);
            break;
        case this._xcb.event.MAP_REQUEST:
            this.mapRequest(e.xcb as XCB.MapRequest);
            break;
        case this._xcb.event.CONFIGURE_REQUEST:
            this.configureRequest(e.xcb as XCB.ConfigureRequest);
            break;
        case this._xcb.event.CONFIGURE_NOTIFY:
            this.configureNotify(e.xcb as XCB.ConfigureNotify);
            break;
        case this._xcb.event.MAP_NOTIFY:
            this.mapNotify(e.xcb as XCB.MapNotify);
            break;
        case this._xcb.event.UNMAP_NOTIFY:
            this.unmapNotify(e.xcb as XCB.UnmapNotify);
            break;
        case this._xcb.event.DESTROY_NOTIFY:
            this.destroyNotify(e.xcb as XCB.DestroyNotify);
            break;
        case this._xcb.event.FOCUS_IN:
            this.focusIn(e.xcb as XCB.FocusIn);
            break;
        case this._xcb.event.FOCUS_OUT:
            this.focusOut(e.xcb as XCB.FocusIn);
            break;
        case this._xcb.event.EXPOSE:
            this.expose(e.xcb as XCB.Expose);
            break;
        }
    }

    private _destroyClient(client: Client) {
        // if this is our focused client, revert focus somewhere else
        const window = client.window.window;
        if (client === this._focused) {
            this.revertFocus();
        }
        if (client.ignoreWorkspace) {
            const monitor = this._monitors.monitorByPosition(client.geometry.x, client.geometry.y);
            monitor.removeItem(client);
        }
        client.group.remove(window);
        if (client.group.deref()) {
            this._groups.delete(client.group.leaderWindow);
        }

        const idx = this._clients.indexOf(client);
        if (idx === -1) {
            throw new Error("client not in list of clients?");
        }

        this._clients.splice(idx, 1);

        this._updateClientList();

        this._clientsByWindow.delete(window);
        this._clientsByFrame.delete(client.frame);
        const ws = client.workspace;
        if (ws) {
            ws.removeItem(client);
        }

        this._events.emit("clientRemoved", client);

        this._xcb.change_window_attributes(this._wm, { window: window, event_mask: 0 });
        this._xcb.unmap_window(this._wm, client.frame);
        this._xcb.reparent_window(this._wm, { window: window, parent: client.root, x: 0, y: 0 });
        const gc = client.frameGC;
        if (gc !== undefined) {
            this._xcb.free_gc(this._wm, gc)
        }
        this._xcb.destroy_window(this._wm, client.frame);
        this._xcb.flush(this._wm);

        if (client.ignoreWorkspace) {
            this.relayout();
        }
    }

    private _parseMoveModifier(mod: string) {
        const mask = this._xcb.modMask;
        switch (mod.toLowerCase()) {
        case "shift":
            return mask.SHIFT;
        case "ctrl":
        case "control":
            return mask.CONTROL;
        case "mod1":
        case "alt":
            return mask["1"];
        case "mod2":
            return mask["2"];
        case "mod3":
            return mask["3"];
        case "mod4":
            return mask["4"];
        case "mod5":
            return mask["5"];
        case "lock":
            return mask.LOCK;
        default:
            throw new Error("Couldn't parse keybinding mask");
        }
    }

    private _releaseMoveGrab() {
        this._xcb.ungrab_button(this._wm, { window: this._root, modifiers: this._moveModifierMask, button: 1 });
        this._xcb.flush(this._wm);
    }

    private _updateClientList() {
        const clients = this._clients;
        const clientData = new Uint32Array(clients.length);
        for (let i = 0; i < clients.length; ++i) {
            clientData[i] = clients[i].window.window;
        }

        this._xcb.change_property(this._wm, { window: this._root, mode: this._xcb.propMode.REPLACE,
                                              property: this._xcb.atom._NET_CLIENT_LIST, type: this._xcb.atom.WINDOW,
                                              format: 32, data: clientData });
        this._xcb.flush(this._wm);
    }

    private _updateSupported() {
        const atom = this._xcb.atom;

        const supportedAtoms = [
            atom._NET_SUPPORTED,
            atom._NET_SUPPORTING_WM_CHECK,
            atom._NET_WM_NAME,
            atom._NET_WM_MOVERESIZE,
            atom._NET_WM_STATE_STICKY,
            atom._NET_WM_STATE_FULLSCREEN,
            atom._NET_WM_STATE_MODAL,
            atom._NET_WM_STATE_HIDDEN,
            atom._NET_WM_STATE_FOCUSED,
            atom._NET_WM_STATE,
            atom._NET_WM_WINDOW_TYPE,
            atom._NET_WM_WINDOW_TYPE_NORMAL,
            atom._NET_WM_WINDOW_TYPE_DOCK,
            atom._NET_WM_WINDOW_TYPE_DIALOG,
            atom._NET_WM_STRUT_PARTIAL,
            atom._NET_CLIENT_LIST,
            atom._NET_CURRENT_DESKTOP,
            atom._NET_NUMBER_OF_DESKTOPS,
            atom._NET_DESKTOP_NAMES,
            atom._NET_DESKTOP_VIEWPORT,
            atom._NET_ACTIVE_WINDOW,
            atom._NET_CLOSE_WINDOW,
            atom._NET_MOVERESIZE_WINDOW
        ];

        const supportedData = new Uint32Array(supportedAtoms.length);
        for (let i = 0; i < supportedAtoms.length; ++i) {
            supportedData[i] = supportedAtoms[i];
        }

        this._xcb.change_property(this._wm, { window: this._root, mode: this._xcb.propMode.REPLACE,
                                              property: this._xcb.atom._NET_SUPPORTED, type: this._xcb.atom.ATOM,
                                              format: 32, data: supportedData });
        this._xcb.flush(this._wm);
    }
};
