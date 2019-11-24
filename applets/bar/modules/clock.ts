import { Graphics } from "../../../native";
import { OWMLib, Geometry } from "../../../lib";
import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";

export class ClockConfig implements BarModuleConfig
{
    constructor() { }

    textColor?: string;
    seconds?: boolean;
    prefix?: string;
    font?: string;
}

export class Clock extends EventEmitter implements BarModule
{
    private _config: ClockConfig;
    private _dateOptions: { hour: string, minute: string, second?: string, hour12: boolean };
    private _clock: Graphics.Text;
    private _color: { red: number, green: number, blue: number, alpha: number };
    private _metrics: { width: number, height: number };
    private _prefix: string;

    constructor(owm: OWMLib, bar: Bar, config: BarModuleConfig) {
        super();

        const clockConfig = config as ClockConfig;

        this._config = clockConfig;
        this._color = Bar.makeColor(clockConfig.textColor || "#fff");

        this._dateOptions = {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        };
        if (clockConfig.seconds) {
            this._dateOptions.second = "2-digit";
        }

        this._prefix = clockConfig.prefix || "";

        this._clock = owm.engine.createText(bar.ctx);
        owm.engine.textSetFont(this._clock, clockConfig.font || "Sans Bold 10");
        owm.engine.textSetText(this._clock, this._prefix + (clockConfig.seconds ? "00:00:00" : "00:00"));
        this._metrics = owm.engine.textMetrics(this._clock);

        setInterval(() => {
            this.emit("updated");
        }, clockConfig.seconds ? 1000 : 1000 * 60);
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) {
        const { red, green, blue } = this._color;
        engine.setSourceRGB(ctx, red, green, blue);
        const txt = this._prefix + (new Date()).toLocaleTimeString("en-US", this._dateOptions);
        engine.textSetText(this._clock, txt);
        engine.drawText(ctx, this._clock);
    }

    geometry(geometry: Geometry) {
        return new Geometry({ x: 0, y: 0, width: this._metrics.width, height: this._metrics.height});
    }
}
