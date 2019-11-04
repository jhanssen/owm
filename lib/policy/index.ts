import { FocusPolicy } from "./focus";
import { FocusFollowsMousePolicy } from "./focus-follows-mouse";
import { OWMLib } from "../owm";
import { XCB } from "native";

export class Policy
{
    private _focus: FocusPolicy;
    private _owm: OWMLib;

    constructor(owm: OWMLib) {
        this._owm = owm;
        this._focus = new FocusFollowsMousePolicy(this);
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
};

export { FocusPolicy, FocusFollowsMousePolicy };
