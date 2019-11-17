import { OWMLib } from "./owm";
import { Geometry } from "./utils";
import { Workspace } from "./workspace";
import { Client } from "./client";
import { Logger } from "./logger";

export class EWMH {
    private _owm: OWMLib;
    private _currentWorkspace: number;
    private _log: Logger;

    constructor(owm: OWMLib) {
        this._owm = owm;
        this._currentWorkspace = 0;
        this._log = owm.logger.prefixed("EWMH");
    }

    updateClientList() {
        const owm = this._owm;
        const xcb = owm.xcb;

        const clients = owm.clients;
        const clientData = new Uint32Array(clients.length);
        for (let i = 0; i < clients.length; ++i) {
            clientData[i] = clients[i].window.window;
        }

        xcb.change_property(owm.wm, { window: owm.root, mode: xcb.propMode.REPLACE,
                                      property: xcb.atom._NET_CLIENT_LIST, type: xcb.atom.WINDOW,
                                      format: 32, data: clientData });
    }

    updateWorkarea() {
        const owm = this._owm;
        const xcb = owm.xcb;

        const geoms = new Map<number, Geometry>();

        owm.monitors.forEachWorkspace((ws: Workspace) => {
            if (geoms.has(ws.id)) {
                throw new Error(`geom already has workspace ${ws.id}`);
            }
            geoms.set(ws.id, ws.geometry);
            return true;
        });

        const waData = new Uint32Array(geoms.size * 4);
        for (const [num, geom] of geoms) {
            waData[((num - 1) * 4)] = geom.x;
            waData[((num - 1) * 4) + 1] = geom.y;
            waData[((num - 1) * 4) + 2] = geom.width;
            waData[((num - 1) * 4) + 3] = geom.height;
        }

        xcb.change_property(owm.wm, { window: owm.root, mode: xcb.propMode.REPLACE,
                                      property: xcb.atom._NET_WORKAREA, type: xcb.atom.CARDINAL,
                                      format: 32, data: waData });
    }

    updateWorkspaces() {
        // count'em

        const owm = this._owm;
        const xcb = owm.xcb;

        let high = 0;
        const names = new Map<number, string>();

        owm.monitors.forEachWorkspace((ws: Workspace) => {
            if (ws.id > high) {
                high = ws.id;
            }
            if (ws.name !== undefined) {
                if (ws.id <= 0 || names.has(ws.id - 1)) {
                    throw new Error(`error collecting workspace names ${ws.id}`);
                }
                names.set(ws.id - 1, ws.name);
            }
            return true;
        });

        if (high <= 0) {
            throw new Error(`highest workspace ${high}?`);;
        }

        const wsData = new Uint32Array(1);
        wsData[0] = high;

        xcb.change_property(owm.wm, { window: owm.root, mode: xcb.propMode.REPLACE,
                                      property: xcb.atom._NET_NUMBER_OF_DESKTOPS, type: xcb.atom.CARDINAL,
                                      format: 32, data: wsData });

        const nullBuffer = Buffer.alloc(1);

        const nameArray: Buffer[] = [];
        for (let i = 0; i < high; ++i) {
            const n = names.get(i);
            if (n) {
                nameArray.push(Buffer.from(n));
            } else {
                nameArray.push(Buffer.from(`${i + 1}`));
            }
            nameArray.push(nullBuffer);
        }

        const nameBuffer = Buffer.concat(nameArray);
        xcb.change_property(owm.wm, { window: owm.root, mode: xcb.propMode.REPLACE,
                                      property: xcb.atom._NET_DESKTOP_NAMES, type: xcb.atom.UTF8_STRING,
                                      format: 8, data: nameBuffer });
    }

    updateCurrentWorkspace(ws: number) {
        if (ws <= 0) {
            throw new Error(`can't update current workspace to ${ws}`);
        }
        if (ws === this._currentWorkspace) {
            return;
        }

        const owm = this._owm;
        const xcb = owm.xcb;

        const wsData = new Uint32Array(1);
        wsData[0] = ws - 1;

        xcb.change_property(owm.wm, { window: owm.root, mode: xcb.propMode.REPLACE,
                                      property: xcb.atom._NET_CURRENT_DESKTOP, type: xcb.atom.CARDINAL,
                                      format: 32, data: wsData });

        this._currentWorkspace = ws;
    }

