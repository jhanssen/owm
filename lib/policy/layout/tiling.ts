import { Client } from "../../owm";
import { Logger } from "../../logger";
import { LayoutPolicy } from ".";
import { Policy } from "..";

export class TilingLayoutPolicy implements LayoutPolicy
{
    private _policy: Policy;
    private _direction: TilingLayoutPolicy.Direction;
    private _log: Logger;

    constructor(policy: Policy, direction: TilingLayoutPolicy.Direction) {
        this._policy = policy;
        this._direction = direction;
        this._log = policy.owm.logger.prefixed("TilingLayout");
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

export namespace TilingLayoutPolicy
{
    export enum Direction {
        Horizontal,
        Vertical
    }
}
