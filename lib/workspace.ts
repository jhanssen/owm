import { XCB } from "native";
import { OWMLib } from "./owm";

export class Workspace
{
    private _screen: XCB.Screen;

    constructor(screen: XCB.Screen) {
        this._screen = screen;
    }

    get screen() {
        return this._screen;
    }

    get outputs() {
        return this._screen.outputs;
    }

    update(screen: XCB.Screen) {
        this._screen = screen;
    }
}

export class Workspaces
{
    private _workspaces: Map<string, Workspace[]>;
    private _owm: OWMLib;

    constructor(owm: OWMLib) {
        this._workspaces = new Map<string, Workspace[]>();
        this._owm = owm;
    }

    workspaces(output: string): Workspace[] | undefined {
        return this._workspaces.get(output);
    }

    workspace(output: string): Workspace | undefined {
        const wss = this._workspaces.get(output);
        if (!wss || !wss.length)
            return undefined;
        return wss[0];
    }

    get all() {
        return this._workspaces.values();
    }

    add(ws: Workspace) {
        console.log("adding ws", ws.outputs);
        for (const output of ws.outputs) {
            const wss = this._workspaces.get(output);
            if (wss) {
                wss.push(ws);
            } else {
                this._workspaces.set(output, [ws]);
            }
        }
    }

    update(screens: XCB.Screen[]) {
        const olds = new Map(this._workspaces);
        const news: XCB.Screen[] = [];

        const deleteAll = (ws: Workspace) => {
            for (const [key, workspaces] of olds) {
                if (workspaces.includes(ws))
                    olds.delete(key);
            }
        };

        for (const screen of screens) {
            let updated = false;
            const outputs = screen.outputs;
            for (const output of outputs) {
                const wss = this._workspaces.get(output);
                if (wss) {
                    updated = true;
                    for (let i = 0; i < wss.length; ++i) {
                        const ws = wss[i];
                        ws.update(screen);
                        deleteAll(ws);
                    }
                    break;
                }
            }

            if (!updated) {
                news.push(screen);
            }
        }

        this._owm.events.emit("screens", news);

        // all workspaces left in olds are from dead outputs
        for (const [key, workspace] of olds) {
            this._workspaces.delete(key);
        }
    }
}
