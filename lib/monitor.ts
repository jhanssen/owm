import { Workspace, Workspaces } from "./workspace";
import { OWMLib } from "./owm";
import { ContainerItem } from "./container";
import { XCB, OWM } from "native";

export class Monitor
{
    private _screen: XCB.Screen;
    private _workspaces: Workspaces;
    private _workspace: Workspace | undefined;
    private _monitors: Monitors;

    constructor(monitors: Monitors, screen: XCB.Screen) {
        this._screen = screen;
        this._monitors = monitors;
        this._workspaces = new Workspaces(monitors.owm, this);
    }

    get monitors() {
        return this._monitors;
    }

    get screen() {
        return this._screen;
    }

    set screen(screen: XCB.Screen) {
        this._screen = screen;
        this._workspaces.updateScreen();
    }

    get workspaces() {
        return this._workspaces;
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
        }
    }

    workspaceById(id: number): Workspace | undefined {
        return this._workspaces.workspaceById(id);
    }

    workspaceByName(name: string): Workspace | undefined {
        return this._workspaces.workspaceByName(name);
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
        for (const [key, monitor] of this._monitors) {
            if (x >= monitor.screen.x && x <= monitor.screen.x + monitor.screen.width &&
                y >= monitor.screen.y && y <= monitor.screen.y + monitor.screen.height) {
                return monitor;
            }
        }
        throw new Error(`No monitor matching x/y ${x}/${y}`);
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

        this._owm.events.emit("monitors", { added: newMonitors, deleted: oldMonitors, modified: this._monitors });
        this._monitors = new Map<string, Monitor>([...this._monitors, ...newMonitors]);
    }
}
