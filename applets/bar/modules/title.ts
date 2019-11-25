import { Graphics } from "../../../native";
import { OWMLib, Geometry } from "../../../lib";
import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";

export class TitleConfig implements BarModuleConfig
{
    constructor() { }

    textColor?: string;
    font?: string;
}

export class Title extends EventEmitter implements BarModule
{
    private _config: TitleConfig;
    private _title: Graphics.Text;
    private _titleText: string;
    private _color: { red: number, green: number, blue: number, alpha: number };
    private _width: number;

    constructor(owm: OWMLib, bar: Bar, config: BarModuleConfig) {
        super();

        const titleConfig = config as TitleConfig;

        this._config = titleConfig;
        this._color = Bar.makeColor(titleConfig.textColor || "#fff");

        this._titleText = "";
        this._title = owm.engine.createText(bar.ctx);
        this._width = 300;
        owm.engine.textSetFont(this._title, titleConfig.font || "Sans Bold 10");

        owm.events.on("clientFocusIn", client => {
            this._titleText = client.window.ewmhName || client.window.wmName;
            this.emit("updated");
        });
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) {
        const { red, green, blue } = this._color;
        engine.setSourceRGB(ctx, red, green, blue);

        engine.textSetText(this._title, this._titleText);
        const m = engine.textMetrics(this._title);

        let middle = this._width / 2;
        middle -= m.width / 2;
        engine.translate(ctx, middle, 0);

        engine.drawText(ctx, this._title);
    }

    geometry(geometry: Geometry) {
        return new Geometry({ x: 0, y: 0, width: this._width, height: 20 });
    }
}
