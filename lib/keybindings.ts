import { OWMLib } from "./owm";

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
                switch (keys[i]) {
                    case "Shift":
                        mods |= mask.SHIFT;
                        break;
                    case "Ctrl":
                    case "Control":
                        mods |= mask.CONTROL;
                        break;
                    case "Mod1":
                    case "Alt":
                        mods |= mask["1"];
                        break;
                    case "Mod2":
                        mods |= mask["2"];
                        break;
                    case "Mod3":
                        mods |= mask["3"];
                        break;
                    case "Mod4":
                        mods |= mask["4"];
                        break;
                    case "Mod5":
                        mods |= mask["5"];
                        break;
                    case "Lock":
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
    private _children: Keybindings[];
    private _bindings: Map<string, Keybinding>;
    private _enabled: boolean;

    constructor(owm: OWMLib, parent?: Keybindings) {
        this._owm = owm;
        this._parent = parent;
        this._bindings = new Map<string, Keybinding>();
        this._children = [];
        this._enabled = false;

        if (parent) {
            parent._children.push(this);
        }
    }

    add(binding: string, callback: (bindings: Keybindings, binding: string) => void, sync?: boolean) {
        const keybinding = new Keybinding(this._owm, binding, callback, sync);

        keybinding.recreate();

        if (!this.has(binding)) {
            const codes = keybinding.codes;
            if (!codes.length)
                return;
            const mods = keybinding.mods;
            const mode = keybinding.mode;
            const grabMode = this._owm.xcb.grabMode;
            this._owm.forEachRoot((root: number) => {
                for (let code of codes) {
                    this._owm.xcb.grab_key(this._owm.wm, { window: root, owner_events: 1, modifiers: mods,
                                                           key: code, pointer_mode: grabMode.ASYNC, keyboard_mode: mode });
                }
            });
        }

        this._bindings.set(binding, keybinding);
    }

    remove(binding: string) {
        if (!this._bindings.has(binding))
            return;
        if (!this.has(binding)) {
            const keybinding = this._bindings.get(binding);
            // silly typescript, I already checked up above
            if (!keybinding)
                return;
            const codes = keybinding.codes;
            if (!codes.length)
                return;
            const mods = keybinding.mods;
            this._owm.forEachRoot((root: number) => {
                for (let code of codes) {
                    this._owm.xcb.ungrab_key(this._owm.wm, { key: code, window: root, modifiers: mods });
                }
            });
        }
        this._bindings.delete(binding);
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
        for (const child of this._children) {
            child._recreate();
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

    private _has(binding: string): boolean {
        if (!this._enabled)
            return false;
        if (this._bindings.has(binding))
            return true;
        for (const child of this._children) {
            if (child._has(binding))
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
        this._owm.forEachRoot((root: number) => {
            this._owm.xcb.ungrab_key(this._owm.wm, { key: this._owm.xcb.grabAny, window: root, modifiers: this._owm.xcb.buttonMask.ANY });
        });
    }

    private _rebind() {
        if (this._parent) {
            throw "Can only call _rebind on the topmost keybindings";
        }

        // collect all bindings
        const bindings = new Map<string, Keybinding>();
        this._collect(bindings);

        for (const [key, keybinding] of bindings) {
            const codes = keybinding.codes;
            if (!codes.length)
                return;
            const mods = keybinding.mods;
            const mode = keybinding.mode;
            const grabMode = this._owm.xcb.grabMode;
            this._owm.forEachRoot((root: number) => {
                //this._owm.xcb.grab_key(this._owm.wm,
                for (let code of codes) {
                    this._owm.xcb.grab_key(this._owm.wm, { window: root, owner_events: 1, modifiers: mods,
                                                           key: code, pointer_mode: grabMode.ASYNC, keyboard_mode: mode });
                }
            });
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
        for (const child of this._children) {
            child._collect(bindings);
        }
    }
}
