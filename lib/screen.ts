import { XCB, OWM } from "native";

export class Screen
{
    private _screen: XCB.Screen;

    constructor(screen: XCB.Screen) {
        this._screen = screen;
    }
}
