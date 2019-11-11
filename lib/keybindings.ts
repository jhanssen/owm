import { OWMLib } from "./owm";
import { Logger } from "./logger";
import { XCB } from "native";

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
            throw new Error("Couldn't get keybinding from name");
        }

        this._sym = sym;
        this._mods = mods;
    }
}

export class KeybindingsMode
{
    private _parent: Keybindings;
    private _bindings: Map<string, Keybinding>;

    constructor(owm: OWMLib) {
        this._parent = owm.bindings;
        this._bindings = new Map<string, Keybinding>();
    }

    get bindings() {
        return this._bindings;
    }

    add(binding: string, callback: (mode: KeybindingsMode, binding: string) => void) {
        const keybinding = new Keybinding(this._parent.owm, binding, (bindings: Keybindings, binding: string) => {
            callback(this, binding);
        }, false);
        keybinding.recreate();
        this._bindings.set(binding, keybinding);
    }

    addMode(binding: string, mode: KeybindingsMode) {
        const keybinding = new Keybinding(this._parent.owm, binding, (bindings: Keybindings, binding: string) => {
            this._parent.enterMode(mode);
            this._parent.owm.xcb.allow_events(this._parent.owm.wm, { mode: this._parent.owm.xcb.allow.ASYNC_KEYBOARD,
                                                                     time: this._parent.owm.currentTime });
        }, true);
        keybinding.recreate();
        this._bindings.set(binding, keybinding);
    }

    exit() {
        this._parent.exitMode(this);
    }
}

export class Keybindings
{
    private _owm: OWMLib;
    private _bindings: Map<string, Keybinding>;
    private _modes: KeybindingsMode[];
    private _enabled: boolean;
    private _log: Logger;

    constructor(owm: OWMLib) {
        this._owm = owm;
        this._bindings = new Map<string, Keybinding>();
        this._enabled = false;
        this._log = owm.logger.prefixed("Keybindings");
        this._modes = [];
    }

    get owm() {
        return this._owm;
    }

    add(binding: string, callback: (bindings: Keybindings, binding: string) => void) {
        this._add(binding, callback, false);
    }

    addMode(binding: string, mode: KeybindingsMode) {
        this._add(binding, (bindings: Keybindings, binding: string) => {
            this.enterMode(mode);
            this._owm.xcb.allow_events(this._owm.wm, { mode: this._owm.xcb.allow.ASYNC_KEYBOARD, time: this._owm.currentTime });
        }, true);
    }

    enterMode(mode: KeybindingsMode) {
        for (const [str, binding] of mode.bindings) {
            if (this._hasSym(binding.sym, binding.mods))
                continue;

            const codes = binding.codes;
            if (!codes.length)
                return;
            const mods = binding.mods;
            const mode = binding.mode;
            const grabMode = this._owm.xcb.grabMode;
            for (let code of codes) {
                this._owm.xcb.grab_key(this._owm.wm, { window: this._owm.root, owner_events: 1, modifiers: mods,
                                                       key: code, pointer_mode: grabMode.ASYNC, keyboard_mode: mode });
            }
        }
        this._owm.xcb.flush(this._owm.wm);

        this._modes.push(mode);
    }

    exitMode(mode: KeybindingsMode) {
        if (!this._modes.length || this._modes[this._modes.length - 1] !== mode) {
            throw new Error("Can't exit mode, current mode is not this mode");
        }

        this._modes.pop();

        for (const [str, binding] of mode.bindings) {
            if (this._hasSym(binding.sym, binding.mods))
                continue;

            const mods = binding.mods;
            for (let code of binding.codes) {
                this._owm.xcb.ungrab_key(this._owm.wm, { key: code, window: this._owm.root, modifiers: mods });
            }
        }
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

        const bindings = this._modes.length > 0 ? this._modes[this._modes.length - 1].bindings : this._bindings;

        for (const [key, keybinding] of bindings) {
            //console.log("cand. binding", keybinding);
            if (press.sym === keybinding.sym && press.state === keybinding.mods) {
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
        this._owm.xcb.flush(this._owm.wm);

        this._bindings.set(binding, keybinding);
    }

    private _recreate() {
        for (const mode of this._modes) {
            for (const [key, keybinding] of mode.bindings) {
                keybinding.recreate();
            }
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
        for (const mode of this._modes) {
            rebindBindings(mode.bindings);
        }
        rebindBindings(this._bindings);
    }

    private _hasSym(sym: number, mods: number) {
        for (const m of this._modes) {
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
