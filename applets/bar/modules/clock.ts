import { Graphics } from "../../../native";
import { OWMLib, Geometry } from "../../../lib";
import { Bar, BarModule } from "..";
import { EventEmitter } from "events";

export interface ClockConfig
{
    textColor: string;
    seconds?: boolean;
    prefix?: string;
}

export class Clock extends EventEmitter implements BarModule
{
    private _config: ClockConfig;
    private _dateOptions: { hour: string, minute: string, second?: string, hour12: boolean };
    private _clock: Graphics.Text;
    private _color: { red: number, green: number, blue: number, alpha: number };
    private _metrics: { width: number, height: number };
    private _prefix: string;

    constructor(owm: OWMLib, bar: Bar, config: ClockConfig) {
        super();

        this._config = config;
        this._color = Bar.makeColor(config.textColor);

        this._dateOptions = {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        };
        if (config.seconds) {
            this._dateOptions.second = "2-digit";
        }

        this._prefix = config.prefix || "";

        this._clock = owm.engine.createText(bar.ctx);
        owm.engine.textSetFont(this._clock, "Sans Bold 10");
        owm.engine.textSetText(this._clock, this._prefix + (config.seconds ? "00:00:00" : "00:00"));
        this._metrics = owm.engine.textMetrics(this._clock);

        setInterval(() => {
            this.emit("updated");
        }, config.seconds ? 1000 : 1000 * 60);
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
