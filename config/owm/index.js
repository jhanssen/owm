let logger;

class Bar
{
    constructor(owmlib, x, y) {
        this._owmlib = owmlib;
        this._client = undefined;

        const monitor = owmlib.monitors.monitorByPosition(x, y);
        const width = monitor.screen.width;

        console.log("bar width", width);
        this._width = width;

        const xcb = owmlib.xcb;
        const win = xcb.create_window(owmlib.wm, {
            parent: owmlib.root,
            x: 0,
            y: 0,
            width: width,
            height: 20
        });
        this._win = win;

        console.log("parent is/was", owmlib.root.toString(16));

        const strutData = new Uint32Array(12);
        strutData[2] = 20;
        xcb.change_property(owmlib.wm, {
            window: win,
            mode: xcb.propMode.REPLACE,
            property: xcb.atom._NET_WM_STRUT_PARTIAL,
            type: xcb.atom.CARDINAL,
            format: 32, data: strutData
        });

        const windowTypeData = new Uint32Array(1);
        windowTypeData[0] = xcb.atom._NET_WM_WINDOW_TYPE_DOCK;
        xcb.change_property(owmlib.wm, {
            window: win,
            mode: xcb.propMode.REPLACE,
            property: xcb.atom._NET_WM_WINDOW_TYPE,
            type: xcb.atom.ATOM,
            format: 32, data: windowTypeData
        });

        const desktopData = new Uint32Array(1);
        desktopData[0] = 0xffffffff;
        xcb.change_property(owmlib.wm, {
            window: win,
            mode: xcb.propMode.REPLACE,
            property: xcb.atom._NET_WM_DESKTOP,
            type: xcb.atom.CARDINAL,
            format: 32, data: desktopData
        });

        const instanceName = Buffer.from("owmbar");
        const className = Buffer.from("OwmBar");
        const zero = Buffer.alloc(1);
        const wmClass = Buffer.concat([ instanceName, zero, className, zero ]);
        xcb.change_property(owmlib.wm, {
            window: win,
            mode: xcb.propMode.REPLACE,
            property: xcb.atom.WM_CLASS,
            type: xcb.atom.STRING,
            format: 8, data: wmClass
        });

        xcb.flush(owmlib.wm);

        process.nextTick(() => {
            const wininfo = xcb.request_window_information(owmlib.wm, win);
            // console.log("gugug", this._win.toString(16), wininfo);

            owmlib.addClient(wininfo);
        });

        this._pixmap = xcb.create_pixmap(owmlib.wm, { width: width, height: 20 });
        this._ctx = owmlib.engine.createFromDrawable(owmlib.wm, { drawable: this._pixmap, width: width, height: 20 });

        const black = owmlib.makePixel("#000");
        const white = owmlib.makePixel("#fff");
        this._gc = xcb.create_gc(owmlib.wm, { window: win, values: { foreground: black, background: white, graphics_exposures: 0 } });

        this._dateOptions = {
            hour12: false,
            hour:  "2-digit",
            minute: "2-digit",
            second: "2-digit"
        };

        this._clock = owmlib.engine.createText(this._ctx);
        owmlib.engine.textSetFont(this._clock, "Sans Bold 10");

        setInterval(() => {
            this.update();
        }, 1000);
    }

    get client() {
        return this._client;
    }

    set client(c) {
        this._client = c;
    }

    update() {
        this._redraw();

        const owmlib = this._owmlib;
        const client = this._client;
        owmlib.xcb.send_expose(owmlib.wm, { window: client.window.window, width: client.frameWidth, height: client.frameHeight });
    }

    onExpose() {
        const xcb = this._owmlib.xcb;
        xcb.copy_area(this._owmlib.wm, {
            src_d: this._pixmap,
            dst_d: this._client.window.window,
            gc: this._gc,
            src_x: 0,
            src_y: 0,
            dst_x: 0,
            dst_y: 0,
            width: this._width,
            height: 20
        });
    }

    _redraw() {
        const engine = this._owmlib.engine;
        engine.setSourceRGB(this._ctx, 1.0, 0.0, 0.0);
        engine.paint(this._ctx);

        const txt = (new Date()).toLocaleTimeString("en-US", this._dateOptions);
        engine.textSetText(this._clock, txt);
        engine.save(this._ctx);
        engine.translate(this._ctx, this._width / 2, 0);
        engine.setSourceRGB(this._ctx, 1.0, 1.0, 1.0);
        engine.drawText(this._ctx, this._clock);
        engine.restore(this._ctx);
    }
};

