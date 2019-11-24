let logger;

function init(owmlib) {
    logger = owmlib.logger.prefixed("config");

    const bar = {};

    owmlib.events.on("inited", () => {
        logger.error("owm inited");

        bar.bar = new owmlib.Bar(owmlib, "default", {
            backgroundColor: "#333",
            modules: {
                clock: {
                    position: owmlib.Bar.Position.Middle,
                    config: {
                        textColor: "#888"
                    }
                }
            }
        });
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
