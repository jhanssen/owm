import { ContainerItem } from "../../container";
import { Geometry } from "../../utils";
import { Policy } from "..";

export interface LayoutConfig
{
    readonly type: string;
}

export interface LayoutPolicy
{
    readonly type: string;
    config: LayoutConfig;
    layout(items: ContainerItem[], geometry: Geometry): void;
    initialize(): void;
    deinitialize(): void;
}

export type LayoutPolicyConstructor = { new(policy: Policy, cfg: LayoutConfig): LayoutPolicy };
export type LayoutConfigConstructor = { new(): LayoutConfig };
