import { Client } from "./client";

export interface MatchCondition
{
    match(client: Client): boolean;
}

export class MatchWMClass implements MatchCondition {
    private _instance?: string;
    private _class?: string;

    constructor(obj: { instance?: string, class?: string }) {
        this._instance = obj.instance;
        this._class = obj.class;
    }

    match(client: Client) {
        if (!this._instance && !this._class) {
return false;
}
        if (this._instance && client.window.wmClass.instance_name !== this._instance) {
return false;
}
        if (this._class && client.window.wmClass.class_name !== this._class) {
return false;
}
        return true;
    }
}

export class MatchWMName implements MatchCondition {
    private _name: string;

    constructor(name: string) {
        this._name = name;
    }

    match(client: Client) {
        return (client.window.ewmhName === this._name
                || client.window.wmName === this._name);
    }
}

export class Match {
    private _conditions: MatchCondition[];
    private _callback: (client: Client) => void;
    private _type: Match.MatchType;

    public static readonly MatchWMClass = MatchWMClass;
    public static readonly MatchWMName = MatchWMName;

    constructor(callback: (client: Client) => void, type?: Match.MatchType) {
        this._callback = callback;
        this._conditions = [];
        this._type = (type === undefined) ? Match.MatchType.And : type;
    }

    addCondition(cond: MatchCondition) {
        this._conditions.push(cond);
    }

    match(client: Client) {
        if (!this._conditions.length) {
return;
}

        const and = this._type === Match.MatchType.And;

        for (const cond of this._conditions) {
            const m = cond.match(client);
            if (and && !m) {
                return;
            } if (!and && m) {
                this._callback(client);
                return;
            }
        }

        if (and) {
            this._callback(client);
        }
    }
}

export namespace Match {
    export enum MatchType {
        And,
        Or
    }
}
