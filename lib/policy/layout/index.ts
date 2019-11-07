import { ContainerItem } from "../../container";
import { Geometry } from "../../utils";

export interface LayoutPolicy
{
    layout(items: ContainerItem[], geometry: Geometry): void;
}
