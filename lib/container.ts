import { OWMLib } from "./owm";
import { Logger } from "./logger";
import { LayoutPolicy } from "./policy/layout";
import { Geometry, Strut } from "./utils";
import { Workspace } from "./workspace";
import { Monitor } from "./monitor";

export interface ContainerItem
{
    move(x: number, y: number): void;
    resize(width: number, height: number): void;
    raise(sibling: ContainerItem | undefined): void;
    lower(sibling: ContainerItem | undefined): void;
    readonly geometry: Geometry;
    readonly strut: Strut;
    workspace: Workspace | undefined;
    container: Container | undefined;
    visible: boolean;
    floating: boolean;
    ignoreWorkspace: boolean;
    staysOnTop: boolean;
}

export class Container implements ContainerItem
{
    private _owm: OWMLib;
    private _items: ContainerItem[];
    private _layout: LayoutPolicy;
    private _monitor: Monitor | undefined;
    private _geometry: Geometry;
    private _log: Logger;
    private _type: string;
    private _workspace: Workspace | undefined;
    private _container: Container | undefined;
    private _visible: boolean;
    private _floating: boolean;
    private _staysOnTop: boolean;
    private _ignoreWorkspace: boolean;
    private _containerType: Container.Type;

    constructor(owm: OWMLib, containerType: Container.Type, monitor?: Monitor) {
        this._owm = owm;
        this._items = [];
        this._layout = owm.policy.layout;
        this._monitor = monitor;
        if (monitor) {
            this._geometry = new Geometry(monitor.screen);
        } else {
            this._geometry = new Geometry();
        }
        this._log = owm.logger.prefixed("Container");
        this._type = "Container";
        this._visible = false;
        this._floating = false;
        this._staysOnTop = false;
        this._ignoreWorkspace = false;
        this._containerType = containerType;
    }

    get layout() {
        return this._layout;
    }

    set layout(policy: LayoutPolicy) {
        this._layout = policy;
    }

    get monitor() {
        return this._monitor;
    }

    set monitor(monitor: Monitor | undefined) {
        this._monitor = monitor;
        if (monitor) {
            this._geometry = new Geometry(monitor.screen);
        }
        this.relayout();

        this._owm.ewmh.updateWorkarea();
    }

    get geometry() {
        if (this._containerType === Container.Type.TopLevel) {
            const s = this.strut;
            if (Strut.hasStrut(s)) {
                const geom = new Geometry(this._geometry);
                geom.x += s.left;
                geom.width -= (s.left + s.right);
                geom.y += s.top;
                geom.height -= (s.top + s.bottom);
                return geom;
            }
        }
        return this._geometry;
    }

    set geometry(g: Geometry) {
        this.move(g.x, g.y);
        this.resize(g.width, g.height);
    }

    get strut() {
        const strut = new Strut();
        for (let item of this._items) {
            strut.unite(item.strut);
        }
        if (this._monitor) {
            for (let item of this._monitor.items) {
                strut.unite(item.strut);
            }
        }
        return strut;
    }

    get workspace() {
        return this._workspace;
    }

    set workspace(ws: Workspace | undefined) {
        this._workspace = ws;
    }

    get container() {
        return this._container;
    }

    set container(ws: Container | undefined) {
        this._container = ws;
    }

    get floating() {
        return this._floating;
    }

    set floating(s: boolean) {
        this._floating = s;
        this.relayout();
    }

    get staysOnTop() {
        return this._staysOnTop;
    }

    set staysOnTop(s: boolean) {
        this._staysOnTop = s;
        if (this._container) {
            this._container.circulateToTop(this);
        }
    }

    get ignoreWorkspace() {
        return this._ignoreWorkspace;
    }

    set ignoreWorkspace(ignore: boolean) {
        this._ignoreWorkspace = ignore;
        this.relayout();
    }

    get visible() {
        return this._visible;
    }

