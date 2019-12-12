import { ContainerItem } from "../../container";
import { Geometry } from "../../utils";
import { Policy } from "..";
import { Workspace } from "../../workspace";

export interface LayoutConfig
{
    readonly type: string;
}

export interface LayoutPolicy
{
    readonly type: string;
    config: LayoutConfig;
    layout(items: ContainerItem[], geometry: Geometry): void;
    update(): void;
    initialize(): void;
    deinitialize(): void;
}

export type LayoutPolicyConstructor = { new(policy: Policy, ws: Workspace, cfg: LayoutConfig): LayoutPolicy };
export type LayoutConfigConstructor = { new(): LayoutConfig };
