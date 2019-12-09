import { ContainerItem } from "../../container";
import { Geometry } from "../../utils";
import { Logger } from "../../logger";
import { Client } from "../../client";
import { LayoutPolicy, LayoutConfig } from ".";
import { Policy } from "..";

export class StackingLayoutConfig implements LayoutConfig
{
    private _type: string;

    constructor() {
        this._type = "stacking";
    }

    get type() {
        return this._type;
    }
}

function isStackingLayoutConfig(o: any): o is StackingLayoutConfig {
    return o._type === "stacking";
}

export class StackingLayoutPolicy implements LayoutPolicy
{
    readonly Config = StackingLayoutConfig;

    private _policy: Policy;
    private _log: Logger;
    private _type: string;
    private _cfg: StackingLayoutConfig;

    constructor(policy: Policy, cfg: LayoutConfig) {
        if (!isStackingLayoutConfig(cfg)) {
            throw new Error("Config needs to be a StackingLayoutConfig");
        }

        this._type = "stacking";
        this._policy = policy;
        this._log = policy.owm.logger.prefixed("StackingLayout");
        this._cfg = cfg as StackingLayoutConfig;
    }

    get type() {
        return this._type;
    }

    get config() {
        return this._cfg as LayoutConfig;
    }

    set config(cfg: LayoutConfig) {
        if (!isStackingLayoutConfig(cfg)) {
            throw new Error("Config needs to be a StackingLayoutConfig");
        }
        this._cfg = cfg as StackingLayoutConfig;
    }

    layout(items: ContainerItem[], geometry: Geometry) {
        const filtered = items.filter((item: ContainerItem) => {
            return item.fullscreen || (!item.floating && !item.ignoreWorkspace);
        });

        if (filtered.length === 0) {
            // nothing to lay out
            return;
        }

        if (filtered.length === 1 && filtered[0].fullscreen) {
            const item = filtered[0];
            item.move(geometry.x, geometry.y);
            item.resize(geometry.width, geometry.height);
            return;
        }

        // top item gets it all
        const item = filtered[filtered.length - 1];
        item.raiseWithFloating();
        item.move(geometry.x, geometry.y);
        item.resize(geometry.width, geometry.height);
    }


    initialize() {
    }

    deinitialize() {
    }
}

export function isStackingLayout(o: any): o is StackingLayoutPolicy {
    return o._type === "stacking";
}
