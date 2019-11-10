import { XCB } from "native";
import { OWMLib } from "./owm";
import { Container, ContainerItem } from "./container";
import { Client } from "./client";
import { Monitor } from "./monitor";

export class Workspace
{
    private _monitor: Monitor;
    private _id: number | undefined;
    private _name: string | undefined;
    private _workspaces: Workspaces | undefined;
    private _container: Container;

    constructor(owm: OWMLib, monitor: Monitor, id?: number | string, name?: string) {
        if (typeof id === "string" && name) {
            throw new Error("Workspace name passed twice");
        }
        this._monitor = monitor;
        if (typeof id === "string") {
            this._name = id;
        } else {
            this._id = id;
        }
        this._name = name;
        this._container = new Container(owm, monitor.screen);
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

    get monitor() {
        return this._monitor;
    }

    get outputs() {
        return this._monitor.screen.outputs;
    }

    get container() {
        return this._container;
    }

    get visible() {
        return this._container.visible;
    }

    set visible(v: boolean) {
        // hide all clients
        this._container.visible = v;
    }

    addItem(item: ContainerItem) {
        if (item.workspace !== undefined) {
            throw new Error("Item is already on a workspace!");
        }
        item.workspace = this;
        this._container.add(item);
    }

    removeItem(item: ContainerItem) {
        if (item.workspace !== this) {
            throw new Error("Item is on wrong workspace!");
        }
        item.workspace = undefined;
        this._container.remove(item);
    }

    relayout() {
        this._container.relayout();
    }

    update() {
        this._container.geometry = this._monitor.screen;
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

    updateScreen() {
        this.forEachWorkspace((ws: Workspace) => {
            ws.update();
            return true;
        });
    }

    relayout() {
        this.forEachWorkspace((ws: Workspace) => {
            ws.relayout();
            return true;
        });
    }

    removeItem(item: ContainerItem) {
        this.forEachWorkspace((ws: Workspace) => {
            ws.removeItem(item);
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
}
