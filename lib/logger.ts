import { format } from "util";
import fs from "fs";

function timestamp() {
    const d = new Date();
    let h = String(d.getHours());
    let m = String(d.getMinutes());
    let s = String(d.getSeconds());
    if (h.length === 1) {
        h = "0" + h;
    }
    if (m.length === 1) {
        m = "0" + m;
    }
    if (s.length === 1) {
        s = "0" + s;
    }
    return `[${h}:${m}:${s}]`;
}

export interface Logger
{
    prefixed(prefix: string): Logger;
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    warning(...args: unknown[]): void;
    error(...args: unknown[]): void;
    fatal(...args: unknown[]): void;
    file(...args: unknown[]): void;
}

export namespace Logger
{
    export enum Level {
        Fatal,
        Error,
        Warning,
        Info,
        Debug
    }
}

export class ConsoleLogger implements Logger {
    private _level: Logger.Level;
    private _prefix: string | undefined;

    constructor(level: Logger.Level, prefix?: string) {
        this._level = level;
        this._prefix = prefix;
    }

    prefixed(prefix: string) {
        return new ConsoleLogger(this._level, prefix + ":");
    }

    log(level: Logger.Level, ...args: unknown[]) {
        if (level > this._level) {
            return;
        }
        if (level >= Logger.Level.Error) {
            if (this._prefix) {
                console.error(timestamp(), this._prefix, ...args);
            } else {
                console.error(timestamp(), ...args);
            }
        } else {
            if (this._prefix) {
                console.log(timestamp(), this._prefix, ...args);
            } else {
                console.log(timestamp(), ...args);
            }
        }
    }

    debug(...args: unknown[]) {
        this.log(Logger.Level.Debug, ...args);
    }

    info(...args: unknown[]) {
        this.log(Logger.Level.Info, ...args);
    }

    warn(...args: unknown[]) {
        this.log(Logger.Level.Warning, ...args);
    }

    warning(...args: unknown[]) {
        this.log(Logger.Level.Warning, ...args);
    }

    error(...args: unknown[]) {
        this.log(Logger.Level.Error, ...args);
    }

    fatal(...args: unknown[]) {
        this.log(Logger.Level.Fatal, ...args);
        process.exit();
    }

    file(...args: unknown[]) {
        const first = args.shift() || "";
        fs.appendFileSync("/tmp/owm.log", format(first, ...args, "\n"));
    }
}

