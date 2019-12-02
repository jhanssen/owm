import { Graphics } from "../../../native";
import { OWMLib, Geometry, Monitor } from "../../../lib";
import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";

interface WorkspaceConfig extends BarModuleConfig
{
    border?: number;
    borderColor?: string;
    inactiveBackgroundColor?: string;
    activeBackgroundColor?: string;
    inactiveTextColor?: string;
    activeTextColor?: string;
    nameMapping?: {[key: string]: string};
    font?: string;
}

export class Workspace extends EventEmitter implements BarModule
{
    private _config: WorkspaceConfig;
    private _borderColor: { red: number, green: number, blue: number, alpha: number };
    private _inactiveBackgroundColor: { red: number, green: number, blue: number, alpha: number };
    private _activeBackgroundColor: { red: number, green: number, blue: number, alpha: number };
    private _inactiveTextColor: { red: number, green: number, blue: number, alpha: number };
    private _activeTextColor: { red: number, green: number, blue: number, alpha: number };
    private _inactiveSurface: Graphics.Surface;
    private _activeSurface: Graphics.Surface;
    private _text: Graphics.Text;
    private _border: number;
    private _monitor: Monitor;

    private static readonly Pad = 4;
    private static readonly SizePerWorkspace = 18;

    constructor(owm: OWMLib, bar: Bar, config: BarModuleConfig) {
        super();

        const wsConfig = config as WorkspaceConfig;

        this._monitor = bar.monitor;
        this._config = wsConfig;
        this._borderColor = Bar.makeColor(wsConfig.borderColor || "#099");
        this._inactiveBackgroundColor = Bar.makeColor(wsConfig.inactiveBackgroundColor || "#888");
        this._activeBackgroundColor = Bar.makeColor(wsConfig.activeBackgroundColor || "#600");
        this._inactiveTextColor = Bar.makeColor(wsConfig.inactiveTextColor || "#fff");
        this._activeTextColor = Bar.makeColor(wsConfig.activeTextColor || "#fff");
        this._border = wsConfig.border || 2;

        owm.events.on("workspaceActivated", (monitor: Monitor) => {
            if (monitor === this._monitor) {
                this.emit("updated");
            }
        });
        owm.events.on("workspaceAdded", (monitor: Monitor) => {
            if (monitor === this._monitor) {
                this.emit("geometryChanged", this);
            }
        });
        owm.events.on("workspaceRemoved", (monitor: Monitor) => {
            if (monitor === this._monitor) {
                this.emit("geometryChanged", this);
            }
        });

        const ip = owm.xcb.create_pixmap(owm.wm, { width: Workspace.SizePerWorkspace, height: Workspace.SizePerWorkspace });
        this._inactiveSurface = owm.engine.createSurfaceFromDrawable(owm.wm, { drawable: ip, width: Workspace.SizePerWorkspace, height: Workspace.SizePerWorkspace });

        const ap = owm.xcb.create_pixmap(owm.wm, { width: Workspace.SizePerWorkspace, height: Workspace.SizePerWorkspace });
        this._activeSurface = owm.engine.createSurfaceFromDrawable(owm.wm, { drawable: ap, width: Workspace.SizePerWorkspace, height: Workspace.SizePerWorkspace });

        this._text = owm.engine.createText(bar.ctx);
        owm.engine.textSetFont(this._text, wsConfig.font || "Sans Bold 10");

        this._updateSurfaces(owm);
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) {
        const wss = this._monitor.workspaces;
        let x = 0;
        for (const ws of wss.workspaces) {
            if (ws === this._monitor.workspace) {
                // active
                engine.save(ctx);
                engine.translate(ctx, x, 0);
                engine.setSourceSurface(ctx, this._activeSurface);
                engine.pathRectangle(ctx, 0, 0, Workspace.SizePerWorkspace, Workspace.SizePerWorkspace);
                engine.fill(ctx);

                const { red: tr, green: tg, blue: tb, alpha: ta } = this._activeTextColor;
                engine.setSourceRGBA(ctx, tr, tg, tb, ta);
                engine.textSetText(this._text, this._mapName(`${ws.id}`));
                const m = engine.textMetrics(this._text);
                // center metrics width in ws rectangle width
                const c = (Workspace.SizePerWorkspace / 2) - (m.width / 2);
                engine.translate(ctx, c, 1);
                engine.drawText(ctx, this._text);
                engine.restore(ctx);
            } else {
                // inactive
                engine.save(ctx);
                engine.translate(ctx, x, 0);
                engine.setSourceSurface(ctx, this._inactiveSurface);
                engine.pathRectangle(ctx, 0, 0, Workspace.SizePerWorkspace, Workspace.SizePerWorkspace);
                engine.fill(ctx);

                const { red: tr, green: tg, blue: tb, alpha: ta } = this._inactiveTextColor;
                engine.setSourceRGBA(ctx, tr, tg, tb, ta);
                engine.textSetText(this._text, this._mapName(`${ws.id}`));
                const m = engine.textMetrics(this._text);
                // center metrics width in ws rectangle width
                const c = (Workspace.SizePerWorkspace / 2) - (m.width / 2);
                engine.translate(ctx, c, 1);
                engine.drawText(ctx, this._text);
                engine.restore(ctx);
            }

            x += Workspace.SizePerWorkspace + Workspace.Pad;
        }
    }

    geometry(geometry: Geometry) {
        const width = (Workspace.SizePerWorkspace + Workspace.Pad) * this._monitor.workspaces.size;
        return new Geometry({ x: 0, y: 0, width: width, height: 18 });
    }

    private _updateSurfaces(owm: OWMLib) {
        const engine = owm.engine;
        const border = this._border;
        const size = Workspace.SizePerWorkspace;

        const activeCtx = engine.createFromSurface(this._activeSurface);
        const inactiveCtx = engine.createFromSurface(this._inactiveSurface);

        const { red: bred, blue: bblue, green: bgreen } = this._borderColor;

        const { red: ared, blue: ablue, green: agreen } = this._activeBackgroundColor;
        engine.setSourceRGB(activeCtx, bred, bblue, bgreen);
        engine.paint(activeCtx);
        engine.setSourceRGB(activeCtx, ared, ablue, agreen);
        engine.pathRectangle(activeCtx, border, border, size - (border * 2), size - (border * 2));
        engine.fill(activeCtx);

        const { red: ired, blue: iblue, green: igreen } = this._inactiveBackgroundColor;
        engine.setSourceRGB(inactiveCtx, bred, bblue, bgreen);
        engine.paint(inactiveCtx);
        engine.setSourceRGB(inactiveCtx, ired, iblue, igreen);
        engine.pathRectangle(inactiveCtx, border, border, size - (border * 2), size - (border * 2));
        engine.fill(inactiveCtx);
    }

    private _mapName(name: string) {
        if (!this._config.nameMapping)
            return name;
        if (name in this._config.nameMapping)
            return this._config.nameMapping[name];
        return name;
    }
}
