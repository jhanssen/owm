import { FocusPolicy } from "./focus";
import { FocusFollowsMousePolicy } from "./focus/follows-mouse";
import { LayoutPolicy, LayoutConfig } from "./layout";
import { TilingLayoutPolicy, TilingLayoutConfig } from "./layout/tiling";
import { OWMLib } from "../owm";
import { Client } from "../client";
import { XCB } from "native";
import { serialize, deserialize } from "v8";

type LayoutPolicyConstructor = { new(policy: Policy, cfg: LayoutConfig): LayoutPolicy };
type LayoutConfigConstructor = { new(): LayoutConfig };

export class Policy
{
    private _focus: FocusPolicy;
    private _layoutConstructor: LayoutPolicyConstructor;
    private _layoutConfig: LayoutConfig;
    private _owm: OWMLib;

    constructor(owm: OWMLib) {
        this._owm = owm;
        this._focus = new FocusFollowsMousePolicy(this);
        this._layoutConstructor = TilingLayoutPolicy;
        this._layoutConfig = new TilingLayoutConfig();
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

    get layoutConfig() {
        return this._layoutConfig;
    }

    setLayoutPolicy(ctor: LayoutPolicyConstructor, cfg: LayoutConfigConstructor) {
        this._layoutConstructor = ctor;
        this._layoutConfig = new cfg();
    }

    createLayout(): LayoutPolicy {
        const newcfg = deserialize(serialize(this._layoutConfig));
        Object.setPrototypeOf(newcfg, Object.getPrototypeOf(this._layoutConfig));
        return new this._layoutConstructor(this, newcfg);
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
