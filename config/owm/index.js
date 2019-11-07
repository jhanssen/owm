let logger;

function init(owmlib) {
    logger = owmlib.logger.prefixed("config");
    logger.info("hello... adding ctrl-a");

    owmlib.bindings.add("Ctrl+A", (bindings, binding) => {
        logger.info("got", binding);
    });

    owmlib.policy.layout = "tiling";

    owmlib.policy.layout.rows = 2;
    owmlib.policy.layout.columns = 2;

    owmlib.events.on("screens-new", screens => {
        // console.log("got screens?", screens, owmlib.Workspace);
        for (const s of screens) {
            const ws = new owmlib.Workspace(s);
            owmlib.workspaces.add(ws);
        }
    });
    owmlib.events.on("client", client => {
        logger.info("got client");
    });
}

module.exports = init;
