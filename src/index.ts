import * as xdgBaseDir from "xdg-basedir";
import { default as Options } from "@jhanssen/options";
import { default as native, OWM, XCB } from "native";
import { OWMLib } from "../lib/owm";
import * as path from "path";

const options = Options("owm");

function loadConfig(dir: string)
{
    import(path.join(dir, "owm")).then(cfg => {
        cfg({});
    }).catch(() => {});
}

xdgBaseDir.configDirs.forEach(dir => { loadConfig(dir) });

console.log("faff", native);

let owm: { wm: OWM.WM, xcb: OWM.XCB };
let lib: OWMLib;

function event(e: OWM.Event) {
    //console.log("got event2", e);

    /*
    if (e.type == "xcb" && e.xcb) {
        if (e.xcb.type === owm.xcb.event.BUTTON_PRESS) {
            const press = e.xcb as XCB.ButtonPress;
            const config = {
                window: 0x20000d,
                x: press.root_x,
                y: press.root_y
            };
            try {
                owm.xcb.configure_window(owm.wm, config);
            } catch (err) {
                console.error(err);
            }
        }
    }
    */
    if (e.type == "windows" && e.windows) {
        const windows = e.windows as XCB.Window[];
        //console.log("got wins", windows);
        for (const window of windows) {
            if (!window.override_redirect)
                lib.addClient(window);
        }
    }
}

native.start(event).then((data: { wm: OWM.WM, xcb: OWM.XCB }) => {
    console.log("started", data);
    owm = data;
    lib = new OWMLib(data.wm);
}).catch((err: Error) => {
    console.log("error", err);
});
