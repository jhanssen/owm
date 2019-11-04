import { XCB, OWM } from "native";

export class Client
{
    private readonly parent: number;
    private readonly window: XCB.Window;
    private readonly owm: OWMLib;
    private readonly border: number;
    private screen: number;
    private geometry: { x: number, y: number, width: number, height: number };
    private noinput: boolean;

    constructor(owm: OWMLib, parent: number, window: XCB.Window, screen: number, border: number) {
        this.owm = owm;
        this.parent = parent;
        this.window = window;
        this.border = border;
        this.screen = screen;
        this.geometry = {
            x: window.geometry.x,
            y: window.geometry.y,
            width: window.geometry.width,
            height: window.geometry.height
        };

        this.noinput = false;
        if (window.wmHints.flags & owm.xcb.icccm.hint.INPUT)
            this.noinput = window.wmHints.input === 0;
    }

    move(x: number, y: number) {
        this.owm.xcb.configure_window(this.owm.wm, {
            window: this.parent,
            x: x,
            y: y
        });
        this.geometry.x = x + this.border;
        this.geometry.y = y + this.border;
        this.owm.xcb.flush(this.owm.wm);
    }

    resize(width: number, height: number) {
        if (width <= (this.border * 2) || height <= (this.border * 2)) {
            throw new Error("size too small");
        }
        this.owm.xcb.configure_window(this.owm.wm, {
            window: this.parent,
            width: width,
            height: height
        });
        this.geometry.width = width - (this.border * 2);
        this.geometry.height = height - (this.border * 2);
        this.owm.xcb.configure_window(this.owm.wm, {
            window: this.window.window,
            width: this.geometry.width,
            height: this.geometry.height
        });
        this.owm.xcb.flush(this.owm.wm);
    }

    map() {
        this.owm.xcb.map_window(this.owm.wm, this.parent);
        this.owm.xcb.flush(this.owm.wm);
    }

    unmap() {
        this.owm.xcb.unmap_window(this.owm.wm, this.parent);
        this.owm.xcb.flush(this.owm.wm);
    }

    focus() {
        if (this.noinput)
            return;

        const takeFocus = this.owm.xcb.atom.WM_TAKE_FOCUS;
        if (this.window.wmProtocols.includes(takeFocus)) {
            console.log("sending client message");
            const data = new Uint32Array(2);
            data[0] = takeFocus;
            data[1] = this.owm.currentTime;
            this.owm.xcb.send_client_message(this.owm.wm, { window: this.window.window, type: this.owm.xcb.atom.WM_PROTOCOLS, data: data });
        }

        this.owm.xcb.set_input_focus(this.owm.wm, { window: this.window.window, revert_to: this.owm.xcb.inputFocus.FOCUS_PARENT,
                                                    time: this.owm.currentTime });

        const activeData = new Uint32Array(1);
        activeData[0] = this.window.window;
        this.owm.xcb.change_property(this.owm.wm, { window: this.window.geometry.root, mode: this.owm.xcb.propMode.REPLACE,
                                                    property: this.owm.xcb.atom._NET_ACTIVE_WINDOW, type: this.owm.xcb.atom.WINDOW,
                                                    format: 32, data: activeData });
        this.owm.xcb.flush(this.owm.wm);
    }
};

interface ClientInternal
{
    readonly parent: number;
    readonly window: XCB.Window;
};

export class OWMLib {
    public readonly wm: OWM.WM;
    public readonly xcb: OWM.XCB;
    private _clients: Client[];
    private _screens: XCB.Screen[];
    private _currentTime: number;
    private _clientsByWindow: Map<number, Client>;
    private _clientsByFrame: Map<number, Client>;

    constructor(wm: OWM.WM, xcb: OWM.XCB) {
        this.wm = wm;
        this.xcb = xcb;
        this._clients = [];
        this._screens = [];
        this._clientsByWindow = new Map<number, Client>();
        this._clientsByFrame = new Map<number, Client>();
        this._currentTime = 0;
    };

    get clients(): Client[] {
        return this._clients;
    }

    get currentTime(): number {
        return this._currentTime;
    }

    addClient(win: XCB.Window) {
        console.log("client", win);

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

        // find the screen number of this client
        let no: number | undefined = undefined;
        for (let screen of this._screens) {
            if (screen.root === win.geometry.root) {
                no = screen.no;
                break;
            }
        }

        if (no === undefined) {
            throw new Error("Couldn't find screen for client");
        }

        const client = new Client(this, parent, win, no, border);
        this._clientsByWindow.set(win.window, client);
        this._clientsByFrame.set(parent, client);
        console.log("client", win.window, parent);
        this._clients.push(client);
    }

    updateScreens(screens: XCB.Screen[]) {
        console.log("screens", screens);
        this._screens = screens;
    }

    buttonPress(event: XCB.ButtonPress) {
        console.log("press", event);
        this._currentTime = event.time;
    }

    buttonRelease(event: XCB.ButtonPress) {
        this._currentTime = event.time;
    }

    keyPress(event: XCB.KeyPress) {
        this._currentTime = event.time;
    }

    keyRelease(event: XCB.KeyPress) {
        this._currentTime = event.time;
    }

    enterNotify(event: XCB.EnterNotify) {
        this._currentTime = event.time;

        let client = this._clientsByWindow.get(event.child);
        if (!client) {
            client = this._clientsByFrame.get(event.event);
            if (!client)
                return;
        }
        client.focus();
    }

    leaveNotify(event: XCB.EnterNotify) {
        this._currentTime = event.time;
    }

    cleanup() {
        for (const client of this._clients) {
            this.xcb.reparent_window(this.wm, {
                window: ((client as unknown) as ClientInternal).window.window,
                parent: ((client as unknown) as ClientInternal).window.geometry.root,
                x: ((client as unknown) as ClientInternal).window.geometry.x,
                y: ((client as unknown) as ClientInternal).window.geometry.y
            });
            this.xcb.flush(this.wm);
        }
        this._clients = [];
    }
};
