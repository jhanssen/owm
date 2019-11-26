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

export enum ContainerItemType
{
    Container,
    Client
}

export class Container implements ContainerItem
{
    private _owm: OWMLib;
    private _regularItems: ContainerItem[];
    private _ontopItems: ContainerItem[];
    private _layoutItems: ContainerItem[];
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
        this._regularItems = [];
        this._ontopItems = [];
        this._layoutItems = [];
        this._layout = owm.policy.layout.clone();
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

    get layoutPolicy() {
        return this._layout;
    }

    set layout(policy: LayoutPolicy) {
        this._layout.events.removeListener("needsLayout", this._layoutCallback);
        this._layout = policy;
        this._layout.events.on("needsLayout", this._layoutCallback);
    }

    get stackItems() {
        // we depend on the array returned from this being a copy (in bringToTop)
        return this._regularItems.concat(this._ontopItems);
    }

    get layoutItems() {
        return this._layoutItems;
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
        for (let item of this._layoutItems) {
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

        for (let item of this._layoutItems) {
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
        for (const item of this._layoutItems) {
            item.raise(sibling);
        }
    }

    lower(sibling?: ContainerItem) {
        for (const item of this._layoutItems) {
            item.lower(sibling);
        }
    }

    move(x: number, y: number) {
        const dx = x - this._geometry.x;
        const dy = y - this._geometry.y;

        for (const item of this._layoutItems) {
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
        if (this._layoutItems.indexOf(item) !== -1) {
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
        if (item.staysOnTop) {
            this._ontopItems.push(item);
        } else {
            this._regularItems.push(item);
        }
        this._layoutItems.push(item);
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
        const stackList = this._stackListForItem(item);
        if (stackList === undefined) {
            throw new Error("container doesn't contain this item (_stackListForItem)");
        }
        const iidx = stackList.indexOf(item);
        if (iidx === -1) {
            throw new Error("container doesn't contain this item (stackList)");
        }
        const lidx = this._layoutItems.indexOf(item);
        if (lidx === -1) {
            throw new Error("container doesn't contain this item (_layoutItems)");
        }
        stackList.splice(iidx, 1);
        this._layoutItems.splice(lidx, 1);

        if (item === this._fullscreenItem) {
            this._fullscreenItem = undefined;
        }

        this.relayout();

        if (Strut.hasStrut(item.strut)) {
            this._owm.ewmh.updateWorkarea();
        }
    }

    circulateToTop(item: ContainerItem) {
        this._log.info("circulating to top", item);
        const stackList = this._stackListForItem(item);
        if (stackList === undefined) {
            throw new Error("container doesn't contain this item");
        }
        const idx = stackList.indexOf(item);
        if (idx === -1) {
            throw new Error("container doesn't contain this item");
        }
        const allItems = this.stackItems;
        if (allItems.length === 1) {
            // make sure we respect our global items
            const item = allItems[0];
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

        // if we're already the top item, bail out
        if (idx === stackList.length - 1) {
            return;
        }

        // take the item out
        stackList.splice(idx, 1);

        // and put it back in
        stackList.push(item);

        if (stackList.length === 1) {
            // we know there's another item in the other array
            if (stackList === this._regularItems) {
                item.lower(this._ontopItems[0]);
            } else {
                item.raise(this._regularItems[this._regularItems.length - 1]);
            }
        } else {
            item.raise(stackList[stackList.length - 2]);
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

            this.circulateToTop(full);
        }
    }

    circulateToBottom(item: ContainerItem) {
        this._log.info("circulating to bottom", item);
        const stackList = this._stackListForItem(item);
        if (stackList === undefined) {
            throw new Error("container doesn't contain this item");
        }
        const idx = stackList.indexOf(item);
        if (idx === -1) {
            throw new Error("container doesn't contain this item");
        }
        const allItems = this.stackItems;
        if (allItems.length === 1 || item === this._fullscreenItem) {
            // nothing to do
            return;
        }

        // if we're already the bottom-most item, bail out
        if (idx === 0) {
            return;
        }

        // take the item out
        stackList.splice(idx, 1);

        // put it back in
        stackList.unshift(item);

        if (stackList.length === 1) {
            // we know there's another item in the other array
            if (stackList === this._regularItems) {
                item.lower(this._ontopItems[0]);
            } else {
                item.raise(this._regularItems[this._regularItems.length - 1]);
            }
        } else {
            item.lower(stackList[1]);
        }
    }

    relayout() {
        if (!this._layout)
            return;
        if (this._fullscreenItem) {
            // _geometry is the non-strutted geometry
            this._layout.layout([this._fullscreenItem], this._geometry);
        } else {
            this._layout.layout(this._layoutItems, this.geometry);
        }
    }

    findItemByPosition(x: number, y: number, itemType: ContainerItemType): ContainerItem | undefined {
        // walk items from the top-most item to the bottom-most one
        const allItems = this.stackItems;
        const len = allItems.length;
        if (len === 0)
            return itemType === ContainerItemType.Container ? this : undefined;
        for (let i = len - 1; i >= 0; --i) {
            const item = allItems[i];
            const geom = item.geometry;
            if (x >= geom.x
                && x <= geom.x + geom.width
                && y >= geom.y
                && y <= geom.y + geom.height) {
                if (isContainer(item)) {
                    return (item as Container).findItemByPosition(x, y, itemType);
                } else if (itemType === ContainerItemType.Client) {
                    return item;
                }
            }
        }
        // if we got to this point we're either out of luck (if itemType is Client)
        // or we want the current container (if itemType is Container)
        return itemType === ContainerItemType.Container ? this : undefined;
    }

    bringToTop(predicate: (client: ContainerItem) => boolean) {
        const items = this.stackItems;
        for (const item of items) {
            if (predicate(item)) {
                this.circulateToTop(item);
            }
        }
    }

    private _policyNeedsLayout() {
        this.relayout();
    }

    private _stackListForItem(item: ContainerItem) {
        if (this._regularItems.includes(item))
            return this._regularItems;
        if (this._ontopItems.includes(item))
            return this._ontopItems;
        return undefined;
    }
}

export namespace Container {
    export enum Type {
        TopLevel,
        Item
    }
}

export function isContainer(o: any): o is Container {
    return o._type && o._type === "Container";
}
