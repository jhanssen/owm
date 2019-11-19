import { ContainerItem } from "../../container";
import { Geometry } from "../../utils";
import { EventEmitter } from "events";

export interface LayoutConfig
{
    readonly events: EventEmitter;
    clone(): LayoutConfig;
}

export interface LayoutPolicy
{
    readonly events: EventEmitter;
    config: LayoutConfig;
    layout(items: ContainerItem[], geometry: Geometry): void;
    clone(): LayoutPolicy;
}
