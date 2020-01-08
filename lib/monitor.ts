import { Workspace, Workspaces } from "./workspace";
import { OWMLib } from "./owm";
import { ContainerItem, ContainerItemType } from "./container";
import { Strut, Geometry } from "./utils";
import { XCB, OWM } from "native";


export class Monitor
{
    private _screen: XCB.Screen;
    private _workspaces: Workspaces;
    private _workspace: Workspace | undefined;
    private _monitors: Monitors;
    private _items: ContainerItem[];
    private _geometry: Geometry;

    constructor(monitors: Monitors, screen: XCB.Screen) {
        this._screen = screen;
        this._monitors = monitors;
        this._workspaces = new Workspaces(monitors.owm, this);
        this._items = [];
        this._geometry = new Geometry(screen);
    }

    get monitors() {
        return this._monitors;
    }

    get screen() {
        return this._screen;
    }

    get geometry() {
        return this._geometry;
    }

    set screen(screen: XCB.Screen) {
        this._screen = screen;
        this._geometry = new Geometry(screen);
        this._workspaces.updateScreen();
    }

    get workspace() {
        return this._workspace;
    }

    set workspace(ws: Workspace | undefined) {
        if (ws && ws.workspaces !== this._workspaces) {
            throw new Error("Workspace being set current on wrong monitor?");
        }
        if (this._workspace === ws) {
            return;
        }
        if (this._workspace) {
            this._workspace.visible = false;
        }
        this._workspace = ws;
        if (this._workspace) {
            this._workspace.visible = true;

            this._monitors.owm.ewmh.updateCurrentWorkspace(this._workspace.id);
            this._monitors.owm.events.emit("workspaceActivated", this);
        }
    }

    get workspaces() {
        return this._workspaces;
    }

    get items() {
        return this._items;
    }

    workspaceById(id: number): Workspace | undefined {
        return this._workspaces.workspaceById(id);
    }

    workspaceByName(name: string): Workspace | undefined {
        return this._workspaces.workspaceByName(name);
    }

    // for items that skip workspaces
    addItem(item: ContainerItem) {
        if (this._items.includes(item)) {
            throw new Error("item already in the monitors set of global items");
        }

        // raise this item on top of any previos item
        if (this._items.length > 0) {
            item.raise(this._items[this._items.length - 1]);
        }

        this._items.push(item);

        if (Strut.hasStrut(item.strut)) {
            this._monitors.owm.ewmh.updateWorkarea();
        }

        // relayout workspace
        if (this._workspace) {
            this._workspace.relayout();
        }
    }

    removeItem(item: ContainerItem) {
        const idx = this._items.indexOf(item);
        if (idx === -1) {
            throw new Error("item not in the monitors set of global item");
        }
        this._items.splice(idx, 1);

        if (Strut.hasStrut(item.strut)) {
            this._monitors.owm.ewmh.updateWorkarea();
        }

        // relayout workspace
        if (this._workspace) {
            this._workspace.relayout();
        }
    }

    findItemByPosition(x: number, y: number, itemType: ContainerItemType): ContainerItem | undefined {
        if (this._workspace)
            return this._workspace.findItemByPosition(x, y, itemType);
        return undefined;
    }
}

export class Monitors
{
    private _monitors: Map<string, Monitor>;
    private _owm: OWMLib;

    constructor(owm: OWMLib) {
        this._owm = owm;
        this._monitors = new Map<string, Monitor>();
    }

    get owm() {
        return this._owm;
    }

    get all() {
        return this._monitors.values();
    }

    monitorByPosition(x: number, y: number): Monitor {
        let first: Monitor | undefined;
        for (const [key, monitor] of this._monitors) {
            if (!first)
                first = monitor;
            if (x >= monitor.screen.x
                && x <= monitor.screen.x + monitor.screen.width
                && y >= monitor.screen.y
                && y <= monitor.screen.y + monitor.screen.height) {
                return monitor;
            }
        }
        if (!first)
            throw new Error(`No monitor matching x/y ${x}/${y}`);
        return first;
    }

    monitorByContainerItem(item: ContainerItem) {
        const { x, y } = item.geometry.center;
        return this.monitorByPosition(x, y);
    }

    monitorByOutput(name: string) {
        return this._monitors.get(name);
    }

    removeItem(item: ContainerItem) {
        for (const [key, monitor] of this._monitors) {
            monitor.workspaces.removeItem(item);
        }
    }

    relayout() {
        for (const [key, monitor] of this._monitors) {
            monitor.workspaces.relayout();
        }
    }

    forEachWorkspace(run: (ws: Workspace) => boolean) {
        for (const [key, monitor] of this._monitors) {
            if (!monitor.workspaces.forEachWorkspace(run))
                return false;
        }
        return true;
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

    update(screens: XCB.Screen[]) {
        const newMonitors = new Map<string, Monitor>();
        const oldMonitors = new Map<string, Monitor>(this._monitors);

        for (const screen of screens) {
            let found = false;
            const outputs = screen.outputs;
            if (!outputs.length)
                continue;
            for (const output of outputs) {
                const monitor = this._monitors.get(output);
                if (monitor) {
                    found = true;
                    for (const output2 of outputs) {
                        oldMonitors.delete(output2);
                    }

                    // update workspaces on this monitor
                    monitor.screen = screen;
                    break;
                }
            }

            if (!found) {
                const monitor = new Monitor(this, screen);
                for (const output of outputs) {
                    newMonitors.set(output, monitor);
                }
            }
        }

        // delete oldMonitors from current map
        for (const [key, monitor] of oldMonitors) {
            this._monitors.delete(key);
        }

        this._monitors = new Map<string, Monitor>([...this._monitors, ...newMonitors]);
        this._owm.events.emit("monitors", { added: newMonitors, deleted: oldMonitors, modified: this._monitors });
    }
}
