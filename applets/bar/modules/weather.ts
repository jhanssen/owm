import { Graphics } from "../../../native";
import { OWMLib, Geometry, Logger } from "../../../lib";
import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";
import { default as request } from "request-promise-native";

interface WeatherConfig extends BarModuleConfig
{
    apiKey: string;
    zip: number;
    prefix?: string;
    country?: string;
    color?: string;
    colors?: [number, string][];
    icons?: {[key: string]: string};
    font?: string;
    iconFont?: string;
    unit?: string;
    interval?: number;
}

export class Weather extends EventEmitter implements BarModule
{
    private _log: Logger;
    private _config: WeatherConfig;
    private _weather: Graphics.Text;
    private _temperature: number;
    private _colors: [number, { red: number, green: number, blue: number, alpha: number }][];
    private _geometry: { width: number, height: number };
    private _prefix: string;
    private _apiKey: string;
    private _zip: number;
    private _country: string;
    private _iconFont: string;
    private _unit: string;
    private _icons: {[key: string]: string};

    constructor(owm: OWMLib, bar: Bar, config: BarModuleConfig) {
        super();

        this._log = owm.logger.prefixed("Bar.Weather");

        const weatherConfig = config as WeatherConfig;

        this._config = weatherConfig;
        this._prefix = weatherConfig.prefix || "";
        this._apiKey = weatherConfig.apiKey;
        this._zip = weatherConfig.zip;
        this._country = weatherConfig.country || "us";
        this._unit = weatherConfig.unit || "f";
        this._icons = {
            "01d": "☀",
            "01n": "☀",
            "02d": "\uD83C\uDF24",
            "02n": "\uD83C\uDF24",
            "03d": "☁",
            "03n": "☁",
            "04d": "\uD83C\uDF25",
            "04n": "\uD83C\uDF25",
            "09d": "\uD83C\uDF27",
            "09n": "\uD83C\uDF27",
            "10d": "\uD83C\uDF26",
            "10n": "\uD83C\uDF26",
            "11d": "⛈",
            "11n": "⛈",
            "13d": "\uD83C\uDF28",
            "13n": "\uD83C\uDF28",
            "50d": "\uD83C\uDF2B",
            "50n": "\uD83C\uDF2B"
        };
        if (weatherConfig.icons) {
            for (const k in weatherConfig.icons) {
                this._icons[k] = weatherConfig.icons[k];
            }
        }
        this._colors = [[0, Bar.makeColor(weatherConfig.color || "#fff")]];
        if (weatherConfig.colors) {
            for (let t of weatherConfig.colors) {
                this._colors.push([t[0], Bar.makeColor(t[1])]);
                // make sure that the order is ascending
                if (this._colors[this._colors.length - 1][0] <= this._colors[this._colors.length - 2][0]) {
                    throw new Error(`${this._colors[this._colors.length - 1][0]} is not > ${this._colors[this._colors.length - 2][0]}`);
                }
            }
        }

        this._geometry = { width: 0, height: 0 };
        this._temperature = 0;
        this._weather = owm.engine.createText(bar.ctx);
        this._iconFont = weatherConfig.iconFont || weatherConfig.font || bar.font;
        owm.engine.textSetFont(this._weather, weatherConfig.font || bar.font);

        this._queryWeather(owm.engine);
        setInterval(() => {
            this._queryWeather(owm.engine);
        }, weatherConfig.interval || 60000);
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) {
        const { red, green, blue } = this._findColor(this._temperature);
        engine.setSourceRGB(ctx, red, green, blue);
        engine.drawText(ctx, this._weather);
    }

    geometry(geometry: Geometry) {
        return new Geometry({ x: 0, y: 0, width: this._geometry.width, height: this._geometry.height });
    }

    private _queryWeather(engine: Graphics.Engine) {
        request(`http://api.openweathermap.org/data/2.5/weather?zip=${this._zip},${this._country}&appid=${this._apiKey}`).then(json => {
            const data = JSON.parse(json);
            const weather = data.weather;
            const main = data.main;

            let str = "";
            for (const w of weather) {
                str += `<span font_family="${this._iconFont}">` + (this._icons[w.icon] || w.main) + "</span> ";
            }
            this._temperature = this._convert(main.temp);
            str += `${this._temperature.toFixed(1)}${this._unit}`;
            engine.textSetMarkup(this._weather, this._prefix + str);
            const geom = engine.textMetrics(this._weather);
            if (geom.width !== this._geometry.width || geom.height !== this._geometry.height) {
                this._geometry = geom;
                this.emit("geometryChanged", this);
            }
            this.emit("updated");
        }).catch(err => {
            this._log.error("openweathermap api failure", err);
        });
    }

    private _findColor(temp: number) {
        for (let idx = 0; idx < this._colors.length; ++idx) {
            if (temp < this._colors[idx][0]) {
                if (idx === 0) {
                    throw new Error(`Couldn't find color for ${temp}`);
                }
                return this._colors[idx - 1][1];
            }
        }
        return this._colors[this._colors.length - 1][1];
    }

    private _convert(temp: number) {
        let n = temp;
        switch (this._unit) {
        case 'f':
            // kelvin to fahrenheit
            n = n * 9/5 - 459.67;
            break;
        case 'c':
            // kelvin to celcius
            n = n - 273.15;
            break;
        }
        return n;
    }
}
