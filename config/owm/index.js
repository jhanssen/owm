let logger;

function init(owmlib) {
    logger = owmlib.logger.prefixed("config");
    logger.info("hello... adding ctrl-a");

    owmlib.bindings.add("Ctrl+A", (bindings, binding) => {
        logger.info("got", binding);
    });

    owmlib.policy.layout = owmlib.policy.createLayout("tiling");
    const cfg = new owmlib.policy.layout.Config();

    cfg.rows = 2;
    cfg.columns = undefined;

    owmlib.policy.layout.setConfig(cfg);

    owmlib.activeColor = "#33c";

    const xtermMatchCondition = new owmlib.Match.MatchWMClass({ class: "XTerm" });
    const xtermMatch = new owmlib.Match((client) => {
        console.log("got an xterm");
    });
    xtermMatch.addCondition(xtermMatchCondition);
    owmlib.addMatch(xtermMatch);

    owmlib.events.on("screens", screens => {
        // console.log("got screens?", screens, owmlib.Workspace);
        if (screens.added) {
            for (const s of screens.added) {
                const ws = new owmlib.Workspace(owmlib, s);
                owmlib.workspaces.add(ws);
            }
        }
    });
    owmlib.events.on("client", client => {
        logger.info("got client");
        const ws = owmlib.workspaces.workspaceByOutput("default");
        if (!ws) {
            throw new Error("no default workspace");
        }
        ws.addItem(client);
    });
}

module.exports = init;
