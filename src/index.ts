import * as xdgBaseDir from "xdg-basedir";
import { default as Options } from "@jhanssen/options";
import { default as native, OWM, XCB } from "native";
import { OWMLib } from "../lib/owm";
import { Logger } from "../lib/logger";
import * as path from "path";

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
    import(path.join(dir, "owm")).then(cfg => {
        cfg.default(lib);
    }).catch(err => {
        if (err.code !== "MODULE_NOT_FOUND") {
            console.error("error loading module", dir);
            console.error(err);

            native.stop();
            process.exit();
        }
    });
}

let owm: { wm: OWM.WM, xcb: OWM.XCB, xkb: OWM.XKB };
let lib: OWMLib;

function event(e: OWM.Event) {
    //console.log("got event2", e);

    if (e.type == "xcb" && e.xcb) {
        switch (e.xcb.type) {
            case owm.xcb.event.BUTTON_PRESS:
                lib.buttonPress(e.xcb as XCB.ButtonPress);
                break;
            case owm.xcb.event.BUTTON_RELEASE:
                lib.buttonRelease(e.xcb as XCB.ButtonPress);
                break;
            case owm.xcb.event.KEY_PRESS:
                lib.keyPress(e.xcb as XCB.KeyPress);
                break;
            case owm.xcb.event.KEY_RELEASE:
                lib.keyRelease(e.xcb as XCB.KeyPress);
                break;
            case owm.xcb.event.ENTER_NOTIFY:
                lib.enterNotify(e.xcb as XCB.EnterNotify);
                break;
            case owm.xcb.event.LEAVE_NOTIFY:
                lib.leaveNotify(e.xcb as XCB.EnterNotify);
                break;
        }
    } else if (e.type == "windows" && e.windows) {
        const windows = e.windows as XCB.Window[];
        //console.log("got wins", windows);
        for (const window of windows) {
            if (!window.attributes.override_redirect)
                lib.addClient(window);
        }
    } else if (e.type == "screens" && e.screens) {
        lib.updateScreens(e.screens);
    } else if (e.type === "settled") {
        const configDirs = xdgBaseDir.configDirs.slice(0);
        // not sure about cwd() but ok for now
        configDirs.push(path.join(process.cwd(), "config"));

        configDirs.forEach(dir => { loadConfig(dir, lib) });

        lib.bindings.enable();
    } else if (e.type === "xkb" && e.xkb === "recreate") {
        lib.recreateKeyBindings();
    }
}

const display = stringOption("display");

native.start(event, display).then((data: { wm: OWM.WM, xcb: OWM.XCB, xkb: OWM.XKB }) => {
    console.log("owm started");
    owm = data;

    let level = Logger.Level.Warning;
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

    lib = new OWMLib(data.wm, data.xcb, data.xkb, level);
}).catch((err: Error) => {
    console.log("error", err);
    native.stop();
    process.exit();
});

process.on("SIGINT", () => {
    if (lib)
        lib.cleanup();
    native.stop();
    process.exit();
});
