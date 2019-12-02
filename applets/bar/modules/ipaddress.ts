import { Graphics } from "../../../native";
import { OWMLib, Geometry } from "../../../lib";
import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";
import { networkInterfaces } from "os";

interface IpAddressConfig extends BarModuleConfig
{
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
    private _geometry: { width: number, height: number };
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
        this._geometry = { width: 0, height: 0 };

        this._ip = owm.engine.createText(bar.ctx);
        owm.engine.textSetFont(this._ip, ipConfig.font || "Sans Bold 10");

        this._queryInterface(owm.engine);
        setInterval(() => {
            this._queryInterface(owm.engine);
            this.emit("geometryChanged", this);
            this.emit("updated");
        }, ipConfig.interval || 60000);
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) {
        const { red, green, blue } = this._color;
        engine.setSourceRGB(ctx, red, green, blue);
        engine.drawText(ctx, this._ip);
    }

    geometry(geometry: Geometry) {
        return new Geometry({ x: 0, y: 0, width: this._geometry.width, height: this._geometry.height });
    }

    private _queryInterface(engine: Graphics.Engine) {
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

        engine.textSetText(this._ip, this._prefix + address);
        this._geometry = engine.textMetrics(this._ip);
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
