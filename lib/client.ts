import { OWMLib } from "./owm";
import { Logger } from "./logger";
import { ContainerItem } from "./container";
import { Workspace } from "./workspace";
import { Container } from "./container";
import { Geometry, Strut } from "./utils";
import { endianness } from "os";
import { XCB } from "native";

interface ConfigureArgs {
    readonly window: number;
    readonly x?: number;
    readonly y?: number;
    readonly width?: number;
    readonly height?: number;
    readonly border_width?: number;
    readonly sibling?: number;
    readonly stack_mode?: number;
}

export class Client implements ContainerItem
{
    private readonly _parent: number;
    private readonly _window: XCB.Window;
    private readonly _owm: OWMLib;
    private _border: number;
    private _geometry: Geometry;
    private _frameGeometry: Geometry;
    private _floatingGeometry: Geometry;
    private _strut: Strut;
    private _noinput: boolean;
    private _staysOnTop: boolean;
    private _log: Logger;
    private _type: string;
    private _gc: number | undefined;
    private _pixel: number | undefined;
    private _prevPixel: number | undefined;
    private _state: Client.State;
    private _workspace: Workspace | undefined;
    private _container: Container | undefined;
    private _floating: boolean;
    private _ignoreWorkspace: boolean;
    private _group: ClientGroup;

    constructor(owm: OWMLib, parent: number, window: XCB.Window, border: number, group: ClientGroup) {
        this._owm = owm;
        this._parent = parent;
        this._window = window;
        this._border = border;
        this._geometry = new Geometry(window.geometry);
        this._floatingGeometry = new Geometry(window.geometry);
        this._frameGeometry = new Geometry({
            x: window.geometry.x - border,
            y: window.geometry.y - border,
            width: window.geometry.width + (border * 2),
            height: window.geometry.height + (border * 2)
        });
        this._staysOnTop = false;
        this._ignoreWorkspace = false;
        this._type = "Client";
        this._group = group;

        const monitors = owm.monitors;
        const monitor = monitors.monitorByPosition(window.geometry.x, window.geometry.y);

        if (Strut.hasStrut(window.ewmhStrutPartial)) {
            this._strut = new Strut(window.ewmhStrutPartial);
        } else {
            this._strut = new Strut(window.ewmhStrut);
            if (Strut.hasStrut(window.ewmhStrut)) {
                this._strut.fillPartial(monitor.screen);
            }
        }

        if (window.ewmhDesktop === 0xffffffff) {
            this._ignoreWorkspace = true;
            monitor.addItem(this);
        }

        if (window.ewmhState.includes(owm.xcb.atom._NET_WM_STATE_ABOVE)) {
            this._staysOnTop = true;
        }

        const dock = window.ewmhWindowType.includes(this._owm.xcb.atom._NET_WM_WINDOW_TYPE_DOCK);

        this._floating = dock;
        this._noinput = dock;
        if (window.wmHints.flags & owm.xcb.icccm.hint.INPUT)
            this._noinput = window.wmHints.input === 0;

        this._log = owm.logger.prefixed("Client");
        this._state = Client.State.Withdrawn;

        if (dock) {
            this.configure(Object.assign({ window: window.window }, this._geometry));
        }

        const borderData = new Uint32Array(4);
        borderData[0] = border;
        borderData[1] = border;
        borderData[2] = border;
        borderData[3] = border;
        owm.xcb.change_property(owm.wm, { window: window.window, mode: owm.xcb.propMode.REPLACE,
                                          property: owm.xcb.atom._NET_FRAME_EXTENTS, type: owm.xcb.atom.CARDINAL,
                                          format: 32, data: borderData });

        this._updateAllowed();
    }

    get root() {
        return this._window.geometry.root;
    }

    get window() {
        return this._window;
    }

    get noinput() {
        return this._noinput;
    }

    get modal() {
        return this._window.transientFor !== 0 && this._window.ewmhState.includes(this._owm.xcb.atom._NET_WM_STATE_MODAL);
    }

