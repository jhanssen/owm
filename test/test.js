/*global xcb*/

const native = require("../native");

console.log("native", native);

const owm = {};

function event(e) {
    console.log("got event", e);

    if (e.type == "xcb") {
        const xcb = e.xcb;
        if (xcb.type === owm.xcb.event.BUTTON_PRESS) {
            const config = {
                window: 0x20000d,
                x: xcb.root_x,
                y: xcb.root_y
            };
            try {
                owm.xcb.configure_window(owm.wm, config);
            } catch (err) {
                console.error(err);
            }
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
