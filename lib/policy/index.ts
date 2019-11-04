import { FocusPolicy } from "./focus";
import { FocusFollowsMousePolicy } from "./focus-follows-mouse";
import { LayoutPolicy } from "./layout";
import { TilingLayoutPolicy } from "./tiling-layout";
import { OWMLib, Client } from "../owm";
import { XCB } from "native";

export class Policy
{
    private _focus: FocusPolicy;
    private _layout: LayoutPolicy;
    private _owm: OWMLib;

    constructor(owm: OWMLib) {
        this._owm = owm;
        this._focus = new FocusFollowsMousePolicy(this);
        this._layout = new TilingLayoutPolicy(this);
    }

    get owm() {
        return this._owm;
    }

    get focus() {
        return this._focus;
    }

    set focus(arg: FocusPolicy) {
        this._focus = arg;
    }

    get layout() {
        return this._layout;
    }

    set layout(arg: LayoutPolicy) {
        arg.adopt(this);

        this._layout = arg;
        this._layout.relayout();
    }

    buttonPress(event: XCB.ButtonPress) {
        this._focus.buttonPress(event);
    }

    buttonRelease(event: XCB.ButtonPress) {
        this._focus.buttonRelease(event);
    }

    keyPress(event: XCB.KeyPress) {
        this._focus.keyPress(event);
    }

    keyRelease(event: XCB.KeyPress) {
        this._focus.keyRelease(event);
    }

    enterNotify(event: XCB.EnterNotify) {
        this._focus.enterNotify(event);
    }

    leaveNotify(event: XCB.EnterNotify) {
        this._focus.leaveNotify(event);
    }

    clientAdded(client: Client) {
        this._layout.clientAdded(client);
    }

    clientRemoved(client: Client) {
        this._layout.clientRemoved(client);
    }

    clientGeometryChanged(client: Client) {
        this._layout.clientGeometryChanged(client);
    }

    relayout() {
        this._layout.relayout();
    }
};

export { FocusPolicy, FocusFollowsMousePolicy };
