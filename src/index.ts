import * as xdgBaseDir from "xdg-basedir";
import { default as Options } from "@jhanssen/options";
import { default as native, OWM, XCB } from "native";
import { OWMLib } from "../lib/owm";
import * as path from "path";

const options = Options("owm");

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

let owm: { wm: OWM.WM, xcb: OWM.XCB };
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
    }
}

native.start(event).then((data: { wm: OWM.WM, xcb: OWM.XCB }) => {
    console.log("started", data);
    owm = data;
    lib = new OWMLib(data.wm, data.xcb);
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
