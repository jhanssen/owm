import { XCB, OWM, Graphics } from "native";
import { EWMH } from "./ewmh";
import { Policy } from "./policy";
import { Keybindings, KeybindingsMode } from "./keybindings";
import { Logger, ConsoleLogger } from "./logger";
import { Workspace } from "./workspace";
import { Monitors } from "./monitor";
import { Client, ClientGroup, isClient } from "./client";
import { Container, ContainerItemType, isContainer } from "./container";
import { Match } from "./match";
import { Geometry } from "./utils";
import { IPC, IPCMessage } from "./ipc";
import { Bar } from "../applets";
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
}

interface OWMOptions
{
    display: string | undefined,
    level: Logger.Level,
    killTimeout: number
}

enum ResizeHandle
{
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight
}

class MoveResize {
    public moving: { client: Client, x: number, y: number } | undefined;
    public resizing: { client: Client, x: number, y: number, geom: Geometry, handle: ResizeHandle } | undefined;
    public movingKeyboard: Client | undefined;
    public resizingKeyboard: Client | undefined;

    public static readonly AdjustBy = 20;

    constructor() {
    }

    get enabled() {
        return this.moving !== undefined
            || this.resizing !== undefined
            || this.movingKeyboard !== undefined
            || this.resizingKeyboard !== undefined;
    }

    clear() {
        this.moving = undefined;
        this.resizing = undefined;
        this.movingKeyboard = undefined;
        this.resizingKeyboard = undefined;
    }
}

function calculateBorder(win: XCB.Window, xcb: OWM.XCB) {
    const dock = win.ewmhWindowType.includes(xcb.atom._NET_WM_WINDOW_TYPE_DOCK);
    return dock ? 0 : 2;
}

export class OWMLib {
    private readonly _wm: OWM.WM;
    private readonly _xcb: OWM.XCB;
    private readonly _xkb: OWM.XKB;
    private _ewmh: EWMH;
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
    private _ipc: IPC;
    private _root: number;
    private _events: EventEmitter;
    private _activeColor: number;
    private _inactiveColor: number;
    private _groups: Map<number, ClientGroup>;
    private _engine: Graphics.Engine;
    private _options: OWMOptions;
    private _moveModifier: string;
    private _moveModifierMask: number;
    private _moveResize: MoveResize;
    private _moveResizeMode: KeybindingsMode;

    public readonly Client = Client;
    public readonly Workspace = Workspace;
    public readonly Match = Match;
    public readonly KeybindingsMode = KeybindingsMode;
    public readonly Bar = Bar;
    public readonly makePixel = makePixel;

