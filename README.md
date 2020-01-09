# owm
A window manager written in typescript / node

## Configuration
Configuration is read from `~/.config/owm/index.js`

The config file should export one function with the signature `function(owmlib, options) {}` where owmlib contains the owm API and options is an object where the command line arguments are available.

### owm API
#### keybinds
`owmlib.bindings.add(binding, callback)`
#### key modes
`const mode = new owmlib.KeybindingsMode(owmlib, name)`

`mode.add(binding, callback)`

`owmlib.bindings.addMode(binding, mode)`

Call `mode.exit()` in a mode callback when you want to exit the mode
#### events
`owmlib.events.on("client", callback)`
called when a new client has been added

`owmlib.events.on("monitors", callback)`
called when the list of monitors has changed

`owmlib.events.on("inited", callback)`
called when owmlib has been fully initialized and is ready to go

## bar
![minibar](https://user-images.githubusercontent.com/381040/72105073-a970e500-32e1-11ea-930d-bc47701921b3.png)