    set visible(v: boolean) {
        this._visible = v;

        for (let item of this._items) {
            if (!item.ignoreWorkspace) {
                item.visible = v;
            }
        }
    }

    raise(sibling: ContainerItem | undefined) {
        for (const item of this._items) {
            item.raise(sibling);
        }
    }

    lower(sibling: ContainerItem | undefined) {
        for (const item of this._items) {
            item.lower(sibling);
        }
    }

    move(x: number, y: number) {
        const dx = x - this._geometry.x;
        const dy = y - this._geometry.y;

        for (const item of this._items) {
            item.move(item.geometry.x + dx, item.geometry.y + dy);
        }

        this._geometry.x = x;
        this._geometry.y = y;
    }

    resize(width: number, height: number) {
        this._geometry.width = width;
        this._geometry.height = height;

        this.relayout();
    }

    add(item: ContainerItem) {
        if (item.ignoreWorkspace) {
            throw new Error("item ignores workspaces");
        }
        if (this._items.indexOf(item) !== -1) {
            throw new Error("item already exists");
        }
        if (item.container) {
            throw new Error("item is already in a different container");
        }
        this._log.info("got new item");
        this._items.push(item)
        item.container = this;
        this.circulateToTop(item);
        this.relayout();

        item.visible = this._visible;
    }

    remove(item: ContainerItem) {
        if (item.container !== this) {
            throw new Error("item not in this container");
        }
        const idx = this._items.indexOf(item);
        if (idx === -1) {
            throw new Error("container doesn't contain this item");
        }

        item.container = undefined;
        this._items.splice(idx, 1);
        this.relayout();
    }

    circulateToTop(item: ContainerItem) {
        if (item.container !== this) {
            throw new Error("item not in this container");
        }
        const idx = this._items.indexOf(item);
        if (idx === -1) {
            throw new Error("container doesn't contain this item");
        }
        if (this._items.length === 1) {
            // nothing to do
            return;
        }

        // take the item out
        this._items.splice(idx, 1);

        if (item.staysOnTop) {
            // move to top of list
            this._items.push(item);
            item.raise(this._items[this._items.length - 2]);
        } else {
            // find the last of the non-staysontop items
            let found = -1;
            for (let i = 0; i < this._items.length; ++i) {
                if (this._items[i].staysOnTop) {
                    found = i;
                    break;
                }
            }
            if (found === -1) {
                this._items.push(item);
                item.raise(this._items[this._items.length - 2]);
            } else {
                this._items.splice(found, 0, item);
                if (found > 0) {
                    item.raise(this._items[found - 1]);
                } else {
                    // is this right?
                    item.lower(this._items[found + 1]);
                }
            }
        }
    }

    circulateToBottom(item: ContainerItem) {
        if (item.container !== this) {
            throw new Error("item not in this container");
        }
        const idx = this._items.indexOf(item);
        if (idx === -1) {
            throw new Error("container doesn't contain this item");
        }
        if (this._items.length === 1) {
            // nothing to do
            return;
        }

        // take the item out
        this._items.splice(idx, 1);

        if (!item.staysOnTop) {
            // move to bottom of list
            this._items.unshift(item);
            item.lower(this._items[1]);
        } else {
            // find the first of the staysontop items
            let found = -1;
            for (let i = 0; i < this._items.length; ++i) {
                if (this._items[i].staysOnTop) {
                    found = i;
                    break;
                }
            }
            if (found === -1) {
                // we're the only staysontop item so we're still at the very top
                this._items.push(item);
                item.raise(this._items[this._items.length - 2]);
            } else {
                this._items.splice(found, 0, item);
                item.lower(this._items[found + 1]);
            }
        }
    }

    relayout() {
        if (!this._layout)
            return;
        this._layout.layout(this._items, this.geometry);
    }
}

export namespace Container {
    export enum Type {
        TopLevel,
        Item
    }
}

export function isContainer(o: any): o is Container {
    return o._type === "Container";
}
