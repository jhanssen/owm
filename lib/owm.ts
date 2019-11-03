import { XCB, OWM } from "../native";

export class OWMLib {
    public readonly wm: OWM.WM;
    private clients: XCB.Window[];

    constructor(wm: OWM.WM) {
        this.wm = wm;
        this.clients = [];
    };

    addClient(win: XCB.Window) {
        this.clients.push(win);
    }
};
