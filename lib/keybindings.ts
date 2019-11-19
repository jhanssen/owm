import { OWMLib } from "./owm";
import { Logger } from "./logger";
import { XCB } from "native";
import { EventEmitter } from "events";

class Keybinding
{
    private _owm: OWMLib;
    private _binding: string;
    private _sym: number;
    private _mods: number;
    private _mode: number;
    private _codes: number[];
    private _callback: (bindings: Keybindings, binding: string) => void;

    constructor(owm: OWMLib, binding: string, callback: (bindings: Keybindings, binding: string) => void, sync?: boolean) {
        this._owm = owm;
        this._binding = binding;
        this._callback = callback;
        this._sym = 0;
        this._mods = 0;
        this._codes = [];

        this._mode = sync ? owm.xcb.grabMode.SYNC : owm.xcb.grabMode.ASYNC;

        this.parse();
    }

    get binding() {
        return this._binding;
    }

    get codes() {
        return this._codes;
    }

    get mods() {
        return this._mods;
    }

    get mode() {
        return this._mode;
    }

    get sym() {
        return this._sym;
    }

    call(bindings: Keybindings) {
        this._callback(bindings, this._binding);
    }

    recreate() {
        if (this._sym === 0)
            return;
        this._codes = this._owm.xcb.key_symbols_get_keycode(this._owm.wm, this._sym);
    }

    private parse() {
        this._mods = 0;
        this._sym = 0;

        let mods = 0;

        // format is "Shift+Ctrl+A"
        const keys = this._binding.split("+");
        // only the last element of the array is a key, the rest are modifiers
        if (keys.length > 1) {
            const mask = this._owm.xcb.modMask;
            for (let i = 0; i < keys.length - 1; ++i) {
                switch (keys[i].toLowerCase()) {
                    case "shift":
                        mods |= mask.SHIFT;
                        break;
                    case "ctrl":
                    case "control":
                        mods |= mask.CONTROL;
                        break;
                    case "mod1":
                    case "alt":
                        mods |= mask["1"];
                        break;
                    case "mod2":
                        mods |= mask["2"];
                        break;
                    case "mod3":
                        mods |= mask["3"];
                        break;
                    case "mod4":
                        mods |= mask["4"];
                        break;
                    case "mod5":
                        mods |= mask["5"];
                        break;
                    case "lock":
                        mods |= mask.LOCK;
                        break;
                    default:
                        throw new Error("Couldn't parse keybinding mask");
                }
            }
        }

        const key = keys[keys.length - 1];
        const sym = this._owm.xkb.keysym_from_name(key);
        if (sym === undefined) {
            throw new Error(`Couldn't get keybinding from name (${this._binding})`);
        }

        this._sym = sym;
        this._mods = mods;
    }
}

export class KeybindingsMode extends EventEmitter
{
    private _parent: Keybindings;
    private _bindings: Map<string, Keybinding>;
    private _name: string | undefined;
    private _matchModifiers: boolean;

    constructor(owm: OWMLib, name?: string, match?: boolean) {
        super();

        this._parent = owm.bindings;
        this._bindings = new Map<string, Keybinding>();
        this._name = name;
        this._matchModifiers = (match === undefined || match === true);
    }

    get bindings() {
        return this._bindings;
    }

    get name() {
        return this._name;
    }

    get matchModifiers() {
        return this._matchModifiers;
    }

    add(binding: string, callback: (mode: KeybindingsMode, binding: string) => void) {
        const keybinding = new Keybinding(this._parent.owm, binding, (bindings: Keybindings, binding: string) => {
            callback(this, binding);
        }, false);
        keybinding.recreate();
        this._bindings.set(binding, keybinding);
    }

    addMode(binding: string, mode: KeybindingsMode) {
        this._parent.registerMode(mode);
        const keybinding = new Keybinding(this._parent.owm, binding, (bindings: Keybindings, binding: string) => {
            try {
                this._parent.enterMode(mode);
            } catch (e) {
                this._parent.owm.xcb.allow_events(this._parent.owm.wm, { mode: this._parent.owm.xcb.allow.ASYNC_KEYBOARD,
                                                                         time: this._parent.owm.currentTime });
                throw e;
            }
            this._parent.owm.xcb.allow_events(this._parent.owm.wm, { mode: this._parent.owm.xcb.allow.ASYNC_KEYBOARD,
                                                                     time: this._parent.owm.currentTime });
        }, true);
        keybinding.recreate();
        this._bindings.set(binding, keybinding);
    }

    exit() {
        this._parent.exitMode(this);
    }

    recreate() {
        for (const [key, keybinding] of this._bindings) {
            keybinding.recreate();
        }
    }
}

export class Keybindings
{
    private _owm: OWMLib;
    private _bindings: Map<string, Keybinding>;
    private _enteredModes: KeybindingsMode[];
    private _allModes: Set<KeybindingsMode>;
    private _enabled: boolean;
    private _log: Logger;

    constructor(owm: OWMLib) {
        this._owm = owm;
        this._bindings = new Map<string, Keybinding>();
        this._enabled = false;
        this._log = owm.logger.prefixed("Keybindings");
        this._enteredModes = [];
        this._allModes = new Set<KeybindingsMode>();
    }

    get owm() {
        return this._owm;
    }

    add(binding: string, callback: (bindings: Keybindings, binding: string) => void) {
        this._add(binding, callback, false);
    }

    addMode(binding: string, mode: KeybindingsMode) {
        this._allModes.add(mode);
        this._add(binding, (bindings: Keybindings, binding: string) => {
            this.enterMode(mode);
            this._owm.xcb.allow_events(this._owm.wm, { mode: this._owm.xcb.allow.ASYNC_KEYBOARD, time: this._owm.currentTime });
        }, true);
    }

