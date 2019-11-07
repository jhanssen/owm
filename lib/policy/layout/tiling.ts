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
        const rows = this._cfg.rows || 1;
        const columns = this._cfg.columns || (items.length / rows);

        const wper = geometry.width / columns;
        const hper = geometry.height / rows;

        let itemno = 0;

        const setItemGeometry = (no: number, x: number, y: number) => {
            if (no >= items.length)
                return;
            const item = items[no];
            item.move(x, y);
            item.resize(wper, hper);
        };

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
