let logger;

class Bar
{
    constructor(owmlib, x, y) {
        this._owmlib = owmlib;
        this._client = undefined;

        const png = "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";
        const pngBuffer = Buffer.from(png, "base64");

        const monitor = owmlib.monitors.monitorByPosition(x, y);
        const width = monitor.screen.width;

        console.log("bar width", width);
        this._width = width;

        const height = 20;
        this._height = height;

        const xcb = owmlib.xcb;
        const win = xcb.create_window(owmlib.wm, {
            parent: owmlib.root,
            x: 0,
            y: 0,
            width: width,
            height: height
        });
        this._win = win;

        console.log("parent is/was", owmlib.root.toString(16));

        const strutData = new Uint32Array(12);
        strutData[2] = height;
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

        this._pixmap = xcb.create_pixmap(owmlib.wm, { width: width, height: height });
        this._ctx = owmlib.engine.createFromDrawable(owmlib.wm, { drawable: this._pixmap, width: width, height: height });
        this._surface = owmlib.engine.createPNGSurface(this._ctx, pngBuffer);
        this._surfaceSize = owmlib.engine.surfaceSize(this._surface);
        this._surfaceRatio = height / this._surfaceSize.width;

        const black = owmlib.makePixel("#000");
        const white = owmlib.makePixel("#fff");
        this._gc = xcb.create_gc(owmlib.wm, { window: win, values: { foreground: black, background: white, graphics_exposures: 0 } });

        this._dateOptions = {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        };

        this._copyArgs = {
            src_d: this._pixmap,
            dst_d: win,
            gc: this._gc,
            width: this._width,
            height: this._height
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
        xcb.copy_area(this._owmlib.wm, this._copyArgs);
    }

    _redraw() {
        const engine = this._owmlib.engine;
        const txt = (new Date()).toLocaleTimeString("en-US", this._dateOptions);

        engine.setSourceRGB(this._ctx, 1.0, 0.0, 0.0);
        engine.paint(this._ctx);

        engine.save(this._ctx);
        engine.scale(this._ctx, this._surfaceRatio, this._surfaceRatio);
        engine.setSourceSurface(this._ctx, this._surface);
        engine.pathRectangle(this._ctx, 0, 0, this._surfaceSize.width, this._surfaceSize.height);
        engine.fill(this._ctx);
        engine.restore(this._ctx);

        engine.save(this._ctx);
        engine.setSourceRGB(this._ctx, 1.0, 1.0, 1.0);
        engine.translate(this._ctx, this._width / 2, 2);
        engine.textSetText(this._clock, txt);
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