function init(owmlib) {
    logger = owmlib.logger.prefixed("config");

    const bar = {};

    owmlib.events.on("inited", () => {
        logger.error("owm inited");

        bar.bar = new Bar(owmlib, 0, 0);
    });

    owmlib.events.on("clientExpose", client => {
        if (bar.bar && client === bar.bar.client) {
            bar.bar.onExpose();
        }
    });

    const mod = "Ctrl";

    // general bindings
    owmlib.bindings.add(`${mod}+Shift+Q`, () => {
        const client = owmlib.findClientUnderCursor();
        if (client) {
            client.kill();
        }
    });

    // workspaces
    for (let i = 1; i < 10; ++i) {
        // switch workspace
        owmlib.bindings.add(`${mod}+Ctrl+${i}`, () => {
            const ws = owmlib.monitors.workspaceById(i);
            if (ws) ws.activate();
        });
        // move to workspace
        owmlib.bindings.add(`${mod}+Shift+${i}`, () => {
            const ws = owmlib.monitors.workspaceById(i);
            const client = owmlib.findClientUnderCursor();
            if (ws && client) client.workspace = ws;
        });
    }

    // launch applications
    owmlib.bindings.add(`${mod}+T`, () => {
        owmlib.launch("terminator");
    });

    owmlib.bindings.add(`${mod}+G`, () => {
        owmlib.launch("google-chrome");
    });

    owmlib.policy.layout = owmlib.policy.createLayout("tiling");
    const cfg = new owmlib.policy.layout.Config();

    cfg.rows = 1;
    cfg.columns = undefined;

    owmlib.policy.layout.config = cfg;

    const ratios = new WeakMap();
    const resizeMode = new owmlib.KeybindingsMode(owmlib, "Resize mode");
    resizeMode.add("Escape", (mode) => {
        logger.info("exit resizeMode");
        mode.exit();
    });
    resizeMode.add("Return", (mode) => {
        logger.info("exit resizeMode");
        mode.exit();
    });
    resizeMode.add("Left", () => {
        // find the current container
        const container = owmlib.findContainerUnderCursor();
        if (container) {
            let ratio = ratios.get(container);
            if (ratio === undefined) {
                ratio = { r: 1 };
                ratios.set(container, ratio);
            }

            if (ratio.r >= 0.5) {
                ratio.r -= 0.1;
                container.layoutPolicy.config.setColumRatio(0, ratio.r);
            }
        }
    });
    resizeMode.add("Right", () => {
        const container = owmlib.findContainerUnderCursor();
        if (container) {
            let ratio = ratios.get(container);
            if (ratio === undefined) {
                ratio = { r: 1 };
                ratios.set(container, ratio);
            }

            if (ratio.r <= 1.5) {
                ratio.r += 0.1;
                container.layoutPolicy.config.setColumRatio(0, ratio.r);
            }
        }
    });
    owmlib.bindings.addMode(`${mod}+Z`, resizeMode);

    owmlib.activeColor = "#33c";
    owmlib.moveModifier = "Ctrl";

    const barMatchClassCondition = new owmlib.Match.MatchWMClass({ class: "OwmBar" });
    const barMatch = new owmlib.Match((client) => {
        bar.bar.client = client;

        const xcb = owmlib.xcb;
        const winMask = xcb.eventMask.ENTER_WINDOW |
              xcb.eventMask.LEAVE_WINDOW |
              xcb.eventMask.EXPOSURE |
              xcb.eventMask.POINTER_MOTION |
              xcb.eventMask.BUTTON_PRESS |
              xcb.eventMask.BUTTON_RELEASE |
              xcb.eventMask.PROPERTY_CHANGE |
              xcb.eventMask.STRUCTURE_NOTIFY |
              xcb.eventMask.FOCUS_CHANGE;

        xcb.change_window_attributes(owmlib.wm, { window: client.window.window, event_mask: winMask });
        bar.bar.update();
    });
    barMatch.addCondition(barMatchClassCondition);
    owmlib.addMatch(barMatch);

    owmlib.events.on("monitors", monitors => {
        // console.log("got screens?", screens, owmlib.Workspace);
        if (monitors.added) {
            for (const [key, monitor] of monitors.added) {
                for (let i = 1; i <= 5; ++i) {
                    const ws = new owmlib.Workspace(owmlib, i);
                    console.log("adding ws for", i);
                    monitor.workspaces.add(ws);
                    if (i === 1) {
                        monitor.workspace = ws;
                    }
                }
            }
        }
    });
    owmlib.events.on("client", client => {
        if (client.workspace || client.ignoreWorkspace)
            return;
        const m = owmlib.monitors.monitorByOutput("default");
        if (!m) {
            throw new Error("no default monitor");
        }
        client.workspace = m.workspace;
    });
}

module.exports = init;
