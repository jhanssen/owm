import { Client } from "../../client";
import { Policy } from "..";

export interface LayoutPolicy
{
    clientAdded(client: Client): void;
    clientRemoved(client: Client): void;
    clientGeometryChanged(client: Client): void;
    adopt(policy: Policy): void;
    setPolicy(policy: Policy): void;
    relayout(): void;
}
