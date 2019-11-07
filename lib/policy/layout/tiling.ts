import { Client } from "../../client";
import { Geometry } from "../../utils";
import { Logger } from "../../logger";
import { LayoutPolicy } from ".";
import { Policy } from "..";

export class TilingLayoutPolicy implements LayoutPolicy
{
    private _policy: Policy;
    private _log: Logger;
    private _type: string;

    constructor(policy: Policy) {
        this._type = "TilingLayout";
        this._policy = policy;
        this._log = policy.owm.logger.prefixed("TilingLayout");
    }

    layout(clients: Client[], geometry: Geometry) {
    }
}

export function isTilingLayout(o: any): o is TilingLayoutPolicy {
    return o._type === "TilingLayout";
}
