export namespace XCB {
    export namespace WindowTypes {
        export interface Attributes {
            readonly bit_gravity: number;
            readonly win_gravity: number;
            readonly map_state: number;
            readonly override_redirect: number;
            readonly all_event_masks: number;
            readonly your_event_mask: number;
            readonly do_not_propagate_mask: number;
        }

        export interface Geometry {
            readonly root: number;
            readonly border_width: number;
            readonly x: number;
            readonly y: number;
            readonly width: number;
            readonly height: number;
        }

        export interface SizeHints {
            readonly flags: number;
            readonly x: number;
            readonly y: number;
            readonly min_width: number;
            readonly min_height: number;
            readonly max_width: number;
            readonly max_height: number;
            readonly width_inc: number;
            readonly height_inc: number;
            readonly min_aspect_num: number;
            readonly min_aspect_den: number;
            readonly max_aspect_num: number;
            readonly max_aspect_den: number;
            readonly base_width: number;
            readonly base_height: number;
            readonly win_gravity: number;
        }

        export interface WMHints {
            readonly flags: number;
            readonly input: number;
            readonly initial_state: number;
            readonly icon_pixmap: number;
            readonly icon_window: number;
            readonly icon_x: number;
            readonly icon_y: number;
            readonly icon_mask: number;
            readonly window_group: number;
        }

        export interface WMClass {
            readonly instance_name: string;
            readonly class_name: string;
        }

        export interface EWMHExtents {
            readonly left: number;
            readonly right: number;
            readonly top: number;
            readonly bottom: number;
        }

        export interface EWMHStrutPartial {
            readonly left: number;
            readonly right: number;
            readonly top: number;
            readonly bottom: number;
            readonly left_start_y: number;
            readonly left_end_y: number;
            readonly right_start_y: number;
            readonly right_end_y: number;
            readonly top_start_x: number;
            readonly top_end_x: number;
            readonly bottom_start_x: number;
            readonly bottom_end_x: number;
        }
    }

    export interface Window {
        readonly window: number;
        readonly attributes: WindowTypes.Attributes;
        readonly normalHints: WindowTypes.SizeHints;
        readonly wmHints: WindowTypes.WMHints;
        readonly wmClass: WindowTypes.WMClass;
        readonly wmName: string;
        readonly wmProtocols: number[];
        readonly ewmhState: number[];
        readonly ewmhWindowType: number[];
        readonly ewmhStrut: WindowTypes.EWMHExtents;
        readonly ewmhStrutPartial: WindowTypes.EWMHStrutPartial;
        readonly geometry: WindowTypes.Geometry;
    }

    export interface Screen {
        readonly name: string;
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly primary: boolean;
        readonly outputs: string[];
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

