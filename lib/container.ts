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
    raise(sibling?: ContainerItem): void;
    lower(sibling?: ContainerItem): void;
    readonly geometry: Geometry;
    readonly strut: Strut;
    readonly workspace: Workspace | undefined;
    container: Container | undefined;
    visible: boolean;
    floating: boolean;
    ignoreWorkspace: boolean;
    staysOnTop: boolean;
    readonly fullscreen: boolean;
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
    private _fullscreenItem: ContainerItem | undefined;
    private _visible: boolean;
    private _floating: boolean;
    private _staysOnTop: boolean;
    private _ignoreWorkspace: boolean;
    private _containerType: Container.Type;
    private _layoutCallback: () => void;

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

        this._layoutCallback = this._policyNeedsLayout.bind(this);
        this._layout.events.on("needsLayout", this._layoutCallback);
    }

    get layout() {
        return this._layout;
    }

    set layout(policy: LayoutPolicy) {
        this._layout.events.removeListener("needsLayout", this._layoutCallback);
        this._layout = policy;
        this._layout.events.on("needsLayout", this._layoutCallback);
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
        if (this._container) {
            return this._container.workspace;
        }
        return this._workspace;
    }

    set workspace(ws: Workspace | undefined) {
        if (this._containerType !== Container.Type.TopLevel) {
            throw new Error("Can only set workspace on top-level containers");
        }
        this._workspace = ws;
    }

    get container() {
        return this._container;
    }

    set container(ws: Container | undefined) {
        if (this._containerType === Container.Type.TopLevel) {
            throw new Error("Can't set parent container on top-level containers");
        }
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

    // a container may never be fullscreen on its own
    get fullscreen() {
        return false;
    }

    get fullscreenItem() {
        return this._fullscreenItem;
    }

    set fullscreenItem(item: ContainerItem | undefined) {
        if (this._containerType !== Container.Type.TopLevel) {
            throw new Error("only top-level containers may have a fullscreen item");
        }
        if (this._fullscreenItem === item)
            return;

        const old = this._fullscreenItem;
        this._fullscreenItem = item;

        if (old !== undefined) {
            this.circulateToTop(old);
        } else if (item !== undefined) {
            this.circulateToTop(item);
        }

        this.relayout();
    }

    raise(sibling?: ContainerItem) {
        for (const item of this._items) {
            item.raise(sibling);
        }
    }

    lower(sibling?: ContainerItem) {
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

        if (item.fullscreen
            && this._containerType === Container.Type.TopLevel
            && this._fullscreenItem === undefined) {
            this._fullscreenItem = item;
        }

        this._log.info("got new item");
        this._items.push(item);
        this.circulateToTop(item);
        this.relayout();

        item.visible = this._visible;

        if (Strut.hasStrut(item.strut)) {
            this._owm.ewmh.updateWorkarea();
        }
    }

    remove(item: ContainerItem) {
        if (item.container !== this) {
            throw new Error("item not in this container");
        }
        const idx = this._items.indexOf(item);
        if (idx === -1) {
            throw new Error("container doesn't contain this item");
        }

        if (item === this._fullscreenItem) {
            this._fullscreenItem = undefined;
        }

        this._items.splice(idx, 1);
        if (this._items.length > 0) {
            this.circulateToTop(this._items[this._items.length - 1]);
        }
        this.relayout();

        if (Strut.hasStrut(item.strut)) {
            this._owm.ewmh.updateWorkarea();
        }
    }

    circulateToTop(item: ContainerItem) {
        const idx = this._items.indexOf(item);
        if (idx === -1) {
            throw new Error("container doesn't contain this item");
        }
        if (this._items.length === 1) {
            // make sure we respect our global items
            const item = this._items[0];
            if (this._monitor) {
                const globalItems = this._monitor.items;
                if (globalItems.length > 0) {
                    if (this._fullscreenItem === item) {
                        item.raise(globalItems[globalItems.length - 1]);
                    } else {
                        item.lower(globalItems[0]);
                    }
                }
            }
            return;
        }

        // take the item out
        this._items.splice(idx, 1);

        // ### there's a bug here, this code won't work if we find a container as the item
        // we're supposed to be above or below. The reason for this is that client.lower / client.raise()
        // expects that the sibling is a client, but in this case it would be a container.

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

        // if we have a fullscreen item, make sure it stays on top
        if (this._fullscreenItem) {
            const full = this._fullscreenItem;

            if (this._monitor) {
                const globalItems = this._monitor.items;
                if (globalItems.length > 0) {
                    const sibling = globalItems[globalItems.length - 1];
                    if (full === sibling) {
                        throw new Error("full screen item is a global item?");
                    }
                    full.raise(sibling);
                    return;
                }
            }

            let idx = this._items.length;
            while (idx > 0 && this._items[idx - 1] === full)
                --idx;

            if (this._items[idx - 1] === full) {
                throw new Error("couldn't raise fullscreen item");
            }

            full.raise(this._items[idx - 1]);
        }
    }

    circulateToBottom(item: ContainerItem) {
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
        if (this._fullscreenItem) {
            // _geometry is the non-strutted geometry
            this._layout.layout([this._fullscreenItem], this._geometry);
        } else {
            this._layout.layout(this._items, this.geometry);
        }
    }

    private _policyNeedsLayout() {
        this.relayout();
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
