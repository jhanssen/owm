import { Graphics } from "../../../native";
import { OWMLib, Geometry } from "../../../lib";
import { Bar, BarModule, BarModuleConfig } from "..";
import { KeybindingsMode } from "../../../lib/keybindings";
import { EventEmitter } from "events";

interface CurrentModeConfig extends BarModuleConfig
{
    textColor?: string;
    font?: string;
    margin?: number;
}

export class CurrentMode extends EventEmitter implements BarModule
{
    private _config: CurrentModeConfig;
    private _currentMode: Graphics.Text;
    private _color: { red: number, green: number, blue: number, alpha: number };
    private _metrics: { width: number, height: number };
    private _owm: OWMLib;
    private _modeStack: string[];

    constructor(owm: OWMLib, bar: Bar, config: BarModuleConfig) {
        super();
        this._modeStack = [];

        this._owm = owm;
        owm.events.on("enterMode", (mode: KeybindingsMode) => {
            this._modeStack.push(mode.name || "untitled mode");
            this._onUpdate();
        });
        owm.events.on("exitMode", () => {
            this._modeStack.pop();
            this._onUpdate();
        });

        const currentModeConfig = config as CurrentModeConfig;

        this._config = currentModeConfig;
        this._color = Bar.makeColor(currentModeConfig.textColor || "#fff");

        this._currentMode = owm.engine.createText(bar.ctx);
        this._metrics = { width: 0, height: 0 };
        owm.engine.textSetFont(this._currentMode, currentModeConfig.font || bar.font);
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) {
        if (this._modeStack.length) {
            const { red, green, blue } = this._color;
            engine.setSourceRGB(ctx, red, green, blue);
            engine.translate(ctx, this._config.margin || 0, 0);
            engine.drawText(ctx, this._currentMode);
        }
    }

    geometry(geometry: Geometry) {
        return new Geometry({ x: 0, y: 0, width: this._metrics.width + ((this._config.margin || 0) * 2), height: this._metrics.height});
    }

    private _onUpdate()
    {
        if (this._modeStack.length) {
            const text = this._modeStack[this._modeStack.length - 1];
            this._owm.engine.textSetText(this._currentMode, text);
            this._metrics = this._owm.engine.textMetrics(this._currentMode);
        } else {
            this._metrics = { width: 0, height: 0 };
        }
        this.emit("geometryChanged");
        this.emit("updated");
    }
}
