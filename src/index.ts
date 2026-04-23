#!/usr/bin/env node

if (process.env.PATH) {
    process.env.PATH = process.env.PATH.split(":")
        .filter((p) => {
        return !/\/owm\//.exec(p) && !/\/npm-lifecycle\//.exec(p);
    })
        .join(":");
}

for (const key in process.env) {
    if (key.startsWith("npm_")) {
        delete process.env[key];
    }
}

import * as xdgBaseDir from "xdg-basedir";
import { default as Options } from "@jhanssen/options";
import { default as native, OWM, XCB } from "native";
import { OWMLib } from "../lib/owm";
import { ConsoleLogger, Logger } from "../lib/logger";
import * as path from "path";
import { createInterface } from "readline";

const options = Options("owm");

function stringOption(key: string): string | undefined {
    const value = options(key);
    if (typeof value === "string") {
        return value;
    }
    return undefined;
}

function parseLogLevel(logLevel: string | undefined, fallbackLog: Logger): Logger.Level {
    if (logLevel === undefined) {
        return Logger.Level.Error;
    }
    switch (logLevel.toLowerCase()) {
        case "debug":
            return Logger.Level.Debug;
        case "info":
            return Logger.Level.Info;
        case "warn":
        case "warning":
            return Logger.Level.Warning;
        case "error":
            return Logger.Level.Error;
        case "fatal":
            return Logger.Level.Fatal;
        default:
            fallbackLog.error("unrecognized log level", logLevel);
            native.stop();
            process.exit();
    }
}

const level = parseLogLevel(stringOption("log"), new ConsoleLogger(Logger.Level.Error));
const log: Logger = new ConsoleLogger(level, "owm");

function loadConfig(dir: string, lib: OWMLib) {
    return new Promise<void>((resolve, reject) => {
        const configPath = path.join(dir, "owm.js");
        const configPathNoExt = path.join(dir, "owm");
        log.info("Loading config from:", configPath);
        import(configPath)
            .catch(() => import(configPathNoExt))
            .catch(() => import(path.join(configPathNoExt, "index.js")))
            .then((cfg) => {
            log.info("Config loaded successfully, calling init");
            cfg.default(lib, options);
            resolve();
        })
            .catch((err) => {
            log.error("Config load error:", err.code, err.message);
            if (
                err.code !== "MODULE_NOT_FOUND" &&
                    err.code !== "ERR_UNSUPPORTED_DIR_IMPORT"
            ) {
                reject({ path: dir, err: err });
            } else {
                log.error("Config not found at:", configPath);
                resolve();
            }
        });
    });
}

process.on("uncaughtException", (err: any) => {
    if (typeof err === "object" && err && err.stack) {
        log.error("Uncaught exception", err.message, err.stack);
    } else {
        log.error("Uncaught exception", err.message);
    }
    let val = options("exit-on-uncaught-exception") || false;
    if (typeof val !== "boolean") {
        val = true;
    }
    if (val) {
        process.exit();
    }
});

let lib: OWMLib;

const configDir = stringOption("config") || xdgBaseDir.config;
if (configDir === undefined) {
    log.error("no config dir");
    process.exit();
}

let display = stringOption("display");
if (display === undefined) {
    if ("DISPLAY" in process.env) {
        display = process.env.DISPLAY;
    }
}

function event(e: OWM.Event) {
    if (e.type == "xcb") {
        lib.handleXCB(e);
    } else if (e.type == "screens" && e.screens) {
        const screens = e.screens;
        lib.updateScreens(screens);
    } else if (e.type === "xkb" && e.xkb === "recreate") {
        lib.recreateKeyBindings();
    }
}

const data = native.start(event, display);
log.info("owm started");

lib = new OWMLib(data.wm, data.xcb, data.xkb, data.graphics, {
    display: display,
    level: level,
    killTimeout: options.int("kill-timeout", 1000),
});

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.setPrompt("owm> ");
rl.on("line", (input) => {
    try {
        log.info(eval(input));
    } catch (err) {
        log.error("Got exception", err);
    }
    rl.prompt();
});
rl.prompt();

if (configDir !== undefined) {
    loadConfig(configDir, lib)
        .then(() => {
        process.nextTick(() => {
            const screens = data.screens;
            lib.updateScreens(screens);

            lib.createMoveGrab();
            lib.bindings.enable();

            const windows = data.windows as XCB.Window[];
            for (const window of windows) {
                if (!window.attributes.override_redirect) {
                    lib.addClient(window, false);
                }
            }

            lib.inited();
        });
    })
        .catch((err) => {
        log.error("error loading module");
        log.error(err);

        native.stop();
        process.exit();
    });
}

lib.events.on("exit", (exitCode?: number) => {
    process.nextTick(() => {
        lib.cleanup();
        native.stop();
        process.exit(exitCode || 0);
    });
});

process.on("SIGINT", () => {
    if (lib) {
        lib.cleanup();
    }
    native.stop();
    process.exit();
});