    get dock() {
        return this._window.ewmhWindowType.includes(this._owm.xcb.atom._NET_WM_WINDOW_TYPE_DOCK);
    }

    get strut() {
        return this._strut;
    }

    get geometry() {
        return this._geometry;
    }

    get frameGeometry() {
        return this._frameGeometry;
    }

    get border() {
        return this._border;
    }

    set border(value: number) {
        this._frameGeometry.width -= (this._border - value) * 2;
        this._frameGeometry.height -= (this._border - value) * 2;

        this._log.info("configuring6", this._window.window, this._frameGeometry);
        this._owm.xcb.configure_window(this._owm.wm, {
            window: this._parent,
            width: this._frameGeometry.width,
            height: this._frameGeometry.height
        });
        this._owm.xcb.configure_window(this._owm.wm, {
            window: this._window.window,
            x: value, y: value,
        });

        const borderData = new Uint32Array(4);
        borderData[0] = value;
        borderData[1] = value;
        borderData[2] = value;
        borderData[3] = value;
        this._owm.xcb.change_property(this._owm.wm, { window: this._window.window, mode: this._owm.xcb.propMode.REPLACE,
                                          property: this._owm.xcb.atom._NET_FRAME_EXTENTS, type: this._owm.xcb.atom.CARDINAL,
                                          format: 32, data: borderData });


        this._border = value;
        this._owm.relayout();
    }

    get frame() {
        return this._parent;
    }

    get framePixel() {
        return this._pixel;
    }

    set framePixel(p: number | undefined) {
        this._pixel = p;
    }

    get frameGC() {
        if (this._prevPixel !== this._pixel) {
            this._prevPixel = this._pixel;
            this._createGC();
        }
        return this._gc;
    }

    get frameWidth() {
        return this._frameGeometry.width;
    }

    get frameHeight() {
        return this._frameGeometry.height;
    }

    get state() {
        return this._state;
    }

    set state(state: Client.State) {
        const xcb = this._owm.xcb;

        // we'll change the WM_STATE property regardless of the current state
        const buf = new Uint32Array(2);
        switch (state) {
        case Client.State.Normal:
            buf[0] = xcb.icccm.state.NORMAL;
            break;
        case Client.State.Iconic:
            buf[0] = xcb.icccm.state.ICONIC;
            break;
        case Client.State.Withdrawn:
            buf[0] = xcb.icccm.state.WITHDRAWN;
            break;
        }

        buf[1] = xcb.none;
        xcb.change_property(this._owm.wm,
                            { window: this._window.window, mode: xcb.propMode.REPLACE,
                              property: xcb.atom.WM_STATE, type: xcb.atom.WM_STATE,
                              format: 32, data: buf });

        if (this._state === state) {
            return;
        }

        this._state = state;

        let winMask = xcb.eventMask.STRUCTURE_NOTIFY;
        let frameMask = 0;

        if (state === Client.State.Normal) {
            frameMask = xcb.eventMask.STRUCTURE_NOTIFY |
                xcb.eventMask.ENTER_WINDOW |
                xcb.eventMask.LEAVE_WINDOW |
                xcb.eventMask.EXPOSURE |
                xcb.eventMask.SUBSTRUCTURE_REDIRECT |
                xcb.eventMask.POINTER_MOTION |
                xcb.eventMask.BUTTON_PRESS |
                xcb.eventMask.BUTTON_RELEASE;
            winMask = xcb.eventMask.PROPERTY_CHANGE |
                xcb.eventMask.STRUCTURE_NOTIFY |
                xcb.eventMask.FOCUS_CHANGE;

            xcb.change_window_attributes(this._owm.wm, { window: this._window.window, event_mask: winMask });
            xcb.change_window_attributes(this._owm.wm, { window: this._parent, event_mask: frameMask });

            xcb.map_window(this._owm.wm, this._window.window);
            xcb.map_window(this._owm.wm, this._parent);
        } else {
            // make sure we don't get an unmap notify
            xcb.change_window_attributes(this._owm.wm, { window: this._window.window, event_mask: 0 });
            xcb.change_window_attributes(this._owm.wm, { window: this._parent, event_mask: frameMask });

            xcb.unmap_window(this._owm.wm, this._parent);
            xcb.unmap_window(this._owm.wm, this._window.window);

            xcb.change_window_attributes(this._owm.wm, { window: this._window.window, event_mask: winMask });
        }
    }

