import { Client } from "./client";

export interface MatchCondition
{
    match(client: Client): boolean;
};

export class MatchWMClass implements MatchCondition
{
    private _instance?: string;
    private _class?: string;

    constructor(obj: { instance?: string, class?: string }) {
        this._instance = obj.instance;
        this._class = obj.class;
    }

    match(client: Client) {
        if (!this._instance && !this._class)
            return false;
        if (this._instance && client.window.wmClass.instance_name !== this._instance)
            return false;
        if (this._class && client.window.wmClass.class_name !== this._class)
            return false;
        return true;
    }
}

export class Match
{
    private _conditions: MatchCondition[];
    private _callback: (client: Client) => void;

    public static readonly MatchWMClass = MatchWMClass;

    constructor(callback: (client: Client) => void) {
        this._callback = callback;
        this._conditions = [];
    }

    addCondition(cond: MatchCondition) {
        this._conditions.push(cond);
    }

    match(client: Client) {
        if (!this._conditions.length)
            return;

        for (const cond of this._conditions) {
            if (!cond.match(client))
                return;
        }

        this._callback(client);
    }
}
