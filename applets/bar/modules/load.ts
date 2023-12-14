import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";
import { Geometry, OWMLib } from "../../../lib";
import { Graphics } from "../../../native";
import { loadavg } from "os";

interface LoadConfig extends BarModuleConfig
{
    prefix?: string;
    color?: string;
    colors?: [number, string][];
    font?: string;
    interval?: number;
}

export class Load extends EventEmitter implements BarModule {
    private _config: LoadConfig;
    private _load: Graphics.Text;
    private _loadValue: number;
    private _colors: [number, { red: number, green: number, blue: number, alpha: number }][];
    private _geometry: { width: number, height: number };
    private _geometryChanged: boolean;
    private _prefix: string;

    constructor(owm: OWMLib, bar: Bar, config: BarModuleConfig) {
        super();

        const loadConfig = config as LoadConfig;

        this._config = loadConfig;
        this._prefix = loadConfig.prefix || "";
        this._colors = [[0, Bar.makeColor(loadConfig.color || "#fff")]];
        if (loadConfig.colors) {
            for (const t of loadConfig.colors) {
                this._colors.push([t[0], Bar.makeColor(t[1])]);
                // make sure that the order is ascending
                if (this._colors[this._colors.length - 1][0] <= this._colors[this._colors.length - 2][0]) {
                    throw new Error(`${this._colors[this._colors.length - 1][0]} is not > ${this._colors[this._colors.length - 2][0]}`);
                }
            }
        }

        this._geometryChanged = false;
        this._geometry = { width: 0, height: 0 };
        this._loadValue = 0;
        this._load = owm.engine.createText(bar.ctx);
        owm.engine.textSetFont(this._load, loadConfig.font || bar.font);

        this._queryLoad(owm.engine);
        setInterval(() => {
            this._queryLoad(owm.engine);
            if (this._geometryChanged) {
                this.emit("geometryChanged", this);
                this._geometryChanged = false;
            }
            this.emit("updated");
        }, loadConfig.interval || 5000);
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context /*, geometry: Geometry*/) {
        const { red, green, blue } = this._findColor(this._loadValue);
        engine.setSourceRGB(ctx, red, green, blue);
        engine.drawText(ctx, this._load);
    }

    geometry(/*geometry: Geometry*/) {
        return new Geometry({ x: 0, y: 0, width: this._geometry.width, height: this._geometry.height });
    }

    private _queryLoad(engine: Graphics.Engine) {
        this._loadValue = loadavg()[0];
        engine.textSetText(this._load, this._prefix + this._loadValue.toFixed(2));
        const geom = engine.textMetrics(this._load);
        if (geom.width !== this._geometry.width || geom.height !== this._geometry.height) {
            this._geometryChanged = true;
            this._geometry = geom;
        }
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
