import { OWMLib } from "./owm";
import { Logger } from "./logger";
import { XCB } from "native";

export class Keybinding
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

export class Keybindings
{
    private _owm: OWMLib;
    private _parent: Keybindings | undefined;
    private _child: Keybindings | undefined;
    private _bindings: Map<string, Keybinding>;
    private _enabled: boolean;
    private _feeding: boolean;
    private _log: Logger;

    constructor(owm: OWMLib, parent?: Keybindings) {
        this._owm = owm;
        this._parent = parent;
        this._bindings = new Map<string, Keybinding>();
        this._enabled = false;
        this._feeding = false;
        this._log = owm.logger.prefixed("Keybindings");

        if (parent) {
            if (parent._child) {
                throw new Error("can only have one child of a keybindings");
            }
            parent._child = this;
        }
    }

    add(binding: string, callback: (bindings: Keybindings, binding: string) => void, sync?: boolean) {
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

    remove(binding: string) {
        if (!this._bindings.has(binding))
            return;

        const keybinding = this._bindings.get(binding);
        this._bindings.delete(binding);

        if (this._enabled && !this.has(binding)) {
            // silly typescript, I already checked up above
            if (!keybinding)
                return;
            const codes = keybinding.codes;
            if (!codes.length)
                return;
            const mods = keybinding.mods;
            for (let code of codes) {
                this._owm.xcb.ungrab_key(this._owm.wm, { key: code, window: this._owm.root, modifiers: mods });
            }
        }
    }

    has(binding: string): boolean {
        if (this._parent) {
            return this._parent.has(binding);
        }
        return this._has(binding);
    }

    enable() {
        this._enabled = true;
        this._unbind();
        this.rebind();
    }

    disable() {
        this._enabled = false;
        this._unbind();
        this.rebind();
    }

    recreate() {
        if (this._parent) {
            this._parent.recreate();
            return;
        }
        this._recreate();
        if (this._child) {
            this._child._recreate();
        }
        this._unbind();
        this._rebind();
    }

    rebind() {
        if (this._parent) {
            this._parent.rebind();
            return;
        }
        this._rebind();
    }

    feed(key: XCB.KeyPress) {
        this._log.debug("feed", key, this._enabled);

        if (!this._enabled)
            return;

        if (this._parent) {
            throw new Error("can only feed the topmost keybindings");
        }

        if (this._feeding) {
            this._feed(key);
            return;
        }

        if (!this._child || !this._child._enabled) {
            this._feed(key);
            return;
        }

        let child = this._child;
        while (child._child !== undefined && !child._feeding && child._child._enabled) {
            child = child._child;
        }

        child._feed(key);
    }

    private _feed(key: XCB.KeyPress) {
        // check if I match one of my bindings. if I don't, try my parent
        if (!this._match(key)) {
            if (this._parent)
                this._parent._feed(key);
        }
    }

    private _match(press: XCB.KeyPress) {
        this._log.debug("match?", press);
        for (const [key, keybinding] of this._bindings) {
            //console.log("cand. binding", keybinding);
            if (press.sym === keybinding.sym && press.state === keybinding.mods) {
                keybinding.call(this);
                return true;
            }
        }
        return false;
    }

    private _has(binding: string): boolean {
        if (!this._enabled)
            return false;
        if (this._bindings.has(binding))
            return true;
        if (this._child && this._child._has(binding)) {
            return true;
        }
        return false;
    }

    private _recreate() {
        for (const [key, keybinding] of this._bindings) {
            keybinding.recreate();
        }
    }

    private _unbind() {
        this._log.debug("unbind", this._owm.root);
        this._owm.xcb.ungrab_key(this._owm.wm, { key: this._owm.xcb.grabAny, window: this._owm.root, modifiers: this._owm.xcb.buttonMask.ANY });
    }

    private _rebind() {
        if (this._parent) {
            throw "Can only call _rebind on the topmost keybindings";
        }

        // collect all bindings
        const bindings = new Map<string, Keybinding>();
        this._collect(bindings);

        this._log.debug("rebind");

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
    }

    private _collect(bindings: Map<string, Keybinding>) {
        if (!this._enabled) {
            return;
        }
        for (const [key, keybinding] of this._bindings) {
            if (!bindings.has(key)) {
                bindings.set(key, keybinding);
            }
        }
        if (this._child) {
            this._child._collect(bindings);
        }
    }
}