    get visible() {
        return this._state === Client.State.Normal;
    }

    set visible(v: boolean) {
        this.state = v ? Client.State.Normal : Client.State.Iconic;
    }

    get ignoreWorkspace() {
        return this._ignoreWorkspace;
    }

    set ignoreWorkspace(ignore: boolean) {
        this._ignoreWorkspace = ignore;
        if (this._workspace) {
            this._workspace.relayout();
        }
        this._updateAllowed();
    }

    get staysOnTop() {
        return this._staysOnTop;
    }

    set staysOnTop(s: boolean) {
        if (this._staysOnTop === s)
            return;
        this._staysOnTop = s;
        if (this._container) {
            this._container.circulateToTop(this);
        }
    }

    get floating() {
        return this._floating;
    }

    set floating(s: boolean) {
        if (this._floating === s)
            return;
        this._floating = s;
        this._owm.relayout();
        if (this._workspace) {
            this._workspace.relayout();
        }
        if (s) {
            // we didn't skip before, but now we do.
            // let's go back to our original geometry

            const x = this._geometry.x = this._floatingGeometry.x;
            const y = this._geometry.y = this._floatingGeometry.y;
            const width = this._geometry.width = this._floatingGeometry.width;
            const height = this._geometry.height = this._floatingGeometry.height;

            const px = this._frameGeometry.x = x - this._border;
            const py = this._frameGeometry.y = y - this._border;
            const pwidth = this._frameGeometry.width = width + (this._border * 2);
            const pheight = this._frameGeometry.height = height + (this._border * 2);

            this._log.info("configuring2", this._window.window, px, py, pwidth, pheight);
            this._owm.xcb.configure_window(this._owm.wm, {
                window: this._parent,
                x: px, y: py, width: pwidth, height: pheight
            });
            this._owm.xcb.configure_window(this._owm.wm, {
                window: this._window.window,
                x: this._border, y: this._border, width: width, height: height
            });
        }
        this._updateAllowed();
    }

    get workspace() {
        return this._workspace;
    }

    set workspace(ws: Workspace | undefined) {
        this._workspace = ws;
    }

    get container() {
        return this._container;
    }

    set container(ws: Container | undefined) {
        this._container = ws;
    }

    get group() {
        return this._group;
    }

    raise(sibling: Client | undefined) {
        if (!sibling) {
            if (this._container) {
                this._container.circulateToTop(this);
            }
        } else {
            this._owm.xcb.configure_window(this._owm.wm, {
                window: this._parent,
                sibling: sibling._parent,
                stack_mode: this._owm.xcb.stackMode.ABOVE
            });
        }
    }

    lower(sibling: Client | undefined) {
        if (!sibling) {
            if (this._container) {
                this._container.circulateToBottom(this);
            }
        } else {
            this._owm.xcb.configure_window(this._owm.wm, {
                window: this._parent,
                sibling: sibling._parent,
                stack_mode: this._owm.xcb.stackMode.BELOW
            });
        }
    }

