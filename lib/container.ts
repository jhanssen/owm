import { OWMLib } from "./owm";
import { Logger } from "./logger";
import { LayoutPolicy } from "./policy/layout";
import { Geometry } from "./utils";

export interface ContainerItem
{
    move(x: number, y: number): void;
    resize(width: number, height: number): void;
    readonly geometry: Geometry;
}

export class Container implements ContainerItem
{
    private _items: ContainerItem[];
    private _layout: LayoutPolicy;
    private _geometry: Geometry;
    private _log: Logger;
    private _type: string;

    constructor(owm: OWMLib, geom: Geometry = {} as Geometry) {
        this._items = [];
        this._layout = owm.policy.layout;
        this._geometry = geom;
        this._log = owm.logger.prefixed("Container");
        this._type = "Container";
    }

    get layout() {
        return this._layout;
    }

    get geometry() {
        return this._geometry;
    }

    set geometry(g: Geometry) {
        this.move(g.x, g.y);
        this.resize(g.width, g.height);
    }

    set layout(policy: LayoutPolicy) {
        this._layout = policy;
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
        if (this._items.indexOf(item) !== -1) {
            throw new Error("item already exists");
        }
        this._log.info("got new item");
        this._items.push(item)
        this.relayout();
    }

    remove(item: ContainerItem) {
        const idx = this._items.indexOf(item);
        if (idx === -1) {
            throw new Error("item doesn't exist");
        }
        this._items.splice(idx, 1);
        this.relayout();
    }

    relayout() {
        if (!this._layout)
            return;
        this._layout.layout(this._items, this._geometry);
    }
}

export function isContainer(o: any): o is Container {
    return o._type === "Container";
}
