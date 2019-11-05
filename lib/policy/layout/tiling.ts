import { Client } from "../../client";
import { Logger } from "../../logger";
import { LayoutPolicy } from ".";
import { Policy } from "..";

export class TilingLayoutPolicy implements LayoutPolicy
{
    private _policy: Policy | undefined;
    private _log: Logger;
    private _type: string;

    constructor() {
        this._type = "TilingLayout";
        this._log = Logger.dummy();
    }

    setPolicy(policy: Policy | undefined) {
        if (!policy) {
            this._log = Logger.dummy();
        } else {
            this._log = policy.owm.logger.prefixed("TilingLayout");
        }
        this._policy = policy;
    }

    clientAdded(client: Client) {
        this._log.info("client added");
    }

    clientRemoved(client: Client) {
    }

    clientGeometryChanged(client: Client) {
    }

    adopt(policy: Policy) {
    }

    relayout() {
    }
}

export function isTilingLayout(o: any): o is TilingLayoutPolicy {
    return o._type === "TilingLayout";
}
