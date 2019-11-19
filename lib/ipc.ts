import * as WebSocket from "ws";
import { EventEmitter } from "events";
import { createServer } from "http";
import { join } from "path";
import { unlinkSync } from "fs";

export interface IPCMessage
{
    message: string;
    reply: (message: string) => void;
    close: () => void;
}

export class IPC
{
    private _events: EventEmitter;
    private _ws: WebSocket.Server;
    private _clients: Set<WebSocket>;

    constructor(name: string | undefined, display: string | undefined) {
        this._clients = new Set<WebSocket>();
        this._events = new EventEmitter();

        let rdisplay = display;
        if (rdisplay === undefined) {
            rdisplay = ":0";
        }
        const eq = rdisplay.lastIndexOf(":");
        if (eq !== 0) {
            // yeah yeah, we don't support remote displays around these parts
            throw new Error(`invalid ipc display ${rdisplay}`);
        }

        const httpServer = createServer();
        this._ws = new WebSocket.Server({ server: httpServer });
        const fn = (name || "owm") + "." + rdisplay.substr(eq + 1) + ".sock";
        const path = join("/tmp", fn);

        // we'd never have gotten this far without any old owm instances
        // so just go ahead and unlink the socket file if it exists
        try {
            unlinkSync(path);
        } catch (err) {
        }

        httpServer.listen(path);

        this._ws.on("connection", (ws: WebSocket) => {
            this._clients.add(ws);

            ws.on("message", (msg: string) => {
                this._events.emit("message", {
                    message: msg,
                    reply: (r: string) => {
                        if (this._clients.has(ws)) {
                            ws.send(r);
                        } else {
                            throw new Error("socket closed");
                        }
                    },
                    close: () => {
                        ws.removeAllListeners();
                        ws.close();
                        this._clients.delete(ws);
                    }
                });
            });

            ws.on("error", () => {
                // take the thing out
                ws.removeAllListeners();
                this._clients.delete(ws);
            });

            ws.on("close", () => {
                // take the thing out
                ws.removeAllListeners();
                this._clients.delete(ws);
            });
        });
    }

    get events() {
        return this._events;
    }
}
