import { XCB } from "native";
import { OWMLib } from "./owm";
import { Container, ContainerItem } from "./container";
import { Geometry, Strut } from "./utils";
import { Client } from "./client";
import { Monitor } from "./monitor";

export class Workspace
{
    private _monitor: Monitor | undefined;
    private _id: number;
    private _name: string | undefined;
    private _workspaces: Workspaces | undefined;
    private _container: Container;
    private _owm: OWMLib;

    constructor(owm: OWMLib, id: number, name?: string) {
        // to protect from usages from config js
        if (typeof id !== "number" || id <= 0) {
            throw new Error("Workspace id needs to be a number > 0");
        }
        this._id = id;
        this._name = name;
        this._owm = owm;
        this._container = new Container(owm, Container.Type.TopLevel);
    }

    get id() {
        return this._id;
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

    set monitor(monitor: Monitor | undefined) {
        this._monitor = monitor;
        this._container.monitor = monitor;
    }

    get outputs() {
        if (!this._monitor) {
            return [];
        }
        return this._monitor.screen.outputs;
    }

    get container() {
        return this._container;
    }

    get geometry() {
        return this._container.geometry;
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

        if (Strut.hasStrut(item.strut)) {
            this._owm.ewmh.updateWorkarea();
        }
    }

    removeItem(item: ContainerItem) {
        if (item.workspace !== this) {
            throw new Error("Item is on wrong workspace!");
        }
        item.workspace = undefined;
        this._container.remove(item);

        if (Strut.hasStrut(item.strut)) {
            this._owm.ewmh.updateWorkarea();
        }
    }

    relayout() {
        this._container.relayout();
    }

    update() {
        if (this._monitor) {
            this._container.geometry = new Geometry(this._monitor.screen);
        } else {
            this._container.geometry = new Geometry();
        }
        this._container.relayout();

        this._owm.ewmh.updateWorkarea();
    }

    activate() {
        if (this._monitor)
            this._monitor.workspace = this;
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
            this._monitor.monitors.forEachWorkspace((sub: Workspace) => {
                if (sub.id === id || name && sub.name === name) {
                    throw new Error(`Workspace not uniquely named ${id} ${name}`);
                }
                return true;
            });
        }

        ws.workspaces = this;
        ws.monitor = this._monitor;
        this._workspaces.add(ws);

        this._owm.ewmh.updateWorkspaces();
        this._owm.ewmh.updateWorkarea();
    }

    removeById(id: number) {
        // remove any workspace existing with newId
        const old = this.workspaceById(id);
        if (old) {
            old.monitor = undefined;
            this._workspaces.delete(old);

            this._owm.ewmh.updateWorkspaces();
            this._owm.ewmh.updateWorkarea();
        }
    }

    removeByName(name: string) {
        // remove any workspace existing with newId
        const old = this.workspaceByName(name);
        if (old) {
            old.monitor = undefined;
            this._workspaces.delete(old);

            this._owm.ewmh.updateWorkspaces();
            this._owm.ewmh.updateWorkarea();
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