    constructor(wm: OWM.WM, xcb: OWM.XCB, xkb: OWM.XKB, engine: Graphics.Engine, options: OWMOptions) {
        this._wm = wm;
        this._xcb = xcb;
        this._xkb = xkb;
        this._options = options;
        this._engine = engine;

        this._log = new ConsoleLogger(options.level);
        this._root = 0;
        this._events = new EventEmitter();
        this._ipc = new IPC(this, "owm", options.display);

        this._policy = new Policy(this);

        this._ewmh = new EWMH(this);

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

        this._moveResize = new MoveResize();

        this._moveResizeMode = new KeybindingsMode(this, "Pointer move/resize mode", false);
        this._moveResizeMode.add("Escape", (mode: KeybindingsMode, binding: string) => {
            if (this._moveResize.moving || this._moveResize.resizing) {
                this._xcb.ungrab_pointer(this._wm, this._currentTime);
            }
            this._moveResize.clear();
            mode.exit();
        });
        this._moveResizeMode.add("Return", (mode: KeybindingsMode, binding: string) => {
            if (this._moveResize.moving || this._moveResize.resizing) {
                this._xcb.ungrab_pointer(this._wm, this._currentTime);
            }
            this._moveResize.clear();
            mode.exit();
        });
        this._moveResizeMode.add("Left", (mode: KeybindingsMode, binding: string) => {
            if (this._moveResize.movingKeyboard) {
                const client = this._moveResize.movingKeyboard;
                const geom = client.frameGeometry;
                client.move(geom.x - MoveResize.AdjustBy, geom.y);
            } else if (this._moveResize.resizingKeyboard) {
                const client = this._moveResize.resizingKeyboard;
                const geom = client.frameGeometry;
                if (geom.width <= MoveResize.AdjustBy)
                    return;
                client.resize(geom.width - MoveResize.AdjustBy, geom.height);
            }
        });
        this._moveResizeMode.add("Right", (mode: KeybindingsMode, binding: string) => {
            if (this._moveResize.movingKeyboard) {
                const client = this._moveResize.movingKeyboard;
                const geom = client.frameGeometry;
                client.move(geom.x + MoveResize.AdjustBy, geom.y);
            } else if (this._moveResize.resizingKeyboard) {
                const client = this._moveResize.resizingKeyboard;
                const geom = client.frameGeometry;
                client.resize(geom.width + MoveResize.AdjustBy, geom.height);
            }
        });
        this._moveResizeMode.add("Up", (mode: KeybindingsMode, binding: string) => {
            if (this._moveResize.movingKeyboard) {
                const client = this._moveResize.movingKeyboard;
                const geom = client.frameGeometry;
                client.move(geom.x, geom.y - MoveResize.AdjustBy);
            } else if (this._moveResize.resizingKeyboard) {
                const client = this._moveResize.resizingKeyboard;
                const geom = client.frameGeometry;
                // make sure we don't go too too small
                if (geom.height <= MoveResize.AdjustBy)
                    return;
                client.resize(geom.width, geom.height - MoveResize.AdjustBy, true);
            }
        });
        this._moveResizeMode.add("Down", (mode: KeybindingsMode, binding: string) => {
            if (this._moveResize.movingKeyboard) {
                const client = this._moveResize.movingKeyboard;
                const geom = client.frameGeometry;
                client.move(geom.x, geom.y + MoveResize.AdjustBy);
            } else if (this._moveResize.resizingKeyboard) {
                const client = this._moveResize.resizingKeyboard;
                const geom = client.frameGeometry;
                client.resize(geom.width, geom.height + MoveResize.AdjustBy, true);
            }
        });

        this._ipc.events.on("message", (msg: IPCMessage) => {
            switch (msg.type) {
            case "exit":
                msg.close();
                this._events.emit("exit");
                break;
            case "message":
                this._events.emit("message", msg);
                break;
            }
        });
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

    get engine() {
        return this._engine;
    }

    get ewmh() {
        return this._ewmh;
    }

    get display() {
        return this._options.display || process.env.DISPLAY;
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

    get groups() {
        return this._groups;
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

    get pointerPosition() {
        const ptr = this._xcb.query_pointer(this._wm);
        return { x: ptr.root_x, y: ptr.root_y };
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

    get options() {
        return this._options;
    }

    exit(exitCode?: number) {
        this._events.emit("exit", exitCode);
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

    findClientsByClass(cls: string | XCB.WindowTypes.WMClass): Client[] {
        if (typeof cls === "string") {
            cls = { instance_name: "", class_name: cls };
        }
        const ret: Client[] = [];
        const compareInstance = cls.instance_name.length > 0;
        const compareClass = cls.class_name.length > 0;
        for (const client of this._clients) {
            if (compareInstance && client.window.wmClass.instance_name === cls.instance_name) {
                ret.push(client);
            } else if (compareClass && client.window.wmClass.class_name === cls.class_name) {
                ret.push(client);
            }
        }
        return ret;
    }

    findClientByClass(cls: string | XCB.WindowTypes.WMClass): Client | undefined {
        if (typeof cls === "string") {
            cls = { instance_name: "", class_name: cls };
        }
        const compareInstance = cls.instance_name.length > 0;
        const compareClass = cls.class_name.length > 0;
        for (const client of this._clients) {
            if (compareInstance && client.window.wmClass.instance_name === cls.instance_name) {
                return client;
            } else if (compareClass && client.window.wmClass.class_name === cls.class_name) {
                return client;
            }
        }
        return undefined;
    }

    findClientsByName(name: string): Client[] {
        const ret: Client[] = [];
        for (const client of this._clients) {
            if (client.window.ewmhName === name) {
                ret.push(client);
            } else if (client.window.wmName === name) {
                ret.push(client);
            }
        }
        return ret;
    }

    findClientByName(name: string): Client | undefined {
        for (const client of this._clients) {
            if (client.window.ewmhName === name) {
                return client;
            } else if (client.window.wmName === name) {
                return client;
            }
        }
        return undefined;
    }

    findClientByPosition(x: number, y: number): Client | undefined {
        const monitor = this._monitors.monitorByPosition(x, y);
        const item = monitor.findItemByPosition(x, y, ContainerItemType.Client);
        if (item && isClient(item)) {
            return item as Client;
        }
        return undefined;
    }

    findClientUnderCursor(): Client | undefined {
        const ptr = this._xcb.query_pointer(this._wm);
        return this.findClientByPosition(ptr.root_x, ptr.root_y);
    }

    findContainerForWorkspace(id: number): Container | undefined {
        const ws = this._monitors.workspaceById(id);
        return ws ? ws.container : undefined;
    }

    findContainerByPosition(x: number, y: number): Container | undefined {
        const monitor = this._monitors.monitorByPosition(x, y);
        const item = monitor.findItemByPosition(x, y, ContainerItemType.Container);
        if (item && isContainer(item)) {
            return item as Container;
        }
        return undefined;
    }

    findContainerUnderCursor(): Container | undefined {
        const ptr = this._xcb.query_pointer(this._wm);
        return this.findContainerByPosition(ptr.root_x, ptr.root_y);
    }

    addClient(win: XCB.Window, focus?: boolean) {
        this._log.debug("client", win);

        // reparent to new window
        const border = calculateBorder(win, this._xcb);
        const parent = this._xcb.create_window(this._wm, { x: win.geometry.x, y: win.geometry.y,
                                                         width: win.geometry.width + (border * 2),
                                                         height: win.geometry.height + (border * 2),
                                                         parent: win.geometry.root });

        this._xcb.change_window_attributes(this._wm, { window: parent, override_redirect: 1, back_pixel: 0 });
        // make sure we don't get an unparent notify for this window when we reparent
        this._xcb.change_window_attributes(this._wm, { window: win.window, event_mask: 0 });
        this._xcb.reparent_window(this._wm, { window: win.window, parent: parent, x: border, y: border });
        this._xcb.change_save_set(this._wm, { window: win.window, mode: this._xcb.setMode.INSERT });

        const client = new Client(this, parent, win, border);

        for (const transient of client.group.transientsForClient(client)) {
            transient.centerOn(client);
        }

        this._clientsByWindow.set(win.window, client);
        this._clientsByFrame.set(parent, client);
        this._log.info("client", win.window, win.wmClass, parent);
        this._clients.push(client);

        this._ewmh.updateClientList();

        for (let m of this._matches) {
            m.match(client);
        }

        this._events.emit("client", client);

        client.finalizeCreation(focus);

        if (client.ignoreWorkspace) {
            this.relayout();
        }
    }

    moveByKeyboard(client: Client) {
        if (!client.floating || this._moveResize.enabled)
            return;
        this._moveResize.movingKeyboard = client;
        this._bindings.enterMode(this._moveResizeMode);
    }

    resizeByKeyboard(client: Client) {
        if (!client.floating || this._moveResize.enabled)
            return;
        this._moveResize.resizingKeyboard = client;
        this._bindings.enterMode(this._moveResizeMode);
    }

    warpPointerToClient(client: Client, x?: number, y?: number) {
        this._xcb.warp_pointer(this._wm, { dst_window: client.window.window,
                                           dst_x: x || client.geometry.width / 2,
                                           dst_y: y || client.geometry.height / 2 });

    }

    warpPointerToPosition(x: number, y: number) {
        this._xcb.warp_pointer(this._wm, { dst_x: x, dst_y: y });
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

        // grab the left click button for focus policies
        const events = this._xcb.eventMask.BUTTON_PRESS | this._xcb.eventMask.BUTTON_RELEASE;
        const syncMode = this._xcb.grabMode.SYNC;
        const asyncMode = this._xcb.grabMode.ASYNC;
        this._xcb.grab_button(this._wm, { window: this._root, modifiers: 0,
                                          button: 1, owner_events: 1, event_mask: events,
                                          pointer_mode: syncMode, keyboard_mode: asyncMode });
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
        this._destroyClient(client, true);
    }

    destroyNotify(event: XCB.DestroyNotify) {
        this._log.info("destroynotify", event);
        const client = this.findClient(event.window);
        if (!client)
            return;
        this._destroyClient(client, false);
    }

    focusIn(event: XCB.FocusIn) {
    }

    focusOut(event: XCB.FocusIn) {
    }

    expose(event: XCB.Expose) {
        if (event.count !== 0)
            return;
        let client = this._clientsByFrame.get(event.window);
        if (!client) {
            client = this._clientsByWindow.get(event.window);
            if (client) {
                this._events.emit("clientExpose", client);
            } else {
                this._events.emit("windowExpose", event.window);
            }
            return;
        }
        this._log.info("frame expose", client.frame, client.framePixel, client.frameGC);
        const gc = client.frameGC;
        if (gc === undefined)
            return;
        this._xcb.poly_fill_rectangle(this._wm, { window: client.frame, gc: gc, rects: { width: client.frameWidth, height: client.frameHeight } });
    }

    clientMessage(event: XCB.ClientMessage) {
        const atom = this._xcb.atom;
        const ewmh = this._xcb.ewmh;
        switch (event.message_type) {
        case atom._NET_CLOSE_WINDOW: {
            const client = this._clientsByWindow.get(event.window);
            if (client) {
                client.kill();
            }
            break; }
        case atom._NET_ACTIVE_WINDOW: {
            const client = this._clientsByWindow.get(event.window);
            if (client) {
                if (client.workspace)
                    client.workspace.activate();
                client.focus();
                client.raise();
            }
            break; }
        case atom._NET_WM_DESKTOP: {
            const u32 = new Uint32Array(event.data);
            if (u32.length >= 1) {
                const client = this._clientsByWindow.get(event.window);
                if (client) {
                    const newws = this._monitors.workspaceById(u32[0] + 1);
                    if (newws) {
                        client.workspace = newws;
                    }
                }
            }
            break; }
        case atom._NET_WM_STATE: {
            const action = this._xcb.ewmh.stateAction;
            const u32 = new Uint32Array(event.data);
            if (u32.length >= 3) {
                // 0: action, 1: first change, 2: second change
                const client = this._clientsByWindow.get(event.window);
                if (client) {
                    if (u32[1] === atom._NET_WM_STATE_FULLSCREEN) {
                        if (u32[0] === action.REMOVE)
                            client.fullscreen = false;
                        else if (u32[0] === action.ADD)
                            client.fullscreen = true;
                        else if (u32[0] === action.TOGGLE)
                            client.fullscreen = !client.fullscreen;
                    } else if (u32[1] === atom._NET_WM_STATE_ABOVE) {
                        if (u32[0] === action.REMOVE)
                            client.staysOnTop = false;
                        else if (u32[0] === action.ADD)
                            client.staysOnTop = true;
                        else if (u32[0] === action.TOGGLE)
                            client.staysOnTop = !client.staysOnTop;
                    }
                }
            }
            break; }
        case atom._NET_MOVERESIZE_WINDOW: {
            // use Int32Array here, x and y can be negative
            const i32 = new Int32Array(event.data);
            if (i32.length >= 5) {
                // 0: gravity, 1: x, 2: y, 3: width, 4: height
                const client = this._clientsByWindow.get(event.window);
                if (client) {
                    // yay
                    const flags = i32[0];
                    const cfg: {
                        window: number,
                        x?: number,
                        y?: number,
                        width?: number,
                        height?: number
                    } = { window: event.window };
                    if (flags & ewmh.moveResizeWindow.X)
                        cfg.x = i32[1];
                    if (flags & ewmh.moveResizeWindow.X)
                        cfg.y = i32[2];
                    if (flags & ewmh.moveResizeWindow.WIDTH)
                        cfg.width = i32[3];
                    if (flags & ewmh.moveResizeWindow.HEIGHT)
                        cfg.height = i32[4];
                    client.configure(cfg);
                }
            }
            break; }
        case atom._NET_WM_MOVERESIZE: {
            const u32 = new Uint32Array(event.data);
            if (!this._moveResize.enabled && u32.length >= 5) {
                const client = this._clientsByWindow.get(event.window);
                if (client && client.floating) {
                    const dir = this._xcb.ewmh.moveResizeDirection;
                    const direction = u32[2];
                    const time = this._currentTime;
                    switch (direction) {
                    case dir.MOVE_KEYBOARD:
                        this._moveResize.movingKeyboard = client;
                        this._bindings.enterMode(this._moveResizeMode);
                        break;
                    case dir.SIZE_KEYBOARD:
                        this._moveResize.resizingKeyboard = client;
                        this._bindings.enterMode(this._moveResizeMode);
                        break;
                    case dir.CANCEL:
                        if (this._moveResize.enabled) {
                            this._moveResizeMode.exit();
                            this._xcb.ungrab_pointer(this._wm, time);
                            this._moveResize.clear();
                        }
                        break;
                    case dir.MOVE:
                        this._grabPointer(time);
                        this._moveClient(client, { root_x: u32[0], root_y: u32[1] });
                        break;
                    case dir.SIZE_TOPLEFT:
                    case dir.SIZE_TOP:
                    case dir.SIZE_TOPRIGHT:
                    case dir.SIZE_RIGHT:
                    case dir.SIZE_BOTTOMRIGHT:
                    case dir.SIZE_BOTTOM:
                    case dir.SIZE_BOTTOMLEFT:
                    case dir.SIZE_LEFT:
                        this._grabPointer(time);
                        this._resizeClient(client, { root_x: u32[0], root_y: u32[1], time: time });
                        break;
                    }
                }
            }
            break; }
        case atom._NET_REQUEST_FRAME_EXTENTS: {
            let border = 0;
            const xcb = this._xcb;

            const client = this._clientsByWindow.get(event.window);
            if (client) {
                border = calculateBorder(client.window, xcb);
            } else {
                try {
                    const win = xcb.request_window_information(this._wm, event.window);
                    border = calculateBorder(win, xcb);
                } catch (e) {
                    // no such window?
                    return;
                }
            }

            const borderData = new Uint32Array(4);
            borderData[0] = border;
            borderData[1] = border;
            borderData[2] = border;
            borderData[3] = border;

            xcb.change_property(this._wm, { window: event.window, mode: xcb.propMode.REPLACE,
                                            property: xcb.atom._NET_FRAME_EXTENTS, type: xcb.atom.CARDINAL,
                                            format: 32, data: borderData });
            break; }
        }
    }

    propertyNotify(event: XCB.PropertyNotify) {
        this._log.info("property", event);
        this._currentTime = event.time;
        const client = this._clientsByWindow.get(event.window);
        if (!client)
            return;

        client.updateProperty(event.atom, event.state === this._xcb.propState.NEW_VALUE);
    }

    buttonPress(event: XCB.ButtonPress) {
        this._log.info("press", event);
        this._currentTime = event.time;

        // if this is our modifier grab, process that
        if (event.state === this._moveModifierMask) {
            // yup.
            const client = this.findClientByPosition(event.root_x, event.root_y);
            if (!client || !client.floating) {
                // keep processing events
                this._xcb.allow_events(this._wm, { mode: this._xcb.allow.ASYNC_POINTER, time: event.time });
                return;
            }

            this._grabPointer(event.time);

            if (event.detail === 1) {
                // move
                this._moveClient(client, event);
            } else if (event.detail === 3) {
                // resize
                this._resizeClient(client, event);
            }
        } else {
            this._xcb.allow_events(this._wm, { mode: this._xcb.allow.REPLAY_POINTER, time: event.time });
            this._policy.buttonPress(event);
        }
    }

    buttonRelease(event: XCB.ButtonPress) {
        this._log.info("release", event);
        this._currentTime = event.time;
        if (this._moveResize.moving) {
            this._moveResizeMode.exit();

            this._moveResize.moving.client.move(this._moveResize.moving.x + event.root_x, this._moveResize.moving.y + event.root_y);
            this._xcb.ungrab_pointer(this._wm, event.time);
            this._moveResize.clear();
        } else if (this._moveResize.resizing) {
            this._moveResizeMode.exit();

            const dx = event.root_x - this._moveResize.resizing.x;
            const dy = event.root_y - this._moveResize.resizing.y;
            switch (this._moveResize.resizing.handle) {
            case ResizeHandle.TopLeft:
                this._moveResize.resizing.client.move(this._moveResize.resizing.geom.x + dx, this._moveResize.resizing.geom.y + dy);
                this._moveResize.resizing.client.resize(this._moveResize.resizing.geom.width - dx, this._moveResize.resizing.geom.height - dy);
                break;
            case ResizeHandle.TopRight:
                this._moveResize.resizing.client.move(this._moveResize.resizing.geom.x, this._moveResize.resizing.geom.y + dy);
                this._moveResize.resizing.client.resize(this._moveResize.resizing.geom.width + dx, this._moveResize.resizing.geom.height - dy);
                break;
            case ResizeHandle.BottomLeft:
                this._moveResize.resizing.client.move(this._moveResize.resizing.geom.x + dx, this._moveResize.resizing.geom.y);
                this._moveResize.resizing.client.resize(this._moveResize.resizing.geom.width - dx, this._moveResize.resizing.geom.height + dy);
                break;
            case ResizeHandle.BottomRight:
                this._moveResize.resizing.client.resize(this._moveResize.resizing.geom.width + dx, this._moveResize.resizing.geom.height + dy);
                break;
            }
            this._xcb.ungrab_pointer(this._wm, event.time);
            this._moveResize.clear();
        } else {
            this._xcb.allow_events(this._wm, { mode: this._xcb.allow.REPLAY_POINTER, time: event.time });
            this._policy.buttonRelease(event);
        }
    }

    motionNotify(event: XCB.MotionNotify) {
        this._log.info("motion", event);
        this._currentTime = event.time;
        if (this._moveResize.moving) {
            // move
            this._moveResize.moving.client.move(this._moveResize.moving.x + event.root_x, this._moveResize.moving.y + event.root_y);
        } else if (this._moveResize.resizing) {
            const dx = event.root_x - this._moveResize.resizing.x;
            const dy = event.root_y - this._moveResize.resizing.y;
            switch (this._moveResize.resizing.handle) {
            case ResizeHandle.TopLeft:
                this._moveResize.resizing.client.move(this._moveResize.resizing.geom.x + dx, this._moveResize.resizing.geom.y + dy);
                this._moveResize.resizing.client.resize(this._moveResize.resizing.geom.width - dx, this._moveResize.resizing.geom.height - dy);
                break;
            case ResizeHandle.TopRight:
                this._moveResize.resizing.client.move(this._moveResize.resizing.geom.x, this._moveResize.resizing.geom.y + dy);
                this._moveResize.resizing.client.resize(this._moveResize.resizing.geom.width + dx, this._moveResize.resizing.geom.height - dy);
                break;
            case ResizeHandle.BottomLeft:
                this._moveResize.resizing.client.move(this._moveResize.resizing.geom.x + dx, this._moveResize.resizing.geom.y);
                this._moveResize.resizing.client.resize(this._moveResize.resizing.geom.width - dx, this._moveResize.resizing.geom.height + dy);
                break;
            case ResizeHandle.BottomRight:
                this._moveResize.resizing.client.resize(this._moveResize.resizing.geom.width + dx, this._moveResize.resizing.geom.height + dy);
                break;
            }
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

        const ws = client.workspace;
        if (ws === undefined && !client.ignoreWorkspace) {
            throw new Error(`tried to focus client with no workspace: ${client.window.window}:${client.window.wmRole}:${client.window.wmClass.class_name}:${client.window.wmClass.instance_name}`);
        }

        if (this._focused) {
            this._focused.framePixel = this._inactiveColor;
            this._xcb.send_expose(this._wm, { window: this._focused.frame, width: this._focused.frameWidth, height: this._focused.frameHeight });

            this._ewmh.removeStateFocused(this._focused);

            this._events.emit("clientFocusOut", this._focused);
        }

        this._focused = client;

        this._focused.framePixel = this._activeColor;
        this._xcb.send_expose(this._wm, { window: this._focused.frame, width: this._focused.frameWidth, height: this._focused.frameHeight });

        this._ewmh.addStateFocused(client);

        this._events.emit("clientFocusIn", this._focused);

        if (ws) {
            this._ewmh.updateCurrentWorkspace(ws.id);
        }
    }

    revertFocus(fromDestroy?: boolean) {
        if (!this._focused)
            return;

        const newfocus = this.findClientUnderCursor();
        if (newfocus) {
            setImmediate(() => {
                newfocus.focus();
            });
            return;
        }

        // revert focus to root window
        this._focused.framePixel = this._inactiveColor;
        this._xcb.send_expose(this._wm, { window: this._focused.frame, width: this._focused.frameWidth, height: this._focused.frameHeight });

        if (!fromDestroy) {
            this._ewmh.removeStateFocused(this._focused);
        }

        this._events.emit("clientFocusOut", this._focused);

        const root = this._focused.root;
        this._focused = undefined;

        this._xcb.set_input_focus(this._wm, { window: root, revert_to: this._xcb.inputFocus.NONE, time: this.currentTime });

        const activeData = new Uint32Array(1);
        activeData[0] = root;
        this._xcb.change_property(this._wm, { window: root, mode: this._xcb.propMode.REPLACE,
                                            property: this._xcb.atom._NET_ACTIVE_WINDOW, type: this._xcb.atom.WINDOW,
                                            format: 32, data: activeData });
    }

    updateLayout() {
        this._events.emit("needsLayout");
    }

    relayout() {
        this._monitors.relayout();
    }

    recreateKeyBindings() {
        this._bindings.recreate();
        this._moveResizeMode.recreate();
    }

    inited() {
        process.nextTick(() => {
            this._ewmh.updateSupported();
            this._ewmh.updateViewport();
            // do an explicit flush here
            this._xcb.flush(this._wm);

            this._events.emit("inited");
        });
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

        if (this._options.display !== undefined) {
            env = Object.assign({}, env);
            env.DISPLAY = this._options.display;
        }
        const spawnArgs = shellArgs.concat([`${quote([ opts.command ].concat(args))}`]);
        let stdioValue: StdioOptions;
        switch (stdio) {
        case "ignore": stdioValue = "ignore"; break;
        case "pipe": stdioValue = "pipe"; break;
        case "inherit": stdioValue = "inherit"; break;
        default: throw new Error(`Bad stdio ${stdio}`); break;
        }

        this._log.debug("spawn", shell, spawnArgs, "detached", detached, "stdio", stdioValue);
        const subprocess = spawn(shell, spawnArgs, {
            detached: detached,
            stdio: stdioValue,
            env: env
        });

        if (detached)
            subprocess.unref();
        return subprocess;
    }

    createMoveGrab() {
        const grabMode = this._xcb.grabMode;
        const events = this._xcb.eventMask.BUTTON_PRESS;

        // left button
        this._xcb.grab_button(this._wm, { window: this._root, modifiers: this._moveModifierMask,
                                          button: 1, owner_events: 1, event_mask: events,
                                          pointer_mode: grabMode.SYNC, keyboard_mode: grabMode.ASYNC });
        // right button
        this._xcb.grab_button(this._wm, { window: this._root, modifiers: this._moveModifierMask,
                                          button: 3, owner_events: 1, event_mask: events,
                                          pointer_mode: grabMode.SYNC, keyboard_mode: grabMode.ASYNC });
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
        }
        this._clients = [];
    }

    handleXCB(e: OWM.Event) {
        if (!e.xcb)
            return;
        const event = this._xcb.event;
        switch (e.xcb.type) {
        case event.BUTTON_PRESS:
            this.buttonPress(e.xcb as XCB.ButtonPress);
            break;
        case event.BUTTON_RELEASE:
            this.buttonRelease(e.xcb as XCB.ButtonPress);
            break;
        case event.MOTION_NOTIFY:
            this.motionNotify(e.xcb as XCB.MotionNotify);
            break;
        case event.KEY_PRESS:
            this.keyPress(e.xcb as XCB.KeyPress);
            break;
        case event.KEY_RELEASE:
            this.keyRelease(e.xcb as XCB.KeyPress);
            break;
        case event.ENTER_NOTIFY:
            this.enterNotify(e.xcb as XCB.EnterNotify);
            break;
        case event.LEAVE_NOTIFY:
            this.leaveNotify(e.xcb as XCB.EnterNotify);
            break;
        case event.MAP_REQUEST:
            this.mapRequest(e.xcb as XCB.MapRequest);
            break;
        case event.CONFIGURE_REQUEST:
            this.configureRequest(e.xcb as XCB.ConfigureRequest);
            break;
        case event.CONFIGURE_NOTIFY:
            this.configureNotify(e.xcb as XCB.ConfigureNotify);
            break;
        case event.MAP_NOTIFY:
            this.mapNotify(e.xcb as XCB.MapNotify);
            break;
        case event.UNMAP_NOTIFY:
            this.unmapNotify(e.xcb as XCB.UnmapNotify);
            break;
        case event.DESTROY_NOTIFY:
            this.destroyNotify(e.xcb as XCB.DestroyNotify);
            break;
        case event.FOCUS_IN:
            this.focusIn(e.xcb as XCB.FocusIn);
            break;
        case event.FOCUS_OUT:
            this.focusOut(e.xcb as XCB.FocusIn);
            break;
        case event.EXPOSE:
            this.expose(e.xcb as XCB.Expose);
            break;
        case event.CLIENT_MESSAGE:
            this.clientMessage(e.xcb as XCB.ClientMessage);
            break;
        case event.PROPERTY_NOTIFY:
            this.propertyNotify(e.xcb as XCB.PropertyNotify);
            break;
        }
    }

    private _grabPointer(time: number) {
        const events = this._xcb.eventMask.BUTTON_RELEASE | this._xcb.eventMask.POINTER_MOTION;
        const asyncMode = this._xcb.grabMode.ASYNC;
        this._xcb.grab_pointer(this._wm, { window: this._root, owner_events: 1, event_mask: events,
                                           pointer_mode: asyncMode, keyboard_mode: asyncMode,
                                           time: time });
        this._xcb.allow_events(this._wm, { mode: this._xcb.allow.ASYNC_POINTER, time: time });

        // also grab the escape button so that we can exit that way
        this._bindings.enterMode(this._moveResizeMode);
    }

    private _moveClient(client: Client, event: { root_x: number, root_y: number }) {
        // grab the pointer, asking for move and release events
        const geom = client.frameGeometry;
        this._moveResize.moving = { client: client, x: geom.x - event.root_x, y: geom.y - event.root_y };
    }

    private _resizeClient(client: Client, event: { root_x: number, root_y: number, time: number }) {
        const geom = client.frameGeometry;
        const win_x = event.root_x - geom.x;
        const win_y = event.root_y - geom.y;

        if (win_x < 0 || win_y < 0 || win_x > geom.width || win_y > geom.height) {
            this._xcb.ungrab_pointer(this._wm, event.time);
            throw new Error("resize gone wrong");
        }

        let handle: ResizeHandle | undefined;
        if (win_x <= geom.width / 2) {
            // left half
            if (win_y <= geom.height / 2) {
                // top-left
                handle = ResizeHandle.TopLeft;
            } else {
                // bottom-left
                handle = ResizeHandle.BottomLeft;
            }
        } else {
            // right half
            if (win_y <= geom.height / 2) {
                // top-right
                handle = ResizeHandle.TopRight;
            } else {
                // bottom-right
                handle = ResizeHandle.BottomRight;
            }
        }

        this._moveResize.resizing = {
            client: client,
            x: event.root_x, y: event.root_y,
            geom: new Geometry(geom),
            handle: handle
        };
    }

    private _destroyClient(client: Client, unmap: boolean) {
        // if this is our focused client, revert focus somewhere else
        const window = client.window.window;
        if (client === this._focused) {
            this.revertFocus(true);
        }
        if (client.ignoreWorkspace) {
            const monitor = this._monitors.monitorByPosition(client.geometry.x, client.geometry.y);
            monitor.removeItem(client);
        }
        if (!client.group.remove(window)) {
            this._groups.delete(client.group.leaderWindow);
        }

        if (unmap) {
            this._ewmh.clearDesktop(client);
        }

        const idx = this._clients.indexOf(client);
        if (idx === -1) {
            throw new Error("client not in list of clients?");
        }

        this._clients.splice(idx, 1);

        this._ewmh.updateClientList();

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

        this._xcb.change_save_set(this._wm, { window: window, mode: this._xcb.setMode.DELETE });

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
        this._xcb.ungrab_button(this._wm, { window: this._root, modifiers: this._moveModifierMask, button: 3 });
    }
};
