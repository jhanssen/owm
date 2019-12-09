import { ContainerItem } from "../../container";
import { Geometry } from "../../utils";

export interface LayoutConfig
{
    readonly type: string;
}

export interface LayoutPolicy
{
    readonly type: string;
    config: LayoutConfig;
    layout(items: ContainerItem[], geometry: Geometry): void;
}
