import { XCB } from "native";
import { OWMLib } from "./owm";
import { Container } from "./container";
import { Client } from "./client";

export class Workspace
{
    private _screen: XCB.Screen;
    private _id: number | undefined;
    private _name: string | undefined;
    private _workspaces: Workspaces | undefined;
    private _container: Container;

    constructor(owm: OWMLib, screen: XCB.Screen, id?: number | string, name?: string) {
        if (typeof id === "string" && name) {
            throw new Error("Workspace name passed twice");
        }
        this._screen = screen;
        if (typeof id === "string") {
            this._name = id;
        } else {
            this._id = id;
        }
        this._name = name;
        this._container = new Container(owm, screen);
    }

    get id() {
        return this._id;
    }

    set id(id: number | undefined) {
        if (this._workspaces && id)
            this._workspaces.updateId(this, id);
        this._id = id;
    }

    get name() {
        return this._name;
    }

    set name(name: string | undefined) {
        if (this._workspaces && name)
            this._workspaces.updateName(this, name);
        this._name = name;
    }

    get workspaces() {
        return this._workspaces;
    }

    set workspaces(wss: Workspaces | undefined) {
        if (this._workspaces && wss && this._workspaces !== wss) {
            throw new Error("workspace already assigned");
        }
        this._workspaces = wss;
    }

    get screen() {
        return this._screen;
    }

    get outputs() {
        return this._screen.outputs;
    }

    get container() {
        return this._container;
    }

    addClient(client: Client) {
        this._container.add(client);
    }

    removeClient(client: Client) {
        this._container.remove(client);
    }

    update(screen: XCB.Screen) {
        this._screen = screen;
        this._container.geometry = screen;
        this._container.relayout();
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

    workspacesByOutput(output: string): Workspace[] | undefined {
        return this._workspaces.get(output);
    }

    workspaceByOutput(output: string): Workspace | undefined {
        const wss = this._workspaces.get(output);
        if (!wss || !wss.length)
            return undefined;
        return wss[0];
    }

    workspaceById(id: number): Workspace | undefined {
        let ret: Workspace | undefined = undefined;
        this.forEachWorkspace((ws: Workspace) => {
            if (ws.id === id) {
                ret = ws;
                return false;
            }
            return true;
        });
        return ret;
    }

    workspaceByName(name: string): Workspace | undefined {
        let ret: Workspace | undefined = undefined;
        this.forEachWorkspace((ws: Workspace) => {
            if (ws.name === name) {
                ret = ws;
                return false;
            }
            return true;
        });
        return ret;
    }

    get all() {
        return this._workspaces.values();
    }

    add(ws: Workspace) {
        console.log("adding ws", ws.outputs);
        ws.workspaces = this;
        for (const output of ws.outputs) {
            const wss = this._workspaces.get(output);
            if (wss) {
                wss.push(ws);
            } else {
                this._workspaces.set(output, [ws]);
            }
        }
    }

    updateId(ws: Workspace, newId: number) {
        // remove any workspace existing with newId
        this.forEachWorkspace((ws: Workspace) => {
            if (ws.id === newId) {
                const outputs = ws.outputs;
                for (let i = 0; i < outputs.length; ++i) {
                    const wss = this._workspaces.get(outputs[i]);
                    if (!wss)
                        continue;
                    const idx = wss.indexOf(ws);
                    if (idx === -1)
                        continue;
                    wss.splice(idx, 1);
                    if (!wss.length)
                        this._workspaces.delete(outputs[i]);
                }
                return false;
            }
            return true;
        });
    }

    updateName(ws: Workspace, newName: string) {
        // remove any workspace existing with newId
        this.forEachWorkspace((ws: Workspace) => {
            if (ws.name === newName) {
                const outputs = ws.outputs;
                for (let i = 0; i < outputs.length; ++i) {
                    const wss = this._workspaces.get(outputs[i]);
                    if (!wss)
                        continue;
                    const idx = wss.indexOf(ws);
                    if (idx === -1)
                        continue;
                    wss.splice(idx, 1);
                    if (!wss.length)
                        this._workspaces.delete(outputs[i]);
                }
                return false;
            }
            return true;
        });
    }

    forEachWorkspace(run: (ws: Workspace) => boolean) {
        const wss = new Set<Workspace>();
        for (const [output, ws] of this._workspaces) {
            for (let i = 0; i < ws.length; ++i) {
                wss.add(ws[i]);
            }
        }
        for (const ws of wss) {
            if (!run(ws))
                break;
        }
    }

    update(screens: XCB.Screen[]) {
        const olds = new Map(this._workspaces);
        const sadded: XCB.Screen[] = [];
        const supdated: XCB.Screen[] = [];
        const wupdated: Workspace[] = []

        const updateAll = (ws: Workspace, screen: XCB.Screen) => {
            ws.update(screen);
            for (const [key, workspaces] of olds) {
                if (workspaces.includes(ws))
                    olds.delete(key);
            }
        };

        for (const screen of screens) {
            let found = false;
            const outputs = screen.outputs;
            for (const output of outputs) {
                const wss = this._workspaces.get(output);
                if (wss) {
                    found = true;
                    supdated.push(screen);
                    for (let i = 0; i < wss.length; ++i) {
                        updateAll(wss[i], screen);
                        wupdated.push(wss[i]);
                    }
                    break;
                }
            }

            if (!found) {
                sadded.push(screen);
            }
        }


        const sremoved: XCB.Screen[] = [];
        const wremoved: Workspace[] = [];
        // all workspaces left in olds are from dead outputs
        for (const [key, workspaces] of olds) {
            for (let i = 0; i < workspaces.length; ++i) {
                sremoved.push(workspaces[i].screen);
                wremoved.push(workspaces[i]);
            }
            this._workspaces.delete(key);
        }

        const removedWorkspaces = [...new Set(wremoved)];
        // maybe move the workspace clients to some workspace that's still around?

        this._owm.events.emit("screens", { added: sadded, removed: [...new Set(sremoved)], updated: supdated });
        this._owm.events.emit("workspaces", { updated: wupdated, removed: removedWorkspaces });
    }
}
