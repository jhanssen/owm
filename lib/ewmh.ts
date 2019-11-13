import { OWMLib } from "./owm";

export class EWMH {
    private _owm: OWMLib;

    constructor(owm: OWMLib) {
        this._owm = owm;
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
        xcb.flush(owm.wm);
    }

    updateWorkarea() {
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
            atom._NET_CLIENT_LIST,
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
        xcb.flush(owm.wm);
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
        xcb.flush(owm.wm);
    }
}
