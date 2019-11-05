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
}

module.exports = init;
