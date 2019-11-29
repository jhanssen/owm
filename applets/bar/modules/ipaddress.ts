import { Graphics } from "../../../native";
import { OWMLib, Geometry } from "../../../lib";
import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";
import { networkInterfaces } from "os";

export class IpAddressConfig implements BarModuleConfig
{
    constructor() { }

    prefix?: string;
    iface?: string;
    color?: string;
    align?: Bar.Position;
    font?: string;
    interval?: number;
}

export class IpAddress extends EventEmitter implements BarModule
{
    private _config: IpAddressConfig;
    private _ip: Graphics.Text;
    private _color: { red: number, green: number, blue: number, alpha: number };
    private _iface: string;
    private _width: number;
    private _prefix: string;
    private _align: Bar.Position;

    constructor(owm: OWMLib, bar: Bar, config: BarModuleConfig) {
        super();

        const ipConfig = config as IpAddressConfig;

        this._config = ipConfig;
        if (typeof ipConfig.iface === "string") {
            this._iface = ipConfig.iface;
        } else {
            const iface = this._guessInterface();
            if (typeof iface === "string") {
                this._iface = iface;
            } else {
                throw new Error("Couldn't guess interface. Pass iface to IpAddressConfig");
            }
        }
        this._prefix = ipConfig.prefix || "";
        this._color = Bar.makeColor(ipConfig.color || "#fff");
        this._align = ipConfig.align || Bar.Position.Middle;

        this._ip = owm.engine.createText(bar.ctx);
        owm.engine.textSetFont(this._ip, ipConfig.font || "Sans Bold 10");
        // guess we only care about IPv4?
        owm.engine.textSetText(this._ip, this._prefix + "000.000.000.000");
        const m = owm.engine.textMetrics(this._ip);
        this._width = m.width;

        setInterval(() => {
            this.emit("updated");
        }, ipConfig.interval || 60000);
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) {
        let address: string | undefined;
        const ifaces = networkInterfaces();
        if (this._iface in ifaces) {
            const iface = ifaces[this._iface];
            for (let n = 0; n < iface.length; ++n) {
                const sub = iface[n];
                if (sub.family == "IPv4") {
                    address = sub.address;
                    break;
                }
            }
        }
        if (address === undefined) {
            throw new Error(`Couldn't find address for iface ${this._iface}`);
        }

        const { red, green, blue } = this._color;
        engine.setSourceRGB(ctx, red, green, blue);

        engine.textSetText(this._ip, this._prefix + address);
        const m = engine.textMetrics(this._ip);

        engine.translate(ctx, Bar.align(m.width, this._width, this._align), 0);
        engine.drawText(ctx, this._ip);
    }

    geometry(geometry: Geometry) {
        return new Geometry({ x: 0, y: 0, width: this._width, height: 20 });
    }

    private _guessInterface() {
        let foundv4: string | undefined = undefined, foundv6: string | undefined = undefined;
        const ifaces = networkInterfaces();
        for (let iface in ifaces) {
            const data = ifaces[iface];
            for (let n = 0; n < data.length; ++n) {
                if (foundv4 && foundv6)
                    break;
                const sub = data[n];
                if (!foundv4 && sub.family == "IPv4") {
                    if (!sub.internal && sub.address.length > 0)
                        foundv4 = iface;
                } else if (!foundv6 && sub.family == "IPv6") {
                    if (!sub.internal && sub.address.length > 0)
                        foundv6 = iface;
                }
            }
        }
        if (foundv4)
            return foundv4;
        return undefined;
    }

}
