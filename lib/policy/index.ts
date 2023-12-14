import { OWMLib, Workspace } from "..";
import { FocusFollowsMousePolicy } from "./focus/follows-mouse";
import { FocusPolicy } from "./focus";
import { LayoutConfig, LayoutPolicy, LayoutPolicyConstructor } from "./layout";
import { StackingLayoutConfig, StackingLayoutPolicy } from "./layout/stacking";
import { TilingLayoutConfig, TilingLayoutPolicy } from "./layout/tiling";
import { XCB } from "native";
import { deserialize, serialize } from "v8";

export class Policy {
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

    setLayoutPolicy(type: string) {
        switch (type) {
        case "tiling":
            this._layoutConstructor = TilingLayoutPolicy;
            this._layoutConfig = new TilingLayoutConfig();
            break;
        case "stacking":
            this._layoutConstructor = StackingLayoutPolicy;
            this._layoutConfig = new StackingLayoutConfig();
            break;
        default:
            throw new Error(`Unknown layout type ${type}`);
        }
    }

    createLayout(workspace: Workspace, type?: string): LayoutPolicy {
        if (type === undefined) {
            const newcfg = deserialize(serialize(this._layoutConfig));
            Object.setPrototypeOf(newcfg, Object.getPrototypeOf(this._layoutConfig));
            return new this._layoutConstructor(this, workspace, newcfg);
        }
        switch (type) {
        case "tiling":
            return new TilingLayoutPolicy(this, workspace, new TilingLayoutConfig());
        case "stacking":
            return new StackingLayoutPolicy(this, workspace, new StackingLayoutConfig());
        }
        throw new Error(`Unknown layout type ${type}`);
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
}

export { FocusPolicy, FocusFollowsMousePolicy };
