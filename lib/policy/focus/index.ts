import { XCB } from "native";
import { Policy } from "..";

export interface FocusPolicy
{
    buttonPress(event: XCB.ButtonPress): void;
    buttonRelease(event: XCB.ButtonPress): void;
    keyPress(event: XCB.KeyPress): void;
    keyRelease(event: XCB.KeyPress): void;
    enterNotify(event: XCB.EnterNotify): void;
    leaveNotify(event: XCB.EnterNotify): void;
    setPolicy(policy: Policy): void;
}
