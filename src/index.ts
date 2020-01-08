#!/usr/bin/env node

if (process.env.PATH) {
    process.env.PATH = process.env.PATH.split(":").filter(p => {
        return !/\/owm\//.exec(p) && !/\/npm-lifecycle\//.exec(p);
    }).join(":");
}

import * as xdgBaseDir from "xdg-basedir";
import { default as Options } from "@jhanssen/options";
import { default as native, OWM, XCB } from "native";
import { OWMLib } from "../lib/owm";
import { Logger } from "../lib/logger";
import * as path from "path";
import { createInterface } from "readline";

const options = Options("owm");

function stringOption(key: string): string | undefined
{
    const value = options(key);
    if (typeof value === "string") {
        return value;
    }
    return undefined;
}

function loadConfig(dir: string, lib: OWMLib)
{
    return new Promise<void>((resolve, reject) => {
        import(path.join(dir, "owm")).then(cfg => {
            cfg.default(lib, options);
            resolve();
        }).catch(err => {
            if (err.code !== "MODULE_NOT_FOUND") {
                reject({ path: dir, err: err });
            } else {
                resolve();
            }
        });
    });
}

process.on('uncaughtException', (err: any) => {
    if (typeof err === 'object' && err && err.stack) {
        console.error("Uncaught exception", err.message, err.stack);
    } else {
        console.error("Uncaught exception", err.message);
    }
    let val = options("exit-on-uncaught-exception") || false
    if (typeof val !== 'boolean')
        val = true;
    if (val)
        process.exit();
});

let lib: OWMLib;

const configDir = stringOption("config") || xdgBaseDir.config;
if (configDir === undefined) {
    console.error("no config dir");
    process.exit();
}

let display = stringOption("display");
if (display === undefined) {
    // read from env
    if ("DISPLAY" in process.env) {
        display = process.env.DISPLAY;
    }
}

function event(e: OWM.Event) {
    // console.log("got event2", e);

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
console.log("owm started");

let level = Logger.Level.Error;
const logLevel = stringOption("log");
if (logLevel !== undefined) {
    switch (logLevel.toLowerCase()) {
        case "debug":
            level = Logger.Level.Debug;
            break;
        case "info":
            level = Logger.Level.Info;
            break;
        case "warn":
        case "warning":
            level = Logger.Level.Warning;
            break;
        case "error":
            level = Logger.Level.Error;
            break;
        case "fatal":
            level = Logger.Level.Fatal;
            break;
        default:
            console.log("unrecognized log level", logLevel);
            native.stop();
            process.exit();
            break;
    }
}

lib = new OWMLib(data.wm, data.xcb, data.xkb, data.graphics, {
    display: display,
    level: level,
    killTimeout: options.int("kill-timeout", 1000)
});

global.owm = lib;

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.setPrompt("owm> ");
rl.on('line', input => {
    try {
        console.log(eval(input));
    } catch (err) {
        console.error("Got exception", err);
    }
    rl.prompt();
});
rl.prompt();

if (configDir !== undefined) {
    loadConfig(configDir, lib).then(() => {
        process.nextTick(() => {
            const screens = data.screens;
            lib.updateScreens(screens);

            lib.createMoveGrab();
            lib.bindings.enable();

            const windows = data.windows as XCB.Window[];
            //console.log("got wins", windows);
            for (const window of windows) {
                if (!window.attributes.override_redirect)
                    lib.addClient(window, false);
            }

            lib.inited();
        });
    }).catch(err => {
        console.error("error loading module");
        console.error(err);

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
    if (lib)
        lib.cleanup();
    native.stop();
    process.exit();
});
