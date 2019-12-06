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
    isRelated(other: ContainerItem): boolean;
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

    public readonly LayoutPosition = Container.LayoutPosition;

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
        if (this._staysOnTop === s)
            return;
        this._staysOnTop = s;
        if (this._container) {
            this._container.reinsert(this);
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

    reinsert(item: ContainerItem) {
        if (item.ignoreWorkspace) {
            throw new Error("item ignores workspaces");
        }
        if (this._layoutItems.indexOf(item) === -1) {
            throw new Error("item doesn't exist");
        }
        const stackList = this._stackListForItem(item);
        if (stackList === undefined) {
            throw new Error("item is not in a stack list");
        }
        const idx = stackList.indexOf(item);
        if (idx === -1) {
            throw new Error("item is really not in the stack list");
        }

        if (item.fullscreen
            && this._containerType === Container.Type.TopLevel
            && this._fullscreenItem === undefined) {
            this._fullscreenItem = item;
        }

        stackList.splice(idx, 1);

        if (item.staysOnTop) {
            this._ontopItems.push(item);
        } else {
            this._regularItems.push(item);
        }

        this.circulateToTop(item);
        this.relayout();
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
                // ### we should use the parent items here instead
                // of the global items if we're a child container
                const globalItems = this._monitor.items;
                if (globalItems.length > 0) {
                    if (item === this._fullscreenItem) {
                        globalItems[0].lower(item);
                    } else {
                        globalItems[0].raise(item);
                    }
                    for (let i = 1; i < globalItems.length; ++i) {
                        globalItems[i].raise(globalItems[i - 1]);
                    }
                }
            }
            return;
        }

        const regularItems = this._regularItems.slice(0);
        const ontopItems = this._ontopItems.slice(0);

        // first, restack all items that are not related to our item
        let lastRegularNonRelated = -1;
        for (let nidx = 0; nidx < regularItems.length; ++nidx) {
            if (!item.isRelated(regularItems[nidx])) {
                if (lastRegularNonRelated === -1) {
                    lastRegularNonRelated = nidx;
                } else {
                    regularItems[nidx].raise(regularItems[lastRegularNonRelated]);
                    lastRegularNonRelated = nidx;
                }
            }
        }
        let firstOnTopNonRelated = -1, lastOnTopNonRelated = -1;
        for (let nidx = 0; nidx < ontopItems.length; ++nidx) {
            if (!item.isRelated(ontopItems[nidx])) {
                if (lastOnTopNonRelated === -1) {
                    firstOnTopNonRelated = nidx;
                    lastOnTopNonRelated = nidx;
                    if (lastRegularNonRelated !== -1) {
                        ontopItems[nidx].raise(regularItems[lastRegularNonRelated]);
                    }
                } else {
                    ontopItems[nidx].raise(ontopItems[lastOnTopNonRelated]);
                    lastOnTopNonRelated = nidx;
                }
            }
        }

        // now go through our related items that are not us and restack those
        let lastRegularRelated = -1;
        for (let nidx = 0; nidx < regularItems.length; ++nidx) {
            if (item.isRelated(regularItems[nidx]) && item !== regularItems[nidx]) {
                if (lastRegularRelated === -1) {
                    lastRegularRelated = nidx;
                    if (lastRegularNonRelated !== -1) {
                        regularItems[nidx].raise(regularItems[lastRegularNonRelated]);
                    }
                } else {
                    regularItems[nidx].raise(regularItems[lastRegularRelated]);
                    lastRegularRelated = nidx;
                }
            }
        }
        let firstOnTopRelated = -1, lastOnTopRelated = -1;
        for (let nidx = 0; nidx < ontopItems.length; ++nidx) {
            if (item.isRelated(regularItems[nidx]) && item !== regularItems[nidx]) {
                if (lastOnTopRelated === -1) {
                    firstOnTopRelated = nidx;
                    lastOnTopRelated = nidx;
                    if (lastOnTopNonRelated !== -1) {
                        ontopItems[nidx].raise(ontopItems[lastOnTopNonRelated]);
                    } else if (lastRegularRelated !== -1) {
                        ontopItems[nidx].raise(regularItems[lastRegularRelated]);
                    } else if (lastRegularNonRelated !== -1) {
                        ontopItems[nidx].raise(regularItems[lastRegularNonRelated]);
                    }
                } else {
                    ontopItems[nidx].raise(ontopItems[lastOnTopRelated]);
                    lastOnTopRelated = nidx;
                }
            }
        }

        // raise our item
        if (stackList === this._regularItems) {
            if (lastRegularRelated !== -1) {
                item.raise(regularItems[lastRegularRelated]);
            } else if (lastRegularNonRelated !== -1) {
                item.raise(regularItems[lastRegularNonRelated]);
            } else if (firstOnTopRelated !== -1 && firstOnTopNonRelated !== -1) {
                item.lower(ontopItems[Math.min(firstOnTopRelated, firstOnTopNonRelated)]);
            } else if (firstOnTopRelated !== -1) {
                item.lower(ontopItems[firstOnTopRelated]);
            } else if (firstOnTopNonRelated !== -1) {
                item.lower(ontopItems[firstOnTopNonRelated]);
            } else {
                // this shouldn't happen, we should have bailed out earlier if it could
                throw new Error("Can't restack item, no related or non-related item exist");
            }
        } else if (stackList === this._ontopItems) {
            if (lastOnTopRelated !== -1) {
                item.raise(ontopItems[lastOnTopRelated]);
            } else if (lastOnTopNonRelated !== -1) {
                item.raise(ontopItems[lastOnTopNonRelated]);
            } else if (lastRegularRelated !== -1 || lastRegularNonRelated !== -1) {
                item.raise(regularItems[Math.max(lastRegularRelated, lastRegularNonRelated)]);
            } else {
                // this shouldn't happen, we should have bailed out earlier if it could
                throw new Error("Can't restack item, no related or non-related item exist");
            }
        }

        // find the highest-most item that is not the fullscreen item
        let topItem: ContainerItem | undefined = undefined;
        for (let idx = this._ontopItems.length - 1; idx >= 0; --idx) {
            if (this._ontopItems[idx] !== this._fullscreenItem) {
                topItem = this._ontopItems[idx];
                break;
            }
        }
        if (topItem === undefined) {
            if (this._regularItems.length === 0) {
                // can't happen
                throw new Error("no top item and regular item list is empty");
            }
            for (let idx = this._regularItems.length - 1; idx >= 0; --idx) {
                if (this._regularItems[idx] !== this._fullscreenItem) {
                    topItem = this._regularItems[idx];
                    break;
                }
            }
            if (topItem === undefined) {
                // can't happen either
                throw new Error("no top item to be found");
            }
        }

        // raise our full screen item if we have one
        if (this._fullscreenItem) {
            this._fullscreenItem.raise(topItem);
            topItem = this._fullscreenItem;
        }

        // raise our global items, unless the top item is the full screen client in which case we'll lower them
        if (this._monitor) {
            const globalItems = this._monitor.items;
            if (globalItems.length > 0) {
                if (topItem === this._fullscreenItem) {
                    globalItems[0].lower(topItem);
                } else {
                    globalItems[0].raise(topItem);
                }
                for (let i = 1; i < globalItems.length; ++i) {
                    globalItems[i].raise(globalItems[i - 1]);
                }
            }
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
        if (allItems.length === 1) {
            // make sure we respect our global items
            const item = allItems[0];
            if (this._monitor) {
                const globalItems = this._monitor.items;
                if (globalItems.length > 0) {
                    if (item === this._fullscreenItem) {
                        globalItems[0].lower(item);
                    } else {
                        globalItems[0].raise(item);
                    }
                    for (let i = 1; i < globalItems.length; ++i) {
                        globalItems[i].raise(globalItems[i - 1]);
                    }
                }
            }
            return;
        }

        const regularItems = this._regularItems.slice(0);
        const ontopItems = this._ontopItems.slice(0);

        // first, restack all items that are related to our item
        let firstRegularRelated = -1, lastRegularRelated = -1;
        for (let nidx = 0; nidx < regularItems.length; ++nidx) {
            if (item.isRelated(regularItems[nidx]) && item !== regularItems[nidx]) {
                if (lastRegularRelated === -1) {
                    firstRegularRelated = nidx;
                    lastRegularRelated = nidx;
                } else {
                    regularItems[nidx].raise(regularItems[lastRegularRelated]);
                    lastRegularRelated = nidx;
                }
            }
        }
        let firstOnTopRelated = -1, lastOnTopRelated = -1;
        for (let nidx = 0; nidx < ontopItems.length; ++nidx) {
            if (item.isRelated(regularItems[nidx]) && item !== regularItems[nidx]) {
                if (lastOnTopRelated === -1) {
                    firstOnTopRelated = nidx;
                    lastOnTopRelated = nidx;
                    if (lastRegularRelated !== -1) {
                        ontopItems[nidx].raise(regularItems[lastRegularRelated]);
                    }
                } else {
                    ontopItems[nidx].raise(ontopItems[lastOnTopRelated]);
                    lastOnTopRelated = nidx;
                }
            }
        }

        // now go through our non-related items that are not us and restack those
        let firstRegularNonRelated = -1, lastRegularNonRelated = -1;
        for (let nidx = 0; nidx < regularItems.length; ++nidx) {
            if (!item.isRelated(regularItems[nidx])) {
                if (lastRegularNonRelated === -1) {
                    firstRegularNonRelated = nidx;
                    lastRegularNonRelated = nidx;
                    if (lastRegularRelated !== -1) {
                        regularItems[nidx].raise(regularItems[lastRegularRelated]);
                    }
                } else {
                    regularItems[nidx].raise(regularItems[lastRegularNonRelated]);
                    lastRegularNonRelated = nidx;
                }
            }
        }
        let firstOnTopNonRelated = -1, lastOnTopNonRelated = -1;
        for (let nidx = 0; nidx < ontopItems.length; ++nidx) {
            if (!item.isRelated(ontopItems[nidx])) {
                if (lastOnTopNonRelated === -1) {
                    firstOnTopNonRelated = nidx;
                    lastOnTopNonRelated = nidx;
                    if (lastOnTopRelated !== -1) {
                        ontopItems[nidx].raise(ontopItems[lastOnTopRelated]);
                    } else if (lastRegularNonRelated !== -1) {
                        ontopItems[nidx].raise(regularItems[lastRegularNonRelated]);
                    } else if (lastRegularRelated !== -1) {
                        ontopItems[nidx].raise(regularItems[lastRegularRelated]);
                    }
                } else {
                    ontopItems[nidx].raise(ontopItems[lastOnTopNonRelated]);
                    lastOnTopNonRelated = nidx;
                }
            }
        }

        // lower our item
        if (stackList === this._regularItems) {
            if (firstRegularRelated !== -1) {
                item.lower(regularItems[firstRegularRelated]);
            } else if (firstRegularNonRelated !== -1) {
                item.lower(regularItems[firstRegularNonRelated]);
            } else if (firstOnTopRelated !== -1 && firstOnTopNonRelated !== -1) {
                item.lower(ontopItems[Math.min(firstOnTopRelated, firstOnTopNonRelated)]);
            } else if (firstOnTopRelated !== -1) {
                item.lower(ontopItems[firstOnTopRelated]);
            } else if (firstOnTopNonRelated !== -1) {
                item.lower(ontopItems[firstOnTopNonRelated]);
            } else {
                // this shouldn't happen, we should have bailed out earlier if it could
                throw new Error("Can't restack item, no related or non-related item exist");
            }
        } else if (stackList === this._ontopItems) {
            if (firstOnTopRelated !== -1) {
                item.lower(ontopItems[firstOnTopRelated]);
            } else if (firstOnTopNonRelated !== -1) {
                item.lower(ontopItems[firstOnTopNonRelated]);
            } else if (lastRegularRelated !== -1 || lastRegularNonRelated !== -1) {
                item.raise(regularItems[Math.max(lastRegularRelated, lastRegularNonRelated)]);
            } else {
                // this shouldn't happen, we should have bailed out earlier if it could
                throw new Error("Can't restack item, no related or non-related item exist");
            }
        }

        // find the highest-most item that is not the fullscreen item
        let topItem: ContainerItem | undefined = undefined;
        for (let idx = this._ontopItems.length - 1; idx >= 0; --idx) {
            if (this._ontopItems[idx] !== this._fullscreenItem) {
                topItem = this._ontopItems[idx];
                break;
            }
        }
        if (topItem === undefined) {
            if (this._regularItems.length === 0) {
                // can't happen
                throw new Error("no top item and regular item list is empty");
            }
            for (let idx = this._regularItems.length - 1; idx >= 0; --idx) {
                if (this._regularItems[idx] !== this._fullscreenItem) {
                    topItem = this._regularItems[idx];
                    break;
                }
            }
            if (topItem === undefined) {
                // can't happen either
                throw new Error("no top item to be found");
            }
        }

        // raise our full screen item if we have one
        if (this._fullscreenItem) {
            this._fullscreenItem.raise(topItem);
            topItem = this._fullscreenItem;
        }

        // raise our global items, unless the top item is the full screen client in which case we'll lower them
        if (this._monitor) {
            const globalItems = this._monitor.items;
            if (globalItems.length > 0) {
                if (topItem === this._fullscreenItem) {
                    globalItems[0].lower(topItem);
                } else {
                    globalItems[0].raise(topItem);
                }
                for (let i = 1; i < globalItems.length; ++i) {
                    globalItems[i].raise(globalItems[i - 1]);
                }
            }
        }
    }

    notifyRaised(item: ContainerItem, sibling: ContainerItem) {
        const itemStackList = this._stackListForItem(item);
        const siblingStackList = this._stackListForItem(sibling);
        if (itemStackList === siblingStackList && itemStackList !== undefined) {
            let idx = itemStackList.indexOf(item);
            itemStackList.splice(idx, 1);
            idx = itemStackList.indexOf(sibling);
            itemStackList.splice(idx + 1, 0, item);
        } else if (itemStackList === this._regularItems) {
            const idx = itemStackList.indexOf(item);
            itemStackList.splice(idx, 1);
            itemStackList.push(item);
        } else if (itemStackList === this._ontopItems) {
            const idx = itemStackList.indexOf(item);
            itemStackList.splice(idx, 1);
            itemStackList.unshift(item);
        }
    }

    notifyLowered(item: ContainerItem, sibling: ContainerItem) {
        const itemStackList = this._stackListForItem(item);
        const siblingStackList = this._stackListForItem(sibling);
        if (itemStackList === siblingStackList && itemStackList !== undefined) {
            let idx = itemStackList.indexOf(item);
            itemStackList.splice(idx, 1);
            idx = itemStackList.indexOf(sibling);
            itemStackList.splice(idx, 0, item);
        } else if (itemStackList === this._regularItems) {
            const idx = itemStackList.indexOf(item);
            itemStackList.splice(idx, 1);
            itemStackList.push(item);
        } else if (itemStackList === this._ontopItems) {
            const idx = itemStackList.indexOf(item);
            itemStackList.splice(idx, 1);
            itemStackList.unshift(item);
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

    bringToTop(predicate: (item: ContainerItem) => boolean) {
        const items = this.stackItems;
        for (const item of items) {
            if (predicate(item)) {
                this.circulateToTop(item);
            }
        }
    }

    bringToBottom(predicate: (item: ContainerItem) => boolean) {
        const items = this.stackItems;
        for (const item of items) {
            if (predicate(item)) {
                this.circulateToBottom(item);
            }
        }
    }

    changeLayoutOrder(item: ContainerItem, position: Container.LayoutPosition, other?: ContainerItem) {
        if ((position === Container.LayoutPosition.Forward || position === Container.LayoutPosition.Backward)
            && other !== undefined) {
            throw new Error("can't have a relative container item with Forward/Backward position");
        }
        if (item === other) {
            throw new Error("item and other can't be the same item");
        }
        let idx = this._layoutItems.indexOf(item);
        if (idx === -1) {
            throw new Error("can't find item for changeLayoutOrder");
        }
        let otherIdx = -1;
        if (other !== undefined) {
            otherIdx = this._layoutItems.indexOf(item);
            if (otherIdx === -1) {
                throw new Error("can't find other for changeLayoutOrder");
            }
        }
        // take it out
        this._layoutItems.splice(idx, 1);
        if (otherIdx !== -1 && otherIdx > idx) {
            --otherIdx;
        }
        switch (position) {
        case Container.LayoutPosition.Front:
            // all the way to the front
            this._layoutItems.unshift(item);
            break;
        case Container.LayoutPosition.Back:
            // all the way to the back
            this._layoutItems.push(item);
            break;
        case Container.LayoutPosition.Forward:
            if (otherIdx !== -1) {
                // in front of otherIdx
                this._layoutItems.splice(otherIdx, 0, item);
            } else {
                // one step forward from current
                if (idx > 0)
                    --idx;
                this._layoutItems.splice(idx, 0, item);
            }
            break;
        case Container.LayoutPosition.Backward:
            if (otherIdx !== -1) {
                // in back of otherIdx
                this._layoutItems.splice(otherIdx + 1, 0, item);
            } else {
                this._layoutItems.splice(idx + 1, 0, item);
            }
        }

        this.relayout();
    }

    isRelated(other: ContainerItem): boolean {
        return this === other;
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
    export enum LayoutPosition {
        Front,
        Back,
        Forward,
        Backward
    }
}

export function isContainer(o: any): o is Container {
    return o._type && o._type === "Container";
}
