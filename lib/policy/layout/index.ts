import { ContainerItem } from "../../container";
import { Geometry } from "../../utils";
import { EventEmitter } from "events";

export interface LayoutConfig
{
    readonly events: EventEmitter;
}

export interface LayoutPolicy
{
    readonly events: EventEmitter;
    layout(items: ContainerItem[], geometry: Geometry): void;
    setConfig(config: LayoutConfig): void;
}
