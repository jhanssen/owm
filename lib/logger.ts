function timestamp() {
    const d = new Date();
    let h = d.getHours() + "";
    let m = d.getMinutes() + "";
    let s = d.getSeconds() + "";
    if (h.length === 1)
        h = "0" + h;
    if (m.length === 1)
        m = "0" + m;
    if (s.length === 1)
        s = "0" + s;
    return `[${h}:${m}:${s}]`;
}

export interface Logger
{
    prefixed(prefix: string): Logger;
    debug(...args: any): void;
    info(...args: any): void;
    warn(...args: any): void;
    warning(...args: any): void;
    error(...args: any): void;
    fatal(...args: any): void;
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

export class ConsoleLogger implements Logger
{
    private _level: Logger.Level;
    private _prefix: string | undefined;

    constructor(level: Logger.Level, prefix?: string) {
        this._level = level;
        this._prefix = prefix;
    }

    prefixed(prefix: string) {
        return new ConsoleLogger(this._level, prefix + ":");
    }

    log(level: Logger.Level, ...args: any) {
        if (level > this._level)
            return;
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

    debug(...args: any) {
        this.log(Logger.Level.Debug, ...args);
    }

    info(...args: any) {
        this.log(Logger.Level.Info, ...args);
    }

    warn(...args: any) {
        this.log(Logger.Level.Warning, ...args);
    }

    warning(...args: any) {
        this.log(Logger.Level.Warning, ...args);
    }

    error(...args: any) {
        this.log(Logger.Level.Error, ...args);
    }

    fatal(...args: any) {
        this.log(Logger.Level.Fatal, ...args);
        process.exit();
    }
}
