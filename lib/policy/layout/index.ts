import { Client } from "../../client";
import { Geometry } from "../../utils";

export interface LayoutPolicy
{
    layout(clients: Client[], geometry: Geometry): void;
}
