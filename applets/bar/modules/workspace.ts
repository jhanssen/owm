import { Graphics } from "../../../native";
import { OWMLib, Geometry, Monitor } from "../../../lib";
import { Bar, BarModule, BarModuleConfig } from "..";
import { EventEmitter } from "events";

export class WorkspaceConfig implements BarModuleConfig
{
    constructor() { }

    border?: number;
    borderColor?: string;
    inactiveBackgroundColor?: string;
    activeBackgroundColor?: string;
    inactiveTextColor?: string;
    activeTextColor?: string;
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
    private _inactivePixmap: Graphics.Surface;
    private _activePixmap: Graphics.Surface;
    private _text: Graphics.Text;
    private _border: number;
    private _monitor: Monitor;
    private _width: number;

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
                this.emit("geometryChanged");
            }
        });
        owm.events.on("workspaceRemoved", (monitor: Monitor) => {
            if (monitor === this._monitor) {
                this.emit("geometryChanged");
            }
        });

        this._width = (Workspace.SizePerWorkspace * this._monitor.workspaces.size) + ((this._monitor.workspaces.size - 1) * Workspace.Pad);

        const ip = owm.xcb.create_pixmap(owm.wm, { width: Workspace.SizePerWorkspace, height: Workspace.SizePerWorkspace });
        this._inactivePixmap = owm.engine.createSurfaceFromDrawable(owm.wm, { drawable: ip, width: Workspace.SizePerWorkspace, height: Workspace.SizePerWorkspace });

        const ap = owm.xcb.create_pixmap(owm.wm, { width: Workspace.SizePerWorkspace, height: Workspace.SizePerWorkspace });
        this._activePixmap = owm.engine.createSurfaceFromDrawable(owm.wm, { drawable: ap, width: Workspace.SizePerWorkspace, height: Workspace.SizePerWorkspace });

        this._text = owm.engine.createText(bar.ctx);
        owm.engine.textSetFont(this._text, wsConfig.font || "Sans Bold 10");

        this._updatePixmaps(owm);
    }

    paint(engine: Graphics.Engine, ctx: Graphics.Context, geometry: Geometry) {
        const wss = this._monitor.workspaces;
        let x = 0;
        for (const ws of wss.workspaces) {
            if (ws === this._monitor.workspace) {
                // active
                engine.save(ctx);
                engine.translate(ctx, x, 0);
                engine.setSourceSurface(ctx, this._activePixmap);
                engine.pathRectangle(ctx, 0, 0, Workspace.SizePerWorkspace, Workspace.SizePerWorkspace);
                engine.fill(ctx);

                const { red: tr, green: tg, blue: tb, alpha: ta } = this._activeTextColor;
                engine.translate(ctx, Workspace.Pad, 1);
                engine.setSourceRGBA(ctx, tr, tg, tb, ta);
                engine.textSetText(this._text, `${ws.id}`);
                engine.drawText(ctx, this._text);
                engine.restore(ctx);
            } else {
                // inactive
                engine.save(ctx);
                engine.translate(ctx, x, 0);
                engine.setSourceSurface(ctx, this._inactivePixmap);
                engine.pathRectangle(ctx, 0, 0, Workspace.SizePerWorkspace, Workspace.SizePerWorkspace);
                engine.fill(ctx);

                const { red: tr, green: tg, blue: tb, alpha: ta } = this._inactiveTextColor;
                engine.translate(ctx, Workspace.Pad, 1);
                engine.setSourceRGBA(ctx, tr, tg, tb, ta);
                engine.textSetText(this._text, `${ws.id}`);
                engine.drawText(ctx, this._text);
                engine.restore(ctx);
            }

            x += Workspace.SizePerWorkspace + Workspace.Pad;
        }
    }

    geometry(geometry: Geometry) {
        this._width = (Workspace.SizePerWorkspace + Workspace.Pad) * this._monitor.workspaces.size;

        return new Geometry({ x: 0, y: 0, width: this._width, height: 18 });
    }

    private _updatePixmaps(owm: OWMLib) {
        const engine = owm.engine;
        const border = this._border;
        const size = Workspace.SizePerWorkspace;

        const activeCtx = engine.createFromSurface(this._activePixmap);
        const inactiveCtx = engine.createFromSurface(this._inactivePixmap);

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
}
