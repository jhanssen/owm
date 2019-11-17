import { OWMLib } from "./owm";
import { Logger } from "./logger";
import { ContainerItem } from "./container";
import { Workspace } from "./workspace";
import { Container } from "./container";
import { Geometry, Strut } from "./utils";
import { endianness } from "os";
import { XCB, OWM } from "native";

interface ConfigureArgs {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    sibling?: number;
    stack_mode?: number;
}

type MutableWindow = {
    -readonly [K in keyof XCB.Window]: XCB.Window[K];
}

type MutableWMClass = {
    -readonly [K in keyof XCB.WindowTypes.WMClass]: XCB.WindowTypes.WMClass[K];
}

function zero(data: any) {
    for (const k in data) {
        data[k] = 0;
    }
}

export class Client implements ContainerItem
{
    private readonly _parent: number;
    private readonly _window: XCB.Window;
    private readonly _owm: OWMLib;
    private _border: number;
    private _geometry: Geometry;
    private _frameGeometry: Geometry;
    private _requestedGeometry: Geometry;
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

    constructor(owm: OWMLib, parent: number, window: XCB.Window, border: number) {
        this._owm = owm;
        this._parent = parent;
        this._window = window;
        this._border = border;
        this._geometry = new Geometry(window.geometry);
        this._requestedGeometry = new Geometry(window.geometry);
        this._frameGeometry = new Geometry({
            x: window.geometry.x - border,
            y: window.geometry.y - border,
            width: window.geometry.width + (border * 2),
            height: window.geometry.height + (border * 2)
        });
        this._staysOnTop = false;
        this._ignoreWorkspace = false;
        this._type = "Client";
        this._group = this._makeGroup();

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

    get dialog() {
        return this._window.transientFor !== 0 && this._window.ewmhWindowType.includes(this._owm.xcb.atom._NET_WM_WINDOW_TYPE_DIALOG);
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

            this._configure(this._requestedGeometry);
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

    raise(sibling?: Client) {
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

    lower(sibling?: Client) {
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
        if (!this._floating)
            return;

        const cg = client.geometry;
        const cx = ((cg.width / 2) - (this._geometry.width / 2)) + cg.x;
        const cy = ((cg.height / 2) - (this._geometry.height / 2)) + cg.y;

        this._configure({ x: cx, y: cy });
    }

    move(x: number, y: number) {
        this._configure({ x: x + this._border, y: y + this._border });
    }

    moveByKeyboard() {
        this._owm.moveByKeyboard(this);
    }

    resize(width: number, height: number, keepHeight?: boolean) {
        this._configure({ width: width - (this._border * 2), height: height - (this._border * 2) }, keepHeight);
    }

    resizeByKeyboard() {
        this._owm.resizeByKeyboard(this);
    }

    configure(cfg: ConfigureArgs) {
        if ((this._floating || this._ignoreWorkspace) && !this.dialog) {
            const geom = new Geometry(this._geometry);
            // let's do it
            if (cfg.x !== undefined) {
                geom.x = cfg.x;
                this._requestedGeometry.x = cfg.x;
            }
            if (cfg.y !== undefined) {
                geom.y = cfg.y;
                this._requestedGeometry.y = cfg.y;
            }
            if (cfg.width !== undefined) {
                geom.width = cfg.width;
                this._requestedGeometry.width = cfg.width;
            }
            if (cfg.height !== undefined) {
                geom.height = cfg.height;
                this._requestedGeometry.height = cfg.height;
            }

            this._configure(geom);
        } else {
            this._log.info("trying to configure window in layout, ignoring");
            // keep track of where the client really wants us
            if (cfg.x !== undefined) {
                this._requestedGeometry.x = cfg.x;
            }
            if (cfg.y !== undefined) {
                this._requestedGeometry.y = cfg.y;
            }
            if (cfg.width !== undefined) {
                this._requestedGeometry.width = cfg.width;
            }
            if (cfg.height !== undefined) {
                this._requestedGeometry.height = cfg.height;
            }
            this._owm.xcb.send_configure_notify(this._owm.wm, {
                window: this._window.window,
                x: this._geometry.x,
                y: this._geometry.y,
                width: this._geometry.width,
                height: this._geometry.height,
                border_width: 0
            });
        }
    }

    updateProperty(property: number, isDelete: boolean) {
        let propdata: OWM.GetProperty | undefined;
        if (!isDelete) {
            propdata = this._owm.xcb.get_property(this._owm.wm, { window: this._window.window, property: property });
            if (!propdata) {
                const name = this._owm.xcb.get_atom_name(this._owm.wm, property);
                throw new Error(`couldn't get property for update ${name}`);
            }
        }

        // this._log.error("prop", this._owm.xcb.get_atom_name(this._owm.wm, property));

        const atom = this._owm.xcb.atom;
        switch (property) {
        case atom.WM_HINTS:
            this._updateWmHints(propdata);
            break;
        case atom.WM_NAME:
            this._updateWmName(propdata);
            break;
        case atom.WM_NORMAL_HINTS:
            this._updateWmNormalHints(propdata);
            break;
        case atom.WM_CLIENT_LEADER:
            this._updateWmClientLeader(propdata);
            break;
        case atom.WM_TRANSIENT_FOR:
            this._updateWmTransientFor(propdata);
            break;
        case atom.WM_WINDOW_ROLE:
            this._updateWmWindowRole(propdata);
            break;
        case atom.WM_CLASS:
            this._updateWmClass(propdata);
            break;
        case atom._NET_WM_NAME:
            this._updateEwmhWmName(propdata);
            break;
        case atom._NET_WM_STRUT:
            this._updateEwmhStrut(propdata);
            break;
        case atom._NET_WM_STRUT_PARTIAL:
            this._updateEwmhStrutPartial(propdata);
            break;
        case atom._NET_WM_WINDOW_TYPE:
            this._updateEwmhWindowType(propdata);
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

    private _updateWmHints(property?: OWM.GetProperty) {
        if (property === undefined) {
            // delete
            zero((this._window as MutableWindow).wmHints);
            return;
        }

        const dv = new DataView(property.buffer);
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

        (this._window as MutableWindow).wmHints = wmHints;
    }

    private _updateWmName(property?: OWM.GetProperty) {
        if (!property || property.format !== 8) {
            (this._window as MutableWindow).wmName = "";
            return;
        }

        let encoding = "latin1";
        if (property.type === this._owm.xcb.atom.UTF8_STRING) {
            encoding = "utf8";
        }

        const nbuf = Buffer.from(property.buffer);
        (this._window as MutableWindow).wmName = nbuf.toString(encoding, 0, property.buffer.byteLength);
    }

    private _updateWmNormalHints(property?: OWM.GetProperty) {
        if (!property) {
            zero((this._window as MutableWindow).normalHints);
            return;
        }
        const dv = new DataView(property.buffer);
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

        (this._window as MutableWindow).normalHints = normalHints;
    }

    private _updateWmClientLeader(property?: OWM.GetProperty) {
        if (!property) {
            (this._window as MutableWindow).leader = 0;
            this._group = this._makeGroup(this._group);
            return;
        }
        if (property.type !== this._owm.xcb.atom.WINDOW) {
            const name = this._owm.xcb.get_atom_name(this._owm.wm, property.type);
            throw new Error(`client leader not a window? ${name}`);
        }

        const dv = new DataView(property.buffer);
        const isLE = endianness() === "LE";

        (this._window as MutableWindow).leader = dv.getUint32(0, isLE);
        this._group = this._makeGroup(this._group);
    }

    private _updateWmTransientFor(property?: OWM.GetProperty) {
        const win = this._window;

        if (!property) {
            (win as MutableWindow).transientFor = 0;
            this._group = this._makeGroup(this._group);
            return;
        }

        if (property.type !== this._owm.xcb.atom.WINDOW) {
            const name = this._owm.xcb.get_atom_name(this._owm.wm, property.type);
            throw new Error(`transient_for not a window? ${name}`);
        }

        const dv = new DataView(property.buffer);
        const isLE = endianness() === "LE";

        (win as MutableWindow).transientFor = dv.getUint32(0, isLE);
        this._group = this._makeGroup(this._group);
        this._group.addTransient(win.window, win.transientFor)

        // try to center me
        const tfor = this._owm.findClientByWindow(win.transientFor);
        if (tfor) {
            this.centerOn(tfor);
        }
    }

    private _updateWmWindowRole(property?: OWM.GetProperty) {
        if (!property || property.format !== 8) {
            (this._window as MutableWindow).wmRole = "";
            return;
        }

        // ICCCM says that this property is encoded as ISO 8859-1
        const nbuf = Buffer.from(property.buffer);
        (this._window as MutableWindow).wmRole = nbuf.toString('latin1', 0, property.buffer.byteLength);
    }

    private _updateWmClass(property?: OWM.GetProperty) {
        if (!property || property.format !== 8) {
            (this._window.wmClass as MutableWMClass).instance_name = "";
            (this._window.wmClass as MutableWMClass).class_name = "";
            return;
        }

        const len = property.buffer.byteLength;
        if (len === 0) {
            (this._window.wmClass as MutableWMClass).instance_name = "";
            (this._window.wmClass as MutableWMClass).class_name = "";
            return;
        }

        let encoding = "latin1";
        if (property.type === this._owm.xcb.atom.UTF8_STRING) {
            encoding = "utf8";
        }

        const nbuf = Buffer.from(property.buffer);

        let mid = 0;
        // find the first 0 byte
        for (let idx = 0; idx < len; ++idx) {
            if (nbuf.readUInt8(idx) === 0) {
                mid = idx;
                break;
            }
        }

        // find the first final 0 byte
        let last = len;
        while (nbuf.readUInt8(last - 1) === 0) {
            --last;
        }

        let wmClass = (this._window.wmClass as MutableWMClass);
        if (mid !== 0) {
            // we have an instance_name
            wmClass.instance_name = nbuf.toString(encoding, 0, mid);
        } else {
            wmClass.instance_name = "";
        }
        if (mid < last) {
            // we have a class_name
            wmClass.class_name = nbuf.toString(encoding, mid + 1, last);
        } else {
            wmClass.class_name = "";
        }
    }

    private _updateEwmhWmName(property?: OWM.GetProperty) {
        if (!property || property.format !== 8) {
            (this._window as MutableWindow).ewmhName = "";
            return;
        }

        // this property is defined to be utf8
        const nbuf = Buffer.from(property.buffer);
        (this._window as MutableWindow).ewmhName = nbuf.toString('utf8', 0, property.buffer.byteLength);
    }

    private _updateEwmhStrut(property?: OWM.GetProperty) {
        if (!property) {
            zero((this._window as MutableWindow).ewmhStrut);
            if (!Strut.hasStrut(this._window.ewmhStrutPartial)) {
                this._relayoutWorkspace();
            }
            return;
        }
        const dv = new DataView(property.buffer);
        if (dv.byteLength != 4 * 4) {
            throw new Error(`incorrect number of _NET_WM_STRUT arguments ${dv.byteLength / 4} should be 4`);
        }

        const isLE = endianness() === "LE";

        const strut = {
            left: dv.getUint32(0, isLE),
            right: dv.getUint32(4, isLE),
            top: dv.getUint32(8, isLE),
            bottom: dv.getUint32(12, isLE)
        };

        (this._window as MutableWindow).ewmhStrut = strut;

        // partial strut is preferred over strut
        if (!Strut.hasStrut(this._window.ewmhStrutPartial)) {
            this._relayoutWorkspace();
        }
    }

    private _updateEwmhStrutPartial(property?: OWM.GetProperty) {
        if (!property) {
            zero((this._window as MutableWindow).ewmhStrutPartial);
            this._relayoutWorkspace();
            return;
        }
        const dv = new DataView(property.buffer);
        if (dv.byteLength != 12 * 4) {
            throw new Error(`incorrect number of _NET_WM_STRUT_PARTIAL arguments ${dv.byteLength / 4} should be 12`);
        }

        const isLE = endianness() === "LE";

        const strut = {
            left: dv.getUint32(0, isLE),
            right: dv.getUint32(4, isLE),
            top: dv.getUint32(8, isLE),
            bottom: dv.getUint32(12, isLE),
            left_start_y: dv.getUint32(16, isLE),
            left_end_y: dv.getUint32(20, isLE),
            right_start_y: dv.getUint32(24, isLE),
            right_end_y: dv.getUint32(28, isLE),
            top_start_x: dv.getUint32(32, isLE),
            top_end_x: dv.getUint32(36, isLE),
            bottom_start_x: dv.getUint32(40, isLE),
            bottom_end_x: dv.getUint32(44, isLE)
        };

        (this._window as MutableWindow).ewmhStrutPartial = strut;
        this._relayoutWorkspace();
    }

    private _updateEwmhWindowType(property?: OWM.GetProperty) {
        if (!property || property.format !== 32 || property.type !== this._owm.xcb.atom.ATOM) {
            (this._window as MutableWindow).ewmhWindowType = [];
            return;
        }

        const dv = new DataView(property.buffer);
        if (dv.byteLength % 4 !== 0) {
            throw new Error(`number of _NET_WM_WINDOW_TYPE arguments needs to be divisible by 4 ${dv.byteLength}`);
        }

        const isLE = endianness() === "LE";

        const types: number[] = [];
        let off = 0;
        while (off < dv.byteLength) {
            types.push(dv.getUint32(off, isLE));
            off += 4;
        }

        (this._window as MutableWindow).ewmhWindowType = types;
    }

    private _configure(args: ConfigureArgs, keepHeight?: boolean) {
        if ((args.x === undefined) != (args.y === undefined)) {
            throw new Error(`_configure, x must be set if y is`);
        }
        if ((args.width === undefined) != (args.height === undefined)) {
            throw new Error(`_configure, width must be set if height is`);
        }

        let thisArgs: {
            window: number,
            width?: number,
            height?: number
        } = { window: this._window.window };
        let parentArgs = Object.assign({ window: this._parent }, args);

        if (args.x !== undefined && args.y !== undefined) {
            this._geometry.x = args.x;
            this._geometry.y = args.y;

            parentArgs.x = this._frameGeometry.x = this._geometry.x - this._border;
            parentArgs.y = this._frameGeometry.y = this._geometry.y - this._border;
        }
        if (args.width !== undefined && args.height !== undefined) {
            if (this._floating && !this.dock) {
                this._enforceSize(args.width, args.height, keepHeight);
            } else {
                this._geometry.width = args.width;
                this._geometry.height = args.height;
                this._frameGeometry.width = args.width * (this._border * 2);
                this._frameGeometry.height = args.height * (this._border * 2);
            }

            parentArgs.width = this._frameGeometry.width;
            parentArgs.height = this._frameGeometry.height;
            thisArgs.width = this._geometry.width;
            thisArgs.height = this._geometry.height;
        }

        this._owm.xcb.configure_window(this._owm.wm, thisArgs);
        this._owm.xcb.configure_window(this._owm.wm, parentArgs);
    }

    private _enforceSize(width: number, height: number, keepHeight?: boolean) {
        // respect minimum/maximum size and aspect ratio
        const normal = this._window.normalHints;
        const sizeHint = this._owm.xcb.icccm.sizeHint;

        const sizes = {
            baseWidth: 0, baseHeight: 0,
            minWidth: 0, minHeight: 0,
            maxWidth: 0, maxHeight: 0
        };

        // extract our needed info from normal hints
        if (normal.flags & sizeHint.BASE_SIZE) {
            sizes.baseWidth = normal.base_width;
            sizes.baseHeight = normal.base_height;
        }
        if (normal.flags & sizeHint.P_MIN_SIZE) {
            sizes.minWidth = normal.min_width;
            sizes.minHeight = normal.min_height;
        }
        if (normal.flags & sizeHint.P_MAX_SIZE) {
            sizes.maxWidth = normal.max_width;
            sizes.maxHeight = normal.max_height;
        }

        // keep base size for aspect ratio calculation further down
        const baseWidth = sizes.baseWidth, baseHeight = sizes.baseHeight;

        // use base size for min size if we don't have one
        if (!(normal.flags & sizeHint.P_MIN_SIZE)) {
            sizes.minWidth = sizes.baseWidth;
            sizes.minHeight = sizes.baseHeight;
        }

        // use min size for base size if we don't have one
        if (!(normal.flags & sizeHint.BASE_SIZE)) {
            sizes.baseWidth = sizes.minWidth;
            sizes.baseHeight = sizes.minHeight;
        }

        // enforce minimum and maximum size
        if (width < sizes.minWidth)
            width = sizes.minWidth;
        if (sizes.maxWidth > 0 && width > sizes.maxWidth)
            width = sizes.maxWidth;
        if (height < sizes.minHeight)
            height = sizes.minHeight;
        if (sizes.maxHeight > 0 && height > sizes.maxHeight)
            height = sizes.maxHeight;

        if (normal.flags & sizeHint.P_ASPECT) {
            let ar = (width - baseWidth) / (height - baseHeight);
            if (normal.min_aspect_num > 0 && normal.min_aspect_den > 0 && ar < (normal.min_aspect_num / normal.min_aspect_den)) {
                ar = normal.min_aspect_num / normal.min_aspect_den;
            } else if (normal.max_aspect_num > 0 && normal.max_aspect_den > 0 && ar > (normal.max_aspect_num / normal.max_aspect_den)) {
                ar = normal.max_aspect_num / normal.max_aspect_den;
            }

            let nw = 0, nh = 0;
            if (keepHeight === true) {
                nw = Math.round((height - baseHeight) * ar);
                nh = Math.round(nw / ar);
            } else {
                nh = Math.round((width - baseWidth) / ar);
                nw = Math.round(nh * ar);
            }

            width = nw + baseWidth;
            height = nh + baseHeight;
        }

        if (normal.flags & sizeHint.P_RESIZE_INC) {
            if (normal.width_inc > 0 && width >= sizes.baseWidth) {
                width -= sizes.baseWidth;
                width -= width % normal.width_inc;
                width += sizes.baseWidth;
            }
            if (normal.height_inc > 0 && height >= sizes.baseHeight) {
                height -= sizes.baseHeight;
                height -= height % normal.height_inc;
                height += sizes.baseHeight;
            }
        }

        this._geometry.width = width;
        this._geometry.height = height;
        this._frameGeometry.width = this._geometry.width + (this._border * 2);
        this._frameGeometry.height = this._geometry.height + (this._border * 2);
    }

    private _relayoutWorkspace() {
        const monitor = this._owm.monitors.monitorByPosition(this._geometry.x, this._geometry.y);
        if (!monitor)
            return;
        const ws = monitor.workspace;
        if (!ws)
            return;
        ws.relayout();
    }

    private _makeGroup(prevGroup?: ClientGroup) {
        const win = this._window;

        if (prevGroup) {
            if (!prevGroup.remove(win.window)) {
                this._owm.groups.delete(prevGroup.leaderWindow);
            }
        }

        const leader = win.leader || win.transientFor || win.window;
        let grp = this._owm.groups.get(leader);
        if (!grp) {
            grp = new ClientGroup(this._owm, leader);
            this._owm.groups.set(leader, grp);
        }
        grp.addFollower(win.window);

        return grp;
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
    private _owm: OWMLib;

    constructor(owm: OWMLib, leader: number) {
        this._transients = new Map<number, number>();
        this._followers = new Set<number>();
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

    addFollower(follower: number) {
        this._followers.add(follower);
    }

    remove(window: number) {
        this._followers.delete(window);
        this._transients.delete(window);
        return this._followers.size > 0 || this._transients.size > 0;
    }
}
