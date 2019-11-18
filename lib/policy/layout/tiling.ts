import { ContainerItem } from "../../container";
import { Geometry } from "../../utils";
import { Logger } from "../../logger";
import { Client } from "../../client";
import { LayoutPolicy, LayoutConfig } from ".";
import { Policy } from "..";
import { EventEmitter } from "events";

export class TilingLayoutConfig implements LayoutConfig
{
    private _type: string;
    private _events: EventEmitter;

    private _rows: number | undefined;
    private _columns: number | undefined;

    private _rowRatios: Map<number, number>;
    private _columnRatios: Map<number, number>;

    constructor() {
        this._type = "TilingLayoutConfig";
        this._events = new EventEmitter();
        this._columns = undefined;
        this._rows = 1;

        this._rowRatios = new Map<number, number>();
        this._columnRatios = new Map<number, number>();
    }

    get events() {
        return this._events;
    }

    get rows() {
        return this._rows;
    }

    set rows(r: number | undefined) {
        this._rows = r;
        this._events.emit("changed");
    }

    get columns() {
        return this._columns;
    }

    set columns(c: number | undefined) {
        this._columns = c;
        this._events.emit("changed");
    }

    setColumRatio(c: number, ratio: number) {
        this._columnRatios.set(c, ratio);
        this._events.emit("changed");
    }

    columnRatio(c: number): number {
        const r = this._columnRatios.get(c);
        if (r === undefined)
            return 1;
        return r;
    }

    setRowRatio(c: number, ratio: number) {
        this._rowRatios.set(c, ratio);
        this._events.emit("changed");
    }

    rowRatio(c: number): number {
        const r = this._rowRatios.get(c);
        if (r === undefined)
            return 1;
        return r;
    }
}

function isTilingLayoutConfig(o: any): o is TilingLayoutConfig {
    return o._type === "TilingLayoutConfig";
}

export class TilingLayoutPolicy implements LayoutPolicy
{
    readonly Config = TilingLayoutConfig;

    private _policy: Policy;
    private _log: Logger;
    private _type: string;
    private _cfg: TilingLayoutConfig;
    private _events: EventEmitter;
    private _changedCallback: () => void;

    constructor(policy: Policy) {
        this._type = "TilingLayout";
        this._policy = policy;
        this._log = policy.owm.logger.prefixed("TilingLayout");
        this._cfg = new TilingLayoutConfig();
        this._events = new EventEmitter();
        this._changedCallback = this._configChanged.bind(this);
        this._cfg.events.on("changed", this._changedCallback);
    }

    get events() {
        return this._events;
    }

    layout(items: ContainerItem[], geometry: Geometry) {
        const filtered = items.filter((item: ContainerItem) => {
            return item.fullscreen || (!item.floating && !item.ignoreWorkspace);
        });

        if (filtered.length === 1 && filtered[0].fullscreen) {
            const item = filtered[0];
            item.move(geometry.x, geometry.y);
            item.resize(geometry.width, geometry.height);
            return;
        }

        let rows = 0, columns = 0;
        if (this._cfg.rows) {
            rows = this._cfg.rows;
            columns = this._cfg.columns || Math.ceil(filtered.length / rows);
        } else if (this._cfg.columns) {
            columns = this._cfg.columns;
            rows = this._cfg.rows || Math.ceil(filtered.length / columns);
        } else {
            rows = 1;
            columns = filtered.length;
        }

        const wper = geometry.width / columns;
        const hper = geometry.height / rows;

        let itemno = 0;

        const setItemGeometry = (no: number, x: number, y: number, w: number, h: number) => {
            if (no >= filtered.length)
                return;
            const item = filtered[no];
            item.move(x, y);
            item.resize(w, h);
        };

        this._log.info("calculated", rows, columns, wper, hper, geometry);

        let y = geometry.y;
        let h = hper;
        for (let row = 0; row < rows; ++row) {
            if (row === rows - 1) {
                // take up the remaining space
                h = (geometry.y + geometry.height) - y;
            }
            let x = geometry.x;
            let w = wper;
            for (let column = 0; column < columns; ++column) {
                if (column === columns - 1) {
                    // take up the remaining space
                    w = (geometry.x + geometry.width) - x;
                }
                setItemGeometry(itemno++, x, y, w * this._cfg.columnRatio(column), h * this._cfg.rowRatio(row));
                x += w * this._cfg.columnRatio(column);
            }
            y += h * this._cfg.rowRatio(row);
        }
    }

    setConfig(config: LayoutConfig) {
        if (!isTilingLayoutConfig(config)) {
            throw new Error("Config needs to be a TilingLayoutConfig");
        }
        // not sure about this
        this._cfg.events.removeListener("changed", this._changedCallback);
        this._cfg = config as TilingLayoutConfig;
        this._cfg.events.on("changed", this._changedCallback);
    }

    _configChanged() {
        this._events.emit("needsLayout");
    }
}

export function isTilingLayout(o: any): o is TilingLayoutPolicy {
    return o._type === "TilingLayout";
}