    centerOn(client: Client) {
        if (!client.floating)
            return;

        const cg = client.geometry;
        const cx = ((cg.width / 2) - (this._geometry.width / 2)) + cg.x;
        const cy = ((cg.height / 2) - (this._geometry.height / 2)) + cg.y;
        const cwidth = this._geometry.width;
        const cheight = this._geometry.height;

        this._geometry.x = this._floatingGeometry.x = cx;
        this._geometry.y = this._floatingGeometry.y = cy;

        const px = cx - this._border;
        const py = cy - this._border;
        const pwidth = this._frameGeometry.width;
        const pheight = this._frameGeometry.height;

        this._frameGeometry.x = px;
        this._frameGeometry.y = py;

        this._log.info("configuring3", this._window.window, px, py, pwidth, pheight);
        this._owm.xcb.configure_window(this._owm.wm, {
            window: this._parent,
            x: px, y: py, width: pwidth, height: pheight
        });
        this._owm.xcb.configure_window(this._owm.wm, {
            window: this._window.window,
            x: this._border, y: this._border, width: cwidth, height: cheight
        });
    }

    move(x: number, y: number) {
        this._frameGeometry.x = x;
        this._frameGeometry.y = y;
        this._geometry.x = x + this._border;
        this._geometry.y = y + this._border;

        this._log.info("configuring4", this._window.window, this._frameGeometry);
        this._owm.xcb.configure_window(this._owm.wm, {
            window: this._parent,
            x: this._frameGeometry.x,
            y: this._frameGeometry.y,
            width: this._frameGeometry.width,
            height: this._frameGeometry.height
        });
    }

    moveByKeyboard() {
        this._owm.moveByKeyboard(this);
    }

    resize(width: number, height: number) {
        this._frameGeometry.width = width;
        this._frameGeometry.height = height;
        this._geometry.width = width - (this._border * 2);
        this._geometry.height = height - (this._border * 2);

        if (this._frameGeometry.width <= (this._border * 2) || this._frameGeometry.height <= (this._border * 2)) {
            throw new Error("size too small");
        }
        this._log.info("configuring5", this._window.window, this._frameGeometry);
        this._owm.xcb.configure_window(this._owm.wm, {
            window: this._parent,
            x: this._frameGeometry.x,
            y: this._frameGeometry.y,
            width: this._frameGeometry.width,
            height: this._frameGeometry.height
        });
        this._owm.xcb.configure_window(this._owm.wm, {
            window: this._window.window,
            width: this._geometry.width,
            height: this._geometry.height
        });
    }

    resizeByKeyboard() {
        this._owm.resizeByKeyboard(this);
    }

    configure(cfg: ConfigureArgs) {
        if (cfg.window !== this._window.window) {
            throw new Error("configuring wrong window");
        }
        if (this._floating || this._ignoreWorkspace) {
            const geom = new Geometry(this._geometry);
            // let's do it
            if (cfg.x !== undefined) {
                geom.x = cfg.x;
                this._geometry.x = cfg.x;
                this._floatingGeometry.x = cfg.x;
            }
            if (cfg.y !== undefined) {
                geom.y = cfg.y;
                this._geometry.y = cfg.y;
                this._floatingGeometry.y = cfg.y;
            }
            if (cfg.width !== undefined) {
                geom.width = cfg.width;
                this._geometry.width = cfg.width;
                this._floatingGeometry.width = cfg.width;
            }
            if (cfg.height !== undefined) {
                geom.height = cfg.height;
                this._geometry.height = cfg.height;
                this._floatingGeometry.height = cfg.height;
            }

            const px = this._frameGeometry.x = geom.x - this._border;
            const py = this._frameGeometry.y = geom.y - this._border;
            const pwidth = this._frameGeometry.width = geom.width + (this._border * 2);
            const pheight = this._frameGeometry.height = geom.height + (this._border * 2);

            this._log.info("configuring1", this._window.window, cfg, px, py, pwidth, pheight);

            this._owm.xcb.configure_window(this._owm.wm, {
                window: this._parent,
                x: px, y: py, width: pwidth, height: pheight
            });
            this._owm.xcb.configure_window(this._owm.wm, {
                window: cfg.window,
                x: this._border, y: this._border, width: geom.width, height: geom.height
            });
        } else {
            this._log.info("trying to configure window in layout, ignoring");
            // keep track of where the client really wants us
            if (cfg.x !== undefined) {
                this._floatingGeometry.x = cfg.x;
            }
            if (cfg.y !== undefined) {
                this._floatingGeometry.y = cfg.y;
            }
            if (cfg.width !== undefined) {
                this._floatingGeometry.width = cfg.width;
            }
            if (cfg.height !== undefined) {
                this._floatingGeometry.height = cfg.height;
            }
            this._owm.xcb.send_configure_notify(this._owm.wm, {
                window: cfg.window,
                x: this._geometry.x,
                y: this._geometry.y,
                width: this._geometry.width,
                height: this._geometry.height,
                border_width: 0
            });
        }
    }

