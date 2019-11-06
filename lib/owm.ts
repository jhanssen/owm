import { XCB, OWM } from "native";
import { Policy } from "./policy";
import { Keybindings } from "./keybindings";
import { Logger, ConsoleLogger } from "./logger";
import { Screen } from "./screen";
import { Workspace } from "./workspace";
import { Client } from "./client";

interface ClientInternal
{
    readonly _parent: number;
    readonly _window: XCB.Window;
};

export class OWMLib {
    private readonly _wm: OWM.WM;
    private readonly _xcb: OWM.XCB;
    private readonly _xkb: OWM.XKB;
    private _clients: Client[];
    private _screens: Screen[];
    private _currentTime: number;
    private _clientsByWindow: Map<number, Client>;
    private _clientsByFrame: Map<number, Client>;
    private _policy: Policy;
    private _focused: Client | undefined;
    private _log: Logger;
    private _bindings: Keybindings;
    private _root: number;

    constructor(wm: OWM.WM, xcb: OWM.XCB, xkb: OWM.XKB, loglevel: Logger.Level) {
        this._wm = wm;
        this._xcb = xcb;
        this._xkb = xkb;

        this._log = new ConsoleLogger(loglevel);

        this._root = 0;

        this._clients = [];
        this._screens = [];
        this._clientsByWindow = new Map<number, Client>();
        this._clientsByFrame = new Map<number, Client>();
        this._currentTime = 0;
        this._focused = undefined;
        this._bindings = new Keybindings(this);

        this._policy = new Policy(this);
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

    get screens() {
        return this._screens;
    }

    findClient(window: number): Client | undefined {
        let client = this._clientsByWindow.get(window);
        if (!client) {
            client = this._clientsByFrame.get(window);
        }
        return client;
    }

    addClient(win: XCB.Window) {
        this._log.debug("client", win);

        // reparent to new window
        const border = 10;
        const parent = this.xcb.create_window(this.wm, { x: win.geometry.x, y: win.geometry.y,
                                                         width: win.geometry.width + (border * 2),
                                                         height: win.geometry.height + (border * 2),
                                                         parent: win.geometry.root });

        const mask = this.xcb.eventMask.STRUCTURE_NOTIFY |
            this.xcb.eventMask.ENTER_WINDOW |
            this.xcb.eventMask.LEAVE_WINDOW |
            this.xcb.eventMask.EXPOSURE |
            this.xcb.eventMask.SUBSTRUCTURE_REDIRECT |
            this.xcb.eventMask.POINTER_MOTION |
            this.xcb.eventMask.BUTTON_PRESS |
            this.xcb.eventMask.BUTTON_RELEASE;

        this.xcb.change_window_attributes(this.wm, { window: parent, override_redirect: 1, event_mask: mask });
        this.xcb.reparent_window(this.wm, { window: win.window, parent: parent, x: border, y: border });
        this.xcb.map_window(this.wm, parent);
        this.xcb.flush(this.wm);

        const client = new Client(this, parent, win, border);
        this._clientsByWindow.set(win.window, client);
        this._clientsByFrame.set(parent, client);
        this._log.info("client", win.window, parent);
        this._clients.push(client);

        this._policy.clientAdded(client);
    }

    updateScreens(screens: OWM.Screens) {
        this._log.info("screens", screens);
        this._root = screens.root;
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

    setFocused(client: Client) {
        this._focused = client;
    }

    revertFocus() {
        if (!this._focused)
            return;

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

    recreateKeyBindings() {
        this._bindings.recreate();
    }

    cleanup() {
        for (const client of this._clients) {
            this.xcb.reparent_window(this.wm, {
                window: ((client as unknown) as ClientInternal)._window.window,
                parent: ((client as unknown) as ClientInternal)._window.geometry.root,
                x: ((client as unknown) as ClientInternal)._window.geometry.x,
                y: ((client as unknown) as ClientInternal)._window.geometry.y
            });
            this.xcb.flush(this.wm);
        }
        this._clients = [];
    }
};
