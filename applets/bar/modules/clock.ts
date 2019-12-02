import { Graphics } from "../../../native";
import { OWMLib, Geometry } from "../../../lib";
import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";
import { default as dateFormat } from "dateformat";

interface ClockConfig extends BarModuleConfig
{
    textColor?: string;
    font?: string;
    format?: string;
    timeout?: number;
}

export class Clock extends EventEmitter implements BarModule
{
    private _config: ClockConfig;
    private _clock: Graphics.Text;
    private _color: { red: number, green: number, blue: number, alpha: number };
    private _metrics: { width: number, height: number };

    constructor(owm: OWMLib, bar: Bar, config: BarModuleConfig) {
        super();

        const clockConfig = config as ClockConfig;

        this._config = clockConfig;
        this._color = Bar.makeColor(clockConfig.textColor || "#fff");

        const str = dateFormat(new Date(), this._config.format || "HH:MM");

        this._clock = owm.engine.createText(bar.ctx);
        owm.engine.textSetFont(this._clock, clockConfig.font || bar.font);
        owm.engine.textSetText(this._clock, str);
        this._metrics = owm.engine.textMetrics(this._clock);

        setInterval(() => {
            this.emit("updated");
        }, this._config.timeout || 1000 * 60);
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) {
        const { red, green, blue } = this._color;
        engine.setSourceRGB(ctx, red, green, blue);

        engine.textSetText(this._clock, dateFormat(new Date(), this._config.format || "HH:MM"));
        engine.drawText(ctx, this._clock);
    }

    geometry(geometry: Geometry) {
        return new Geometry({ x: 0, y: 0, width: this._metrics.width, height: this._metrics.height});
    }
}