    updateProperty(property: number) {
        const buffer = this._owm.xcb.get_property(this._owm.wm, { window: this._window.window, property: property });
        if (!buffer) {
            const name = this._owm.xcb.get_atom_name(this._owm.wm, property);
            throw new Error(`couldn't get property for update ${name}`);
        }

        // this._log.error("prop", this._owm.xcb.get_atom_name(this._owm.wm, property));

        const atom = this._owm.xcb.atom;
        switch (property) {
        case atom.WM_HINTS:
            this._updateWmHints(buffer);
            break;
        case atom.WM_NAME:
            this._updateWmName(buffer);
            break;
        case atom.WM_NORMAL_HINTS:
            this._updateWmNormalHints(buffer);
            break;
        case atom.WM_CLIENT_LEADER:
            this._updateWmClientLeader(buffer);
            break;
        case atom.WM_TRANSIENT_FOR:
            this._updateWmTransientFor(buffer);
            break;
        case atom.WM_WINDOW_ROLE:
            this._updateWmWindowRole(buffer);
            break;
        case atom.WM_CLASS:
            this._updateWmClass(buffer);
            break;
        case atom._NET_WM_NAME:
            this._updateEwmhWmName(buffer);
            break;
        case atom._NET_WM_STRUT:
            this._updateWmStrut(buffer);
            break;
        case atom._NET_WM_STRUT_PARTIAL:
            this._updateWmStrutPartial(buffer);
            break;
        case atom._NET_WM_WINDOW_TYPE:
            this._updateWmWindowType(buffer);
            break;
        default:
            const name = this._owm.xcb.get_atom_name(this._owm.wm, property);
            this._log.error(`unhandled property notify ${name}`);
            break;
        }
    }

    map() {
        this._owm.xcb.map_window(this._owm.wm, this._parent);
    }

    unmap() {
        this._owm.xcb.unmap_window(this._owm.wm, this._parent);
    }

    focus() {
        let client: Client = this;
        for (;;) {
            const clients = this._group.transientsForClient(client);
            if (clients.length > 0 && clients[0].modal) {
                client = clients[0];
            } else {
                break;
            }
        }

        if (client.noinput) {
            return false;
        }

        const owm = this._owm;

        if (owm.focused === client) {
            return true;
        }

        const takeFocus = owm.xcb.atom.WM_TAKE_FOCUS;
        if (client.window.wmProtocols.includes(takeFocus)) {
            this._log.info("sending client message");
            const data = new Uint32Array(2);
            data[0] = takeFocus;
            data[1] = owm.currentTime;
            owm.xcb.send_client_message(owm.wm, { window: client.window.window, type: owm.xcb.atom.WM_PROTOCOLS, data: data });
        }

        owm.xcb.set_input_focus(owm.wm, { window: client.window.window, revert_to: owm.xcb.inputFocus.FOCUS_PARENT,
                                          time: owm.currentTime });

        const activeData = new Uint32Array(1);
        activeData[0] = client.window.window;
        owm.xcb.change_property(owm.wm, { window: client.window.geometry.root, mode: owm.xcb.propMode.REPLACE,
                                          property: owm.xcb.atom._NET_ACTIVE_WINDOW, type: owm.xcb.atom.WINDOW,
                                          format: 32, data: activeData });

        owm.focused = client;

        return true;
    }

