import { Graphics } from "../../../native";
import { OWMLib, Geometry } from "../../../lib";
import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";
import { loadavg } from "os";

export class LoadConfig implements BarModuleConfig
{
    constructor() { }

    prefix?: string;
    color?: string;
    colors?: [number, string][];
    font?: string;
    interval?: number;
}

export class Load extends EventEmitter implements BarModule
{
    private _config: LoadConfig;
    private _load: Graphics.Text;
    private _colors: [number, { red: number, green: number, blue: number, alpha: number }][];
    private _width: number;
    private _prefix: string;

    constructor(owm: OWMLib, bar: Bar, config: BarModuleConfig) {
        super();

        const loadConfig = config as LoadConfig;

        this._config = loadConfig;
        this._prefix = loadConfig.prefix || "";
        this._colors = [[0, Bar.makeColor(loadConfig.color || "#fff")]];
        if (loadConfig.colors) {
            for (let t of loadConfig.colors) {
                this._colors.push([t[0], Bar.makeColor(t[1])]);
                // make sure that the order is ascending
                if (this._colors[this._colors.length - 1][0] <= this._colors[this._colors.length - 2][0]) {
                    throw new Error(`${this._colors[this._colors.length - 1][0]} is not > ${this._colors[this._colors.length - 2][0]}`);
                }
            }
        }

        this._load = owm.engine.createText(bar.ctx);
        owm.engine.textSetFont(this._load, loadConfig.font || "Sans Bold 10");
        owm.engine.textSetText(this._load, this._prefix + "000.00");
        const m = owm.engine.textMetrics(this._load);
        this._width = m.width;

        setInterval(() => {
            this.emit("updated");
        }, loadConfig.interval || 5000);
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) {
        const load = loadavg()[0];

        const { red, green, blue } = this._findColor(load);
        engine.setSourceRGB(ctx, red, green, blue);

        engine.textSetText(this._load, this._prefix + load.toFixed(2));
        const m = engine.textMetrics(this._load);

        let middle = this._width / 2;
        middle -= m.width / 2;
        engine.translate(ctx, middle, 0);

        engine.drawText(ctx, this._load);
    }

    geometry(geometry: Geometry) {
        return new Geometry({ x: 0, y: 0, width: this._width, height: 20 });
    }

    private _findColor(load: number) {
        for (let idx = 0; idx < this._colors.length; ++idx) {
            if (load < this._colors[idx][0]) {
                if (idx === 0) {
                    throw new Error(`Couldn't find color for ${load}`);
                }
                return this._colors[idx - 1][1];
            }
        }
        return this._colors[this._colors.length - 1][1];
    }
}
