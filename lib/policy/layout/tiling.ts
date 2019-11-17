import { ContainerItem } from "../../container";
import { Geometry } from "../../utils";
import { Logger } from "../../logger";
import { LayoutPolicy, LayoutConfig } from ".";
import { Policy } from "..";

export class TilingLayoutConfig implements LayoutConfig
{
    private _type: string;

    public rows: number | undefined;
    public columns: number | undefined;

    constructor() {
        this._type = "TilingLayoutConfig";
        this.columns = undefined;
        this.rows = 1;
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

    constructor(policy: Policy) {
        this._type = "TilingLayout";
        this._policy = policy;
        this._cfg = new TilingLayoutConfig();
        this._log = policy.owm.logger.prefixed("TilingLayout");
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

        const setItemGeometry = (no: number, x: number, y: number) => {
            if (no >= filtered.length)
                return;
            const item = filtered[no];
            item.move(x, y);
            item.resize(wper, hper);
        };

        this._log.info("calculated", rows, columns, wper, hper, geometry);

        let y = geometry.y;
        for (let row = 0; row < rows; ++row) {
            let x = geometry.x;
            for (let column = 0; column < columns; ++column) {
                setItemGeometry(itemno++, x, y);
                x += wper;
            }
            y += hper;
        }
    }

    setConfig(config: LayoutConfig) {
        if (!isTilingLayoutConfig(config)) {
            throw new Error("Config needs to be a TilingLayoutConfig");
        }
        this._cfg = config as TilingLayoutConfig;
    }
}

export function isTilingLayout(o: any): o is TilingLayoutPolicy {
    return o._type === "TilingLayout";
}
