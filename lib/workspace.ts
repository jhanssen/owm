import { XCB } from "native";

export class Workspace
{
    private _screen: XCB.Screen;

    constructor(screen: XCB.Screen) {
        this._screen = screen;
    }

    updateScreen(screen: XCB.Screen) {
        this._screen = screen;
    }
}