    updateSupported() {
        const owm = this._owm;
        const xcb = owm.xcb;
        const atom = xcb.atom;

        const supportedAtoms = [
            atom._NET_SUPPORTED,
            atom._NET_SUPPORTING_WM_CHECK,
            atom._NET_FRAME_EXTENTS,
            atom._NET_WM_ALLOWED_ACTIONS,
            atom._NET_WM_NAME,
            atom._NET_WM_MOVERESIZE,
            atom._NET_WM_PID,
            atom._NET_WM_STATE_FULLSCREEN,
            atom._NET_WM_STATE_MODAL,
            atom._NET_WM_STATE_HIDDEN,
            atom._NET_WM_STATE_FOCUSED,
            atom._NET_WM_STATE,
            atom._NET_WM_WINDOW_TYPE,
            atom._NET_WM_WINDOW_TYPE_NORMAL,
            atom._NET_WM_WINDOW_TYPE_DOCK,
            atom._NET_WM_WINDOW_TYPE_DIALOG,
            atom._NET_WM_STRUT_PARTIAL,
            atom._NET_WM_USER_TIME_WINDOW,
            atom._NET_CLIENT_LIST,
            atom._NET_WM_DESKTOP,
            atom._NET_CURRENT_DESKTOP,
            atom._NET_NUMBER_OF_DESKTOPS,
            atom._NET_DESKTOP_NAMES,
            atom._NET_DESKTOP_VIEWPORT,
            atom._NET_ACTIVE_WINDOW,
            atom._NET_CLOSE_WINDOW,
            atom._NET_MOVERESIZE_WINDOW
        ];

        const supportedData = new Uint32Array(supportedAtoms.length);
        for (let i = 0; i < supportedAtoms.length; ++i) {
            supportedData[i] = supportedAtoms[i];
        }
        xcb.change_property(owm.wm, { window: owm.root, mode: xcb.propMode.REPLACE,
                                      property: xcb.atom._NET_SUPPORTED, type: xcb.atom.ATOM,
                                      format: 32, data: supportedData });
    }

    updateViewport() {
        const owm = this._owm;
        const xcb = owm.xcb;

        const viewportData = new Uint32Array(2);
        viewportData[0] = 0;
        viewportData[1] = 0;
        xcb.change_property(owm.wm, { window: owm.root, mode: xcb.propMode.REPLACE,
                                      property: xcb.atom._NET_DESKTOP_VIEWPORT, type: xcb.atom.CARDINAL,
                                      format: 32, data: viewportData });
    }

    updateDesktop(client: Client) {
        const ws = client.workspace;
        if (ws) {
            const owm = this._owm;
            const xcb = owm.xcb;

            const desktopData = new Uint32Array(1);
            desktopData[0] = ws.id - 1;
            xcb.change_property(owm.wm, { window: client.window.window, mode: xcb.propMode.REPLACE,
                                          property: xcb.atom._NET_WM_DESKTOP, type: xcb.atom.CARDINAL,
                                          format: 32, data: desktopData });
        }
    }

    clearDesktop(client: Client) {
        const owm = this._owm;
        const xcb = owm.xcb;

        xcb.delete_property(owm.wm, { window: client.window.window, property: xcb.atom._NET_WM_DESKTOP });
    }

    addStateFocused(client: Client) {
        this._add_property_atom(client.window.window, this._owm.xcb.atom._NET_WM_STATE, this._owm.xcb.atom._NET_WM_STATE_FOCUSED);
    }

    removeStateFocused(client: Client) {
        this._remove_property_atom(client.window.window, this._owm.xcb.atom._NET_WM_STATE, this._owm.xcb.atom._NET_WM_STATE_FOCUSED);
    }

    addStateHidden(client: Client) {
        this._add_property_atom(client.window.window, this._owm.xcb.atom._NET_WM_STATE, this._owm.xcb.atom._NET_WM_STATE_HIDDEN);
    }

    removeStateHidden(client: Client) {
        this._remove_property_atom(client.window.window, this._owm.xcb.atom._NET_WM_STATE, this._owm.xcb.atom._NET_WM_STATE_HIDDEN);
    }

    private _add_property_atom(window: number, property: number, atom: number) {
        const owm = this._owm;
        const xcb = owm.xcb;

        const addData = new Uint32Array(1);
        addData[0] = atom;

        xcb.change_property(owm.wm, { window: window, mode: xcb.propMode.APPEND,
                                      property: property, type: xcb.atom.ATOM,
                                      format: 32, data: addData });
    }

    private _remove_property_atom(window: number, property: number, atom: number) {
        const owm = this._owm;
        const xcb = owm.xcb;

        xcb.grab_server(owm.wm);

        try {
            const propdata = xcb.get_property(owm.wm, { window: window, property: property, type: xcb.atom.ATOM });
            if (propdata !== undefined) {
                const buffer = propdata.buffer;
                if (buffer.byteLength % 4) {
                    // bad
                    throw new Error(`get_property bytelength invalid ${buffer.byteLength}`);
                }

                if (buffer.byteLength > 0) {
                    const u32 = new Uint32Array(buffer);
                    const n32 = new Uint32Array(u32.length);
                    let added = 0;
                    for (let i = 0; i < u32.length; ++i) {
                        if (u32[i] !== atom) {
                            n32[added++] = u32[i];
                        }
                    }
                    if (added < u32.length) {
                        // removed
                        xcb.change_property(owm.wm, { window: window, mode: xcb.propMode.REPLACE,
                                                      property: property, type: xcb.atom.ATOM,
                                                      format: 32, data: n32, data_len: added });
                    }
                }
            }
        } catch (e) {
            this._log.error("exception from _remove_property_atom", e);
        }

        xcb.ungrab_server(owm.wm);
    }
}
