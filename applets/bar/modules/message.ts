import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";
import { Geometry, OWMLib } from "../../../lib";
import { Graphics } from "../../../native";

interface MessageConfig extends BarModuleConfig
{
    textColor?: string;
    font?: string;
    margin?: number;
}

interface MessageData
{
    message: string;
    timeout: number;
}

export class Message extends EventEmitter implements BarModule {
    private _config: MessageConfig;
    private _message: Graphics.Text;
    private _color: { red: number, green: number, blue: number, alpha: number };
    private _metrics: { width: number, height: number };
    private _pendingMessages: MessageData[];
    private _owm: OWMLib;
    private _currentMessage: MessageData | undefined;

    constructor(owm: OWMLib, bar: Bar, config: BarModuleConfig) {
        super();

        this._owm = owm;
        const messageConfig = config as MessageConfig;

        this._pendingMessages = [];
        this._config = messageConfig;
        this._color = Bar.makeColor(messageConfig.textColor || "#fff");

        this._message = owm.engine.createText(bar.ctx);
        this._metrics = { width: 0, height: 0 };
        owm.engine.textSetFont(this._message, messageConfig.font || bar.font);
    }

    display(msg: MessageData) {
        if (!this._currentMessage) {
            this._setCurrentMessage(msg);
        } else {
            this._pendingMessages.push(msg);
        }
    }

    private _setCurrentMessage(msg: MessageData) {
        this._currentMessage = msg;
        this._owm.engine.textSetText(this._message, this._currentMessage.message);
        this._metrics = this._owm.engine.textMetrics(this._message);
        this.emit("geometryChanged", this);
        this.emit("updated");
        setTimeout(() => {
            this._currentMessage = undefined;
            if (this._pendingMessages.length) {
                this._setCurrentMessage(this._pendingMessages.splice(0, 1)[0]);
            } else {
                this.emit("updated");
            }
        }, msg.timeout);
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context/*, geometry: Geometry*/) {
        if (this._currentMessage) {
            const { red, green, blue } = this._color;
            engine.setSourceRGB(ctx, red, green, blue);
            engine.translate(ctx, this._config.margin || 0, 0);
            engine.drawText(ctx, this._message);
        }
    }

    geometry(/*geometry: Geometry*/) {
        return new Geometry({ x: 0, y: 0, width: this._metrics.width + ((this._config.margin || 0) * 2), height: this._metrics.height});
    }
}
