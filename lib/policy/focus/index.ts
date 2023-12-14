import { XCB } from "native";

export interface FocusPolicy
{
    buttonPress(event: XCB.ButtonPress): void;
    buttonRelease(event: XCB.ButtonPress): void;
    keyPress(event: XCB.KeyPress): void;
    keyRelease(event: XCB.KeyPress): void;
    enterNotify(event: XCB.EnterNotify): void;
    leaveNotify(event: XCB.EnterNotify): void;
}
