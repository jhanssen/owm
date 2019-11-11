let logger;

function init(owmlib) {
    logger = owmlib.logger.prefixed("config");
    logger.info("hello... adding ctrl-a");

    owmlib.bindings.add("Ctrl+A", (bindings, binding) => {
        //logger.info("got", binding);
        // activate workspace 1
        const ws = owmlib.monitors.workspaceById(1);
        if (!ws) {
            throw new Error("no workspace 1");
        }
        ws.monitor.workspace = ws;
    });

    owmlib.bindings.add("Ctrl+B", (bindings, binding) => {
        //logger.info("got", binding);
        // activate workspace 2
        const ws = owmlib.monitors.workspaceById(2);
        if (!ws) {
            throw new Error("no workspace 2");
        }
        ws.monitor.workspace = ws;
    });

    owmlib.bindings.add("Ctrl+T", () => {
        owmlib.launch("terminator");
    });

    owmlib.policy.layout = owmlib.policy.createLayout("tiling");
    const cfg = new owmlib.policy.layout.Config();

    cfg.rows = 2;
    cfg.columns = undefined;

    owmlib.policy.layout.setConfig(cfg);

    owmlib.activeColor = "#33c";
    owmlib.moveModifier = "Ctrl";

    const xtermMatchCondition = new owmlib.Match.MatchWMClass({ class: "XTerm" });
    const xtermMatch = new owmlib.Match((client) => {
        console.log("got an xterm, adding to ws 2");
        const ws = owmlib.monitors.workspaceById(2);
        if (!ws) {
            throw new Error("no workspace 2");
        }
        ws.addItem(client);
    });
    xtermMatch.addCondition(xtermMatchCondition);
    owmlib.addMatch(xtermMatch);

    owmlib.events.on("monitors", monitors => {
        // console.log("got screens?", screens, owmlib.Workspace);
        if (monitors.added) {
            for (const [key, monitor] of monitors.added) {
                const ws1 = new owmlib.Workspace(owmlib, monitor, 1);
                monitor.workspaces.add(ws1);
                monitor.workspace = ws1;

                const ws2 = new owmlib.Workspace(owmlib, monitor, 2);
                monitor.workspaces.add(ws2);
            }
        }
    });
    owmlib.events.on("client", client => {
        logger.info("got client");
        if (client.workspace)
            return;
        const m = owmlib.monitors.monitorByOutput("default");
        if (!m) {
            throw new Error("no default workspace");
        }
        m.workspace.addItem(client);
    });
}

module.exports = init;
