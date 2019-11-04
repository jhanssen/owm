function init(owmlib) {
    console.log("hello... adding ctrl-a");

    owmlib.bindings.add("Ctrl+A", (bindings, binding) => {
        console.log("got", binding);
    });
}

module.exports = init;
