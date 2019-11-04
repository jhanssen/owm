import { Policy } from ".";
import { FocusPolicy } from "./focus";
import { OWMLib } from "../owm";
import { XCB } from "native";

export class FocusFollowsMousePolicy implements FocusPolicy
{
    private _policy: Policy;

    constructor(policy: Policy) {
        this._policy = policy;
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
}
