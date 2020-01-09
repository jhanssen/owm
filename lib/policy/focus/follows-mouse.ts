import { Policy } from "..";
import { FocusPolicy } from ".";
import { OWMLib } from "../../owm";
import { XCB } from "native";

export class FocusFollowsMousePolicy implements FocusPolicy
{
    private _policy: Policy;

    constructor(policy: Policy) {
        this._policy = policy;
    }

    buttonPress(event: XCB.ButtonPress) {
        this._focus(event);
        this._raise(event);
    }

    buttonRelease(event: XCB.ButtonPress) {
    }

    keyPress(event: XCB.KeyPress) {
    }

    keyRelease(event: XCB.KeyPress) {
    }

    enterNotify(event: XCB.EnterNotify) {
        this._focus(event);
    }

    leaveNotify(event: XCB.EnterNotify) {
    }

    private _focus(event: XCB.EnterNotify | XCB.ButtonPress) {
        let client = this._policy.owm.findClient(event.child);
        if (!client) {
            client = this._policy.owm.findClient(event.event);
        }
        if (client) {
            client.focus();
        } else {
            // this._policy.owm.revertFocus();
        }
    }

    private _raise(event: XCB.ButtonPress) {
        let client = this._policy.owm.findClient(event.child);
        if (!client) {
            client = this._policy.owm.findClient(event.event);
        }
        if (client) {
            client.raise();
        }
    }
}