    kill(force?: boolean) {
        const deleteWindow = this._owm.xcb.atom.WM_DELETE_WINDOW;
        if (!force && this._window.wmProtocols.includes(deleteWindow)) {
            this._log.info("sending client delete message");
            const data = new Uint32Array(1);
            data[0] = deleteWindow;
            this._owm.xcb.send_client_message(this._owm.wm, { window: this._window.window,
                                                              type: this._owm.xcb.atom.WM_PROTOCOLS,
                                                              data: data });

            // make sure the client dies
            const win = this._window.window;
            const owm = this._owm;
            setTimeout(() => {
                const client = owm.findClientByWindow(win);
                if (client) {
                    client.kill(true);
                }
            }, this._owm.options.killTimeout);
        } else if (this._window.pid > 0) {
            this._log.info("killing pid");
            process.kill(this._window.pid);
        } else {
            this._log.info("killing client");
            this._owm.xcb.kill_client(this._owm.wm, this._window.window);
        }
    }

    private _updateAllowed() {
        const owm = this._owm;
        const atom = owm.xcb.atom;

        let allowed = [ atom._NET_WM_ACTION_CLOSE ]

        if (!this._ignoreWorkspace) {
            allowed.push(atom._NET_WM_ACTION_CHANGE_DESKTOP);
        }

        if (!this.dock) {
            allowed = allowed.concat([
                atom._NET_WM_ACTION_MINIMIZE,
                atom._NET_WM_ACTION_FULLSCREEN,
                atom._NET_WM_ACTION_ABOVE,
                atom._NET_WM_ACTION_BELOW
            ]);
        }

        if (this._floating) {
            allowed = allowed.concat([
                atom._NET_WM_ACTION_MOVE,
                atom._NET_WM_ACTION_RESIZE
            ]);
        }

        const allowedData = new Uint32Array(allowed.length);
        for (let i = 0; i < allowed.length; ++i) {
            allowedData[i] = allowed[i];
        }

        owm.xcb.change_property(owm.wm, { window: this._window.window, mode: owm.xcb.propMode.REPLACE,
                                          property: atom._NET_WM_ALLOWED_ACTIONS, type: owm.xcb.atom.ATOM,
                                          format: 32, data: allowedData });
    }

    private _createGC() {
        if (this._gc) {
            if (this._pixel) {
                this._owm.xcb.change_gc(this._owm.wm, { gc: this._gc, values: { foreground: this._pixel } });
            } else {
                this._owm.xcb.free_gc(this._owm.wm, this._gc);
                this._gc = undefined;
            }
        } else if (this._pixel !== undefined) {
            this._gc = this._owm.xcb.create_gc(this._owm.wm, { window: this._parent, values: { foreground: this._pixel } })
        }
    }

    private _updateWmHints(buffer: ArrayBuffer) {
        const dv = new DataView(buffer);
        if (dv.byteLength != 9 * 4) {
            throw new Error(`incorrect number of WM_HINTS arguments ${dv.byteLength / 4} should be 9`);
        }

        const isLE = endianness() === "LE";

        const wmHints = {
            flags: dv.getInt32(0, isLE),
            input: dv.getUint32(4, isLE),
            initial_state: dv.getInt32(8, isLE),
            icon_pixmap: dv.getUint32(12, isLE),
            icon_window: dv.getUint32(16, isLE),
            icon_x: dv.getInt32(20, isLE),
            icon_y: dv.getInt32(24, isLE),
            icon_mask: dv.getUint32(28, isLE),
            window_group: dv.getUint32(32, isLE),
        };

        if (wmHints.flags & this._owm.xcb.icccm.hint.INPUT)
            this._noinput = wmHints.input === 0;

        this._window.wmHints = wmHints;
    }

    private _updateWmName(buffer: ArrayBuffer) {
    }

