import { Client } from "./client";
import { OWMLib } from "./owm";
import { Logger } from "./logger";
import { LayoutPolicy } from "./policy/layout";
import { Geometry } from "./utils";

export class Container
{
    private _clients: Client[];
    private _layout: LayoutPolicy;
    private _geometry: Geometry;
    private _log: Logger;

    constructor(owm: OWMLib, geom: Geometry = {} as Geometry) {
        this._clients = [];
        this._layout = owm.policy.layout;
        this._geometry = geom;
        this._log = owm.logger.prefixed("Container");
    }

    get layout() {
        return this._layout;
    }

    get geometry() {
        return this._geometry;
    }

    set geometry(g: Geometry) {
        this._geometry = g;
    }

    set layout(policy: LayoutPolicy) {
        this._layout = policy;
    }

    addClient(client: Client) {
        if (this._clients.indexOf(client) !== -1) {
            throw new Error("client already exists");
        }
        this._log.info("got new client");
        this._clients.push(client)
        this.relayout();
    }

    removeClient(client: Client) {
        const idx = this._clients.indexOf(client);
        if (idx === -1) {
            throw new Error("client doesn't exist");
        }
        this._clients.splice(idx, 1);
        this.relayout();
    }

    relayout() {
        if (!this._layout)
            return;
        this._layout.layout(this._clients, this._geometry);
    }
}
