import { Client } from "../../owm";
import { Policy } from "..";

export interface LayoutPolicy
{
    clientAdded(client: Client): void;
    clientRemoved(client: Client): void;
    clientGeometryChanged(client: Client): void;
    adopt(policy: Policy): void;
    relayout(): void;
}