    private _updateWmNormalHints(buffer: ArrayBuffer) {
        const dv = new DataView(buffer);
        if (dv.byteLength != 18 * 4) {
            throw new Error(`incorrect number of WM_NORMAL_HINTS arguments ${dv.byteLength / 4} should be 18`);
        }

        const isLE = endianness() === "LE";

        const normalHints = {
            flags: dv.getUint32(0, isLE),
            x: dv.getInt32(4, isLE),
            y: dv.getInt32(8, isLE),
            width: dv.getInt32(12, isLE),
            height: dv.getInt32(16, isLE),
            min_width: dv.getInt32(20, isLE),
            min_height: dv.getInt32(24, isLE),
            max_width: dv.getInt32(28, isLE),
            max_height: dv.getInt32(32, isLE),
            width_inc: dv.getInt32(36, isLE),
            height_inc: dv.getInt32(40, isLE),
            min_aspect_num: dv.getInt32(44, isLE),
            min_aspect_den: dv.getInt32(48, isLE),
            max_aspect_num: dv.getInt32(52, isLE),
            max_aspect_den: dv.getInt32(56, isLE),
            base_width: dv.getInt32(60, isLE),
            base_height: dv.getInt32(64, isLE),
            win_gravity: dv.getUint32(68, isLE)
        };

        this._window.normalHints = normalHints;
    }

    private _updateWmClientLeader(buffer: ArrayBuffer) {
    }

    private _updateWmTransientFor(buffer: ArrayBuffer) {
    }

    private _updateWmWindowRole(buffer: ArrayBuffer) {
    }

    private _updateWmClass(buffer: ArrayBuffer) {
    }

    private _updateEwmhWmName(buffer: ArrayBuffer) {
    }

    private _updateWmStrut(buffer: ArrayBuffer) {
    }

    private _updateWmStrutPartial(buffer: ArrayBuffer) {
    }

    private _updateWmWindowType(buffer: ArrayBuffer) {
    }
}

export namespace Client {
    export enum State {
        Normal,
        Iconic,
        Withdrawn
    }
}

export function isClient(o: any): o is Client {
    return o._type === "Client";
}

export class ClientGroup {
    private _transients: Map<number, number>;
    private _followers: Set<number>;
    private _leader: number;
    private _ref: number;
    private _owm: OWMLib;

    constructor(owm: OWMLib, leader: number) {
        this._transients = new Map<number, number>();
        this._followers = new Set<number>();
        this._ref = 1;
        this._owm = owm;
        this._leader = leader;
    }

    get leaderClient(): Client | undefined {
        return this._owm.findClientByWindow(this._leader);
    }

    get leaderWindow() {
        return this._leader;
    }

    transientsForClient(client: Client): Client[] {
        const ret: Client[] = [];
        const cid = client.window.window;
        for (const [f, t] of this._transients) {
            if (t === cid) {
                const c = this._owm.findClientByWindow(f);
                if (c) {
                    ret.push(c);
                }
            }
        }
        return ret;
    }

    followerClients(): Client[] {
        const ret: Client[] = [];
        for (const f of this._followers) {
            const c = this._owm.findClientByWindow(f);
            if (c) {
                ret.push(c);
            }
        }
        return ret;
    }

    addTransient(from: number, to: number) {
        if (this._transients.has(from)) {
            throw new Error(`Group already has a transient with id ${from} (to ${to})`);
        }
        this._transients.set(from, to);
    }

    removeTransient(from: number) {
        this._transients.delete(from);
    }

    addFollower(follower: number) {
        this._followers.add(follower);
    }

    removeFollower(follower: number) {
        this._followers.delete(follower);
    }

    remove(window: number) {
        this._followers.delete(window);
        this._transients.delete(window);
        for (const [f, t] of this._transients) {
            if (t === window) {
                this._transients.delete(f);
            }
        }
    }

    ref() {
        ++this._ref;
    }

    deref() {
        return !--this._ref;
    }
}
