import { XCB, OWM } from "native";

interface Client
{
    parent: number,
    window: XCB.Window
};

export class OWMLib {
    public readonly wm: OWM.WM;
    public readonly xcb: OWM.XCB;
    private clients: Client[];

    constructor(wm: OWM.WM, xcb: OWM.XCB) {
        this.wm = wm;
        this.xcb = xcb;
        this.clients = [];
    };

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

        this.clients.push({ parent: parent, window: win });
    }

    cleanup() {
        for (const client of this.clients) {
            this.xcb.reparent_window(this.wm, { window: client.window.window, parent: client.window.root, x: client.window.x, y: client.window.y });
            this.xcb.flush(this.wm);
        }
        this.clients = [];
    }
};