    enterMode(mode: KeybindingsMode) {
        const match = mode.matchModifiers;
        for (const [str, binding] of mode.bindings) {
            if (match && this._hasSym(binding.sym, binding.mods))
                continue;

            const codes = binding.codes;
            if (!codes.length)
                return;
            const mods = binding.mods;
            const mode = binding.mode;
            const grabMode = this._owm.xcb.grabMode;
            for (let code of codes) {
                if (match) {
                    this._owm.xcb.grab_key(this._owm.wm, { window: this._owm.root, owner_events: 1, modifiers: mods,
                                                           key: code, pointer_mode: grabMode.ASYNC, keyboard_mode: mode });
                } else {
                    const mask = this._owm.xcb.modMask;
                    this._owm.xcb.grab_key(this._owm.wm, { window: this._owm.root, owner_events: 1, modifiers: mask.ANY,
                                                           key: code, pointer_mode: grabMode.ASYNC, keyboard_mode: mode });
                }
            }
        }

        this._enteredModes.push(mode);

        mode.emit("entered");
        this._owm.events.emit("enterMode", mode);
    }

    exitMode(mode: KeybindingsMode) {
        if (!this._enteredModes.length || this._enteredModes[this._enteredModes.length - 1] !== mode) {
            throw new Error("Can't exit mode, current mode is not this mode");
        }

        this._enteredModes.pop();

        if (mode.matchModifiers) {
            for (const [str, binding] of mode.bindings) {
                if (this._hasSym(binding.sym, binding.mods))
                    continue;

                const mods = binding.mods;
                for (let code of binding.codes) {
                    this._owm.xcb.ungrab_key(this._owm.wm, { key: code, window: this._owm.root, modifiers: mods });
                }
            }
        } else {
            // let's ditch everything and regrab all
            this._unbind();
            this._rebind();
        }

        this._owm.events.emit("exitMode", mode);
        mode.emit("exited");
    }

    registerMode(mode: KeybindingsMode) {
        this._allModes.add(mode);
    }

    has(binding: string): boolean {
        return this._bindings.has(binding);
    }

    enable() {
        this._enabled = true;
        this._unbind();
        this._rebind();
    }

    disable() {
        this._enabled = false;
        this._unbind();
    }

    recreate() {
        this._recreate();
        this._unbind();
        this._rebind();
    }

    rebind() {
        this._rebind();
    }

    feed(press: XCB.KeyPress) {
        this._log.debug("feed", press, this._enabled);

        if (!this._enabled)
            return;

        const mode: KeybindingsMode | undefined = this._enteredModes.length > 0 ? this._enteredModes[this._enteredModes.length - 1] : undefined;
        const bindings = mode ? mode.bindings : this._bindings;
        const match = mode ? mode.matchModifiers : true;

        for (const [key, keybinding] of bindings) {
            //console.log("cand. binding", keybinding);
            if (press.sym === keybinding.sym && (!match || press.state === keybinding.mods)) {
                keybinding.call(this);
            }
        }
    }

    private _add(binding: string, callback: (bindings: Keybindings, binding: string) => void, sync: boolean) {
        const keybinding = new Keybinding(this._owm, binding, callback, sync);

        keybinding.recreate();

        this._log.debug("adding", binding, sync);

        if (this._enabled && !this.has(binding)) {
            const codes = keybinding.codes;
            if (!codes.length)
                return;
            const mods = keybinding.mods;
            const mode = keybinding.mode;
            const grabMode = this._owm.xcb.grabMode;
            this._log.debug("codes", codes, mods, mode);
            for (let code of codes) {
                this._log.debug("really add", this._owm.root, code);
                this._owm.xcb.grab_key(this._owm.wm, { window: this._owm.root, owner_events: 1, modifiers: mods,
                                                       key: code, pointer_mode: grabMode.ASYNC, keyboard_mode: mode });
            }
        }

        this._bindings.set(binding, keybinding);
    }

    private _recreate() {
        for (const mode of this._allModes) {
            mode.recreate();
        }
        for (const [key, keybinding] of this._bindings) {
            keybinding.recreate();
        }
    }

    private _unbind() {
        this._log.debug("unbind", this._owm.root);
        this._owm.xcb.ungrab_key(this._owm.wm, { key: this._owm.xcb.grabAny, window: this._owm.root, modifiers: this._owm.xcb.buttonMask.ANY });
    }

    private _rebind() {
        this._log.debug("rebind");

        const rebindBindings = (bindings: Map<string, Keybinding>) => {
            for (const [key, keybinding] of bindings) {
                const codes = keybinding.codes;
                if (!codes.length)
                    return;
                const mods = keybinding.mods;
                const mode = keybinding.mode;
                const grabMode = this._owm.xcb.grabMode;

                this._log.debug("rebind root", this._owm.root, mods, codes);
                //this._owm.xcb.grab_key(this._owm.wm,
                for (let code of codes) {
                    this._owm.xcb.grab_key(this._owm.wm, { window: this._owm.root, owner_events: 1, modifiers: mods,
                                                           key: code, pointer_mode: grabMode.ASYNC, keyboard_mode: mode });
                }
            }
        };
        for (const mode of this._enteredModes) {
            rebindBindings(mode.bindings);
        }
        rebindBindings(this._bindings);
    }

    private _hasSym(sym: number, mods: number) {
        for (const m of this._enteredModes) {
            for (const [s, k] of m.bindings) {
                if (k.sym === sym && k.mods === mods)
                    return true;
            }
        }
        for (const [s, k] of this._bindings) {
            if (k.sym === sym && k.mods === mods)
                return true;
        }
        return false;
    }
}
