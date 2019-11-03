export namespace XCB {
    export interface Window {
        readonly window: number;
        readonly bit_gravity: number;
        readonly win_gravity: number;
        readonly map_state: number;
        readonly override_redirect: number;
        readonly all_event_masks: number;
        readonly your_event_mask: number;
        readonly do_not_propagate_mask: number;
        readonly root: number;
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly border_width: number;
    }

    export interface ButtonPress {
        readonly type: number;
        readonly detail: number;
        readonly time: number;
        readonly root_x: number;
        readonly root_y: number;
        readonly event_x: number;
        readonly event_y: number;
        readonly root: number;
        readonly event: number;
        readonly child: number;
        readonly state: number;
        readonly same_screen: number;
    }

    export interface MotionNotify {
        readonly type: number;
        readonly detail: number;
        readonly time: number;
        readonly root_x: number;
        readonly root_y: number;
        readonly event_x: number;
        readonly event_y: number;
        readonly root: number;
        readonly event: number;
        readonly child: number;
        readonly state: number;
        readonly same_screen: number;
    }

    export interface EnterNotify {
        readonly type: number;
        readonly detail: number;
        readonly time: number;
        readonly root_x: number;
        readonly root_y: number;
        readonly event_x: number;
        readonly event_y: number;
        readonly root: number;
        readonly event: number;
        readonly child: number;
        readonly state: number;
        readonly mode: number;
        readonly same_screen_focus: number;
    }

    export interface FocusIn {
        readonly type: number;
        readonly detail: number;
        readonly event: number;
        readonly mode: number;
    }

    export interface MapRequest {
        readonly type: number;
        readonly parent: number;
        readonly window: number;
    }

    export interface UnmapNotify {
        readonly type: number;
        readonly event: number;
        readonly window: number;
        readonly from_configure: number;
    }

    export interface MapNotify {
        readonly type: number;
        readonly event: number;
        readonly window: number;
        readonly override_redirect: number;
    }

    export interface KeymapNotify {
        readonly type: number;
        readonly keys: ArrayBuffer;
    }

    export interface Expose {
        readonly type: number;
        readonly window: number;
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly count: number;
    }

    export interface ReparentNotify {
        readonly type: number;
        readonly event: number;
        readonly window: number;
        readonly parent: number;
        readonly x: number;
        readonly y: number;
        readonly override_redirect: number;
    }

    export interface ConfigureNotify {
        readonly type: number;
        readonly event: number;
        readonly window: number;
        readonly above_sibling: number;
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly border_width: number;
        readonly override_redirect: number;
    }

    export interface ConfigureRequest {
        readonly type: number;
        readonly stack_mode: number;
        readonly window: number;
        readonly parent: number;
        readonly sibling: number;
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly border_width: number;
        readonly value_mask: number;
    }

    export interface GravityNotify {
        readonly type: number;
        readonly window: number;
        readonly event: number;
        readonly x: number;
        readonly y: number;
    }

    export interface ResizeRequest {
        readonly type: number;
        readonly window: number;
        readonly width: number;
        readonly height: number;
    }

    export interface CirculateNotify {
        readonly type: number;
        readonly window: number;
        readonly event: number;
        readonly place: number;
    }

    export interface PropertyNotify {
        readonly type: number;
        readonly window: number;
        readonly atom: number;
        readonly time: number;
        readonly state: number;
    }

    export interface ClientMessage {
        readonly type: number;
        readonly window: number;
        readonly format: number;
        readonly messageType: number;
        readonly data: ArrayBuffer;
    }
}

declare type XCB_Type =
    XCB.ButtonPress |
    XCB.MotionNotify |
    XCB.EnterNotify |
    XCB.FocusIn |
    XCB.KeymapNotify |
    XCB.Expose |
    XCB.UnmapNotify |
    XCB.MapRequest |
    XCB.MapNotify |
    XCB.ReparentNotify |
    XCB.ConfigureRequest |
    XCB.ConfigureNotify |
    XCB.GravityNotify |
    XCB.ResizeRequest |
    XCB.CirculateNotify |
    XCB.PropertyNotify |
    XCB.ClientMessage;


export interface Event {
    readonly type: string;
    readonly windows?: XCB.Window[];
    readonly xcb?: XCB_Type;
}

declare function owmCallback(data: Event) : void;

declare interface ConfigureWindowArgs {
    readonly x?: number;
    readonly y?: number;
    readonly width?: number;
    readonly height?: number;
    readonly border_width?: number;
    readonly sibling?: number;
    readonly stack_mode?: number;
}

declare interface CreateWindowArgs {
    readonly parent: number;
    readonly width: number;
    readonly height: number;
    readonly x?: number;
    readonly y?: number;
}

declare interface ReparentWindowArgs {
    readonly parent: number;
    readonly window: number;
    readonly x?: number;
    readonly y?: number;
}

declare interface WMData {}

declare interface XCBData {
    readonly atom: {[key: string]: number};
    readonly event: {[key: string]: number};
    intern_atom(name: string, onlyIfExists?: boolean): number;
    configure_window(wm: WMData, args: ConfigureWindowArgs): void;
    create_window(wm: WMData, args: CreateWindowArgs): number;
    reparent_window(wm: WMData, args: ReparentWindowArgs): void;
    map_window(wm: WMData, window: number): void;
    unmap_window(wm: WMData, window: number): void;
    flush(wm: WMData): void;
}

export interface Data
{
    readonly wm: WMData;
    readonly xcb: XCBData;
}

declare namespace OWM
{
    export function start(callback: typeof owmCallback, display?: string) : Promise<Data>;
    export function stop() : void;
}

export default OWM;
