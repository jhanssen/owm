import * as WebSocket from "ws";
import { EventEmitter } from "events";
import { createServer } from "http";
import { join } from "path";
import { unlinkSync } from "fs";
import { OWMLib, Logger } from ".";

export interface IPCMessage
{
    type: string;
    payload: any;
    reply: (type: string, payload?: any) => void;
    close: () => void;
}

export class IPC
{
    private _events: EventEmitter;
    private _ws: WebSocket.Server;
    private _clients: Set<WebSocket>;
    private _log: Logger;

    constructor(owm: OWMLib, name: string | undefined, display: string | undefined) {
        this._clients = new Set<WebSocket>();
        this._events = new EventEmitter();
        this._log = owm.logger.prefixed("ipc");

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
                let message: any;
                try {
                    message = JSON.parse(msg);
                    if (typeof message.type !== 'string') {
                        throw new Error("Missing type");
                    }
                } catch (err) {
                    this._log.error("Got error parsing message", msg, err);
                    ws.send(`{ \"type\": \"error\", \"error\": ${err}`);
                    ws.removeAllListeners();
                    ws.close();
                    this._clients.delete(ws);
                    return;
                }
                this._events.emit("message", {
                    type: message.type,
                    payload: message.payload,
                    reply: (t: string, p: any) => {
                        if (this._clients.has(ws)) {
                            ws.send(JSON.stringify({type: t, payload: p}));
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
