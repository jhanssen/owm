import * as WebSocket from "ws";
import { EventEmitter } from "events";
import { createServer } from "http";
import { join } from "path";

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

    constructor(name?: string) {
        this._clients = new Set<WebSocket>();
        this._events = new EventEmitter();

        const httpServer = createServer();
        this._ws = new WebSocket.Server({ server: httpServer });
        const path = join("/tmp", (name || "owm") + ".sock");
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
