import { Graphics } from "../../../native";
import { OWMLib, Geometry, Client, Monitor } from "../../../lib";
import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";

interface TitleConfig extends BarModuleConfig
{
    textColor?: string;
    font?: string;
}

export class Title extends EventEmitter implements BarModule
{
    private _config: TitleConfig;
    private _title: Graphics.Text;
    private _color: { red: number, green: number, blue: number, alpha: number };
    private _width: number;
    private _titleGeometry: { width: number, height: number };
    private _monitor: Monitor;
    private _client: Client | undefined;

    constructor(owm: OWMLib, bar: Bar, config: BarModuleConfig) {
        super();

        const titleConfig = config as TitleConfig;

        this._config = titleConfig;
        this._color = Bar.makeColor(titleConfig.textColor || "#fff");
        this._monitor = bar.monitor;

        this._titleGeometry = { width: 0, height: 0 };
        this._title = owm.engine.createText(bar.ctx);
        this._width = 300;
        owm.engine.textSetFont(this._title, titleConfig.font || bar.font);

        if (!owm.focused || owm.focused.monitor == this._monitor)
            this._updateFocus(owm.engine, owm.focused);

        const _updateClient = () => {
            this._updateFocus(owm.engine, this._client);
            this.emit("geometryChanged", this);
            this.emit("updated");
        };

        owm.events.on("clientFocusIn", client => {
            if (client.monitor === this._monitor) {
                this._client = client;
                _updateClient();
            }
        });
        owm.events.on("clientWmNameUpdated", client => {
            if (this._client === client) {
                _updateClient();
            }
        });
        owm.events.on("clientEwmhNameUpdated", client => {
            if (this._client === client) {
                _updateClient();
            }
        });
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) {
        const { red, green, blue } = this._color;
        engine.setSourceRGB(ctx, red, green, blue);
        engine.drawText(ctx, this._title);
    }

    geometry(geometry: Geometry) {
        return new Geometry({ x: 0, y: 0, width: this._titleGeometry.width, height: this._titleGeometry.height });
    }

    private _updateFocus(engine: Graphics.Engine, client: Client | undefined) {
        if (client) {
            engine.textSetText(this._title, client.window.ewmhName || client.window.wmName || "<no title>");
        } else {
            engine.textSetText(this._title, "<no title>");
        }
        this._titleGeometry = engine.textMetrics(this._title);
    }
}
