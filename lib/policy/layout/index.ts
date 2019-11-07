import { ContainerItem } from "../../container";
import { Geometry } from "../../utils";

export interface LayoutConfig
{
}

export interface LayoutPolicy
{
    layout(items: ContainerItem[], geometry: Geometry): void;
    setConfig(config: LayoutConfig): void;
}
