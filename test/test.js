/*global xcb*/

const native = require("../native");

console.log("native", native);

const owm = {};

function event(e) {
    console.log("got event", e);

    if (e.type === 4) { // release
        const config = {
            window: 0x400007,
            x: e.root_x,
            y: e.root_y
        };
        try {
            owm.xcb.configure_window(owm.wm, config);
        } catch (e) {
            console.error(e);
        }
    }
}

native.start(event).then(xcb => {
    console.log("started", xcb);
    owm.wm = xcb.wm;
    owm.xcb = xcb.xcb;
}).catch(err => {
    console.log("error", err);
});