    export interface KeyPress {
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
        readonly sym: number;
        readonly is_modifier: number;
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

declare type XCB_TypedArray =
    Int8Array |
    Uint8Array |
    Int16Array |
    Uint16Array |
    Int32Array |
    Uint32Array;

declare type XCB_Type =
    XCB.ButtonPress |
    XCB.MotionNotify |
    XCB.KeyPress |
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


declare interface Rectangle {
    readonly x?: number;
    readonly y?: number;
    readonly width: number;
    readonly height: number;
}

declare interface ConfigureWindowArgs {
    readonly window: number;
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

declare interface ChangeWindowAttributesArgs {
    readonly window: number;
    readonly back_pixmap?: number;
    readonly back_pixel?: number;
    readonly border_pixmap?: number;
    readonly border_pixel?: number;
    readonly bit_gravity?: number;
    readonly win_gravity?: number;
    readonly backing_store?: number;
    readonly backing_planes?: number;
    readonly backing_pixel?: number;
    readonly override_redirect?: number;
    readonly save_under?: number;
    readonly event_mask?: number;
    readonly dont_propagate?: number;
    readonly colormap?: number;
    readonly cursor?: number;
}

declare interface SendClientMessageArgs {
    readonly window: number;
    readonly type: number;
    readonly data: ArrayBuffer | XCB_TypedArray;
}

declare interface SendExposeArgs {
    readonly window: number;
    readonly x?: number;
    readonly y?: number;
    readonly width: number;
    readonly height: number;
}

declare interface GCArgs {
    readonly function?: number;
    readonly plane_mask?: number;
    readonly foreground?: number;
    readonly background?: number;
    readonly line_width?: number;
    readonly line_style?: number;
    readonly cap_style?: number;
    readonly join_style?: number;
    readonly fill_style?: number;
    readonly fill_rule?: number;
    readonly tile?: number;
    readonly stipple?: number;
    readonly tile_stipple_origin_x?: number;
    readonly tile_stipple_origin_y?: number;
    readonly font?: number;
    readonly subwindow_mode?: number;
    readonly graphics_exposures?: number;
    readonly clip_origin_x?: number;
    readonly clip_origin_y?: number;
    readonly clip_mask?: number;
    readonly dash_offset?: number;
    readonly dash_list?: number;
    readonly arc_mode?: number;
}

declare interface CreateGCArgs {
    readonly window: number;
    readonly values: GCArgs;
}

declare interface ChangeGCArgs {
    readonly gc: number;
    readonly values: GCArgs;
}

declare interface ChangePropertyArgs {
    readonly window: number;
    readonly mode: number;
    readonly property: number;
    readonly type: number;
    readonly format: number;
    readonly data: ArrayBuffer | XCB_TypedArray;
}

declare interface SetInputFocusArgs {
    readonly window: number;
    readonly revert_to: number;
    readonly time?: number;
}

declare interface GrabKeyArgs {
    readonly window: number;
    readonly owner_events: number;
    readonly modifiers: number;
    readonly key: number;
    readonly pointer_mode: number;
    readonly keyboard_mode: number;
}

declare interface UngrabKeyArgs {
    readonly window: number;
    readonly modifiers: number;
    readonly key: number;
}

declare interface GrabKeyboardArgs {
    readonly window: number;
    readonly owner_events: number;
    readonly pointer_mode: number;
    readonly keyboard_mode: number;
    readonly time?: number;
}

declare interface AllowEventsArgs
{
    readonly mode: number;
    readonly time?: number;
}

declare interface ChangeSaveSetArgs
{
    readonly window: number;
    readonly mode: number;
}

declare interface PolyRectangleArgs
{
    readonly window: number;
    readonly gc: number;
    readonly rects: Rectangle | Rectangle[];
}

declare interface ICCCMEnums {
    readonly hint: {[key: string]: number};
    readonly sizeHint: {[key: string]: number};
    readonly state: {[key: string]: number};
}

declare interface EWMHEnums {
    readonly clientSourceType: {[key: string]: number};
    readonly desktopLayoutOrientation: {[key: string]: number};
    readonly desktopLayoutStartingCorner: {[key: string]: number};
    readonly moveResizeWindow: {[key: string]: number};
    readonly moveResizeDirection: {[key: string]: number};
    readonly state: {[key: string]: number};
}

export namespace OWM {
    export interface WM {}
    export interface XCB {
        readonly atom: {[key: string]: number};
        readonly event: {[key: string]: number};
        readonly eventMask: {[key: string]: number};
        readonly propMode: {[key: string]: number};
        readonly inputFocus: {[key: string]: number};
        readonly modMask: {[key: string]: number};
        readonly keyButtonMask: {[key: string]: number};
        readonly buttonMask: {[key: string]: number};
        readonly grabMode: {[key: string]: number};
        readonly grabStatus: {[key: string]: number};
        readonly allows: {[key: string]: number};
        readonly configWindow: {[key: string]: number};
        readonly stackMode: {[key: string]: number};
        readonly setMode: {[key: string]: number};
        readonly currentTime: number;
        readonly grabAny: number;
        readonly windowNone: number;
        readonly cursorNone: number;
        readonly none: number;
        readonly icccm: ICCCMEnums;
        readonly ewmh: EWMHEnums;
        intern_atom(name: string, onlyIfExists?: boolean): number;
        configure_window(wm: OWM.WM, args: ConfigureWindowArgs): void;
        change_window_attributes(wm: OWM.WM, args: ChangeWindowAttributesArgs): void;
        create_window(wm: OWM.WM, args: CreateWindowArgs): number;
        reparent_window(wm: OWM.WM, args: ReparentWindowArgs): void;
        change_property(wm: OWM.WM, args: ChangePropertyArgs): void;
        set_input_focus(wm: OWM.WM, args: SetInputFocusArgs): void;
        send_client_message(wm: OWM.WM, args: SendClientMessageArgs): void;
        send_expose(wm: OWM.WM, args: SendExposeArgs): void;
        create_gc(wm: OWM.WM, args: CreateGCArgs): number | undefined;
        change_gc(wm: OWM.WM, args: ChangeGCArgs): number | undefined;
        allow_events(wm: OWM.WM, args: AllowEventsArgs): void;
        change_save_set(wm: OWM.WM, args: ChangeSaveSetArgs): void;
        poly_fill_rectangle(wm: OWM.WM, args: PolyRectangleArgs): void;
        grab_key(wm: OWM.WM, args: GrabKeyArgs): void;
        ungrab_key(wm: OWM.WM, args: UngrabKeyArgs): void;
        grab_keyboard(wm: OWM.WM, args: GrabKeyboardArgs): void;
        ungrab_keyboard(wm: OWM.WM, time?: number): void;
        key_symbols_get_keycode(wm: OWM.WM, sym: number): number[];
        map_window(wm: OWM.WM, window: number): void;
        unmap_window(wm: OWM.WM, window: number): void;
        destroy_window(wm: OWM.WM, window: number): void;
        request_window_information(wm: OWM.WM, window: number): XCB.Window | undefined;
        free_gc(wm: OWM.WM, gc: number): void;
        flush(wm: OWM.WM): void;
    }
    export interface XKB {
        keysym_from_name(key: string): number | undefined;
    }
    export interface Screens {
        readonly root: number;
        readonly entries: XCB.Screen[];
    }
    export interface Event {
        readonly type: string;
        readonly windows?: XCB.Window[];
        readonly screens?: Screens;
        readonly xcb?: XCB_Type;
        readonly xkb?: string;
    }
}

declare function nativeCallback(data: OWM.Event): void;

declare namespace Native
{
    export function start(callback: typeof nativeCallback, display?: string): Promise<{ readonly wm: OWM.WM,
                                                                                        readonly xcb: OWM.XCB
                                                                                        readonly xkb: OWM.XKB }>;
    export function stop(): void;
}

export default Native;
