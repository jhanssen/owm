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
        this._container = new Container(owm, Container.Type.TopLevel, monitor);
    }

    get id() {
        return this._id;
    }

    set id(id: number | undefined) {
        if (this._workspaces && id)
            this._workspaces.removeById(id);
        this._id = id;
    }

    get name() {
        return this._name;
    }

    set name(name: string | undefined) {
        if (this._workspaces && name)
            this._workspaces.removeByName(name);
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
        if (item.ignoreWorkspace) {
            return;
        }
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
    private _workspaces: Set<Workspace>;
    private _owm: OWMLib;
    private _monitor: Monitor;

    constructor(owm: OWMLib, monitor: Monitor) {
        this._workspaces = new Set<Workspace>();
        this._owm = owm;
        this._monitor = monitor;
    }

    get monitor() {
        return this._monitor;
    }

    workspaces(output: string) {
        return this._workspaces;
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

    add(ws: Workspace) {
        // verify that the name and id of this workspace is unique
        const name = ws.name;
        const id = ws.id;
        if (name || id) {
            ws.monitor.monitors.forEachWorkspace((sub: Workspace) => {
                if (name && sub.name === name ||
                    id && sub.id === id) {
                    throw new Error(`Workspace not uniquely named ${id} ${name}`);
                }
                return true;
            });
        }

        ws.workspaces = this;
        this._workspaces.add(ws);
    }

    removeById(id: number) {
        // remove any workspace existing with newId
        const old = this.workspaceById(id);
        if (old) {
            this._workspaces.delete(old);
        }
    }

    removeByName(name: string) {
        // remove any workspace existing with newId
        const old = this.workspaceByName(name);
        if (old) {
            this._workspaces.delete(old);
        }
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
        for (const ws of this._workspaces) {
            if (!run(ws))
                return false;
        }
        return true;
    }
}
