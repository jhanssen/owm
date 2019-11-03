import * as xdgBaseDir from "xdg-basedir";
import { default as Options } from "@jhanssen/options";
import { default as native, Data as OwmData, Event as OwmEvent, XCB } from "../native";
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

let owm: OwmData;

function event(e: OwmEvent) {
    console.log("got event", e);

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
}

native.start(event).then((data: OwmData) => {
    console.log("started", data);
    owm = data;
}).catch((err: Error) => {
    console.log("error", err);
});
