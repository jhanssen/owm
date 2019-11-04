export class Logger
{
    private _level: Logger.Level;
    private _prefix: string | undefined;

    constructor(level: Logger.Level, prefix?: string) {
        this._level = level;
        this._prefix = prefix;
    }

    prefixed(prefix: string) {
        return new Logger(this._level, prefix + ":");
    }

    log(level: Logger.Level, ...args: any) {
        if (level > this._level)
            return;
        if (level >= Logger.Level.Error) {
            if (this._prefix) {
                console.error(this._prefix, ...args);
            } else {
                console.error(...args);
            }
        } else {
            if (this._prefix) {
                console.log(this._prefix, ...args);
            } else {
                console.log(...args);
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
