import { XCB, OWM } from "native";

export class Client
{
    private readonly parent: number;
    private readonly window: XCB.Window;
    private readonly wm: OWM.WM;
    private readonly xcb: OWM.XCB;
    private readonly border: number;

    constructor(owm: OWMLib, parent: number, window: XCB.Window, border: number) {
        this.wm = owm.wm;
        this.xcb = owm.xcb;
        this.parent = parent;
        this.window = window;
        this.border = border;
    }

    move(x: number, y: number) {
        this.xcb.configure_window(this.wm, {
            window: this.parent,
            x: x,
            y: y
        });
        this.xcb.flush(this.wm);
    }

    resize(width: number, height: number) {
        if (width <= (this.border * 2) || height <= (this.border * 2)) {
            throw new Error("size too small");
        }
        this.xcb.configure_window(this.wm, {
            window: this.parent,
            width: width,
            height: height
        });
        this.window.width = width - (this.border * 2);
        this.window.height = height - (this.border * 2);
        this.xcb.configure_window(this.wm, {
            window: this.window.window,
            width: this.window.width,
            height: this.window.height
        });
        this.xcb.flush(this.wm);
    }

    map() {
        this.xcb.map_window(this.wm, this.parent);
        this.xcb.flush(this.wm);
    }

    unmap() {
        this.xcb.unmap_window(this.wm, this.parent);
        this.xcb.flush(this.wm);
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

    constructor(wm: OWM.WM, xcb: OWM.XCB) {
        this.wm = wm;
        this.xcb = xcb;
        this._clients = [];
        this._screens = [];
    };

    get clients(): Client[] {
        return this._clients;
    }

    addClient(win: XCB.Window) {
        // reparent to new window
        const border = 10;
        const parent = this.xcb.create_window(this.wm, { x: win.x, y: win.y,
                                                         width: win.width + (border * 2),
                                                         height: win.height + (border * 2),
                                                         parent: win.root });
        this.xcb.reparent_window(this.wm, { window: win.window, parent: parent, x: border, y: border });
        this.xcb.map_window(this.wm, parent);
        this.xcb.flush(this.wm);

        this._clients.push(new Client(this, parent, win, border));
    }

    updateScreens(screens: XCB.Screen[]) {
        console.log("screens", screens);
        this._screens = screens;
    }

    cleanup() {
        for (const client of this._clients) {
            this.xcb.reparent_window(this.wm, {
                window: ((client as unknown) as ClientInternal).window.window,
                parent: ((client as unknown) as ClientInternal).window.root,
                x: ((client as unknown) as ClientInternal).window.x,
                y: ((client as unknown) as ClientInternal).window.y
            });
            this.xcb.flush(this.wm);
        }
        this._clients = [];
    }
};
