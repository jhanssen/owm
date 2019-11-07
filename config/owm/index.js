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
    cfg.columns = 2;

    owmlib.policy.layout.setConfig(cfg);

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
        ws.addClient(client);
    });
}

module.exports = init;
