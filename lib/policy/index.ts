import { FocusPolicy } from "./focus";
import { FocusFollowsMousePolicy } from "./focus/follows-mouse";
import { LayoutPolicy } from "./layout";
import { TilingLayoutPolicy } from "./layout/tiling";
import { OWMLib } from "../owm";
import { Client } from "../client";
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
        this._layout = arg;
    }

    createLayout(name: string): LayoutPolicy | undefined {
        switch (name) {
            case "tiling":
                return new TilingLayoutPolicy(this);
        }
        return undefined;
    }

    createFocus(name: string): FocusPolicy | undefined {
        switch (name) {
            case "follows-mouse":
            case "followsmouse":
                return new FocusFollowsMousePolicy(this);
        }
        return undefined;
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
