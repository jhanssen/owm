import { Policy } from "..";
import { FocusPolicy } from ".";
import { OWMLib } from "../../owm";
import { XCB } from "native";

export class FocusFollowsMousePolicy implements FocusPolicy
{
    private _policy: Policy | undefined;

    constructor() {
    }

    buttonPress(event: XCB.ButtonPress) {
    }

    buttonRelease(event: XCB.ButtonPress) {
    }

    keyPress(event: XCB.KeyPress) {
    }

    keyRelease(event: XCB.KeyPress) {
    }

    enterNotify(event: XCB.EnterNotify) {
        if (!this._policy)
            return;

        let client = this._policy.owm.findClient(event.child);
        if (!client) {
            client = this._policy.owm.findClient(event.event);
        }
        if (client) {
            client.focus();
        } else {
            this._policy.owm.revertFocus();
        }
    }

    leaveNotify(event: XCB.EnterNotify) {
    }

    setPolicy(policy: Policy | undefined) {
        this._policy = policy;
    }
}
