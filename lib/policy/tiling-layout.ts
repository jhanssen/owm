import { Client } from "../owm";
import { LayoutPolicy } from "./layout";
import { Policy } from ".";

export class TilingLayoutPolicy implements LayoutPolicy
{
    private _policy: Policy;

    constructor(policy: Policy) {
        this._policy = policy;
    }

    clientAdded(client: Client) {
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
