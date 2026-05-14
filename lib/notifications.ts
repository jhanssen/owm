// Implements org.freedesktop.Notifications on the session bus so that
// `notify-send` and other libnotify clients deliver into owm.
//
// Wire shape follows the Desktop Notifications Specification 1.2:
//   https://specifications.freedesktop.org/notification-spec/latest/
//
// Public surface (consumed from a user config like ~/.config/owm/index.js):
//
//   owmlib.events.on("notification", (data) => { ... })
//   owmlib.events.on("notificationClosed", ({ id, reason }) => { ... })
//   owmlib.notifications.close(id?)         -- dismiss latest or specific id
//   owmlib.notifications.closeAll()
//   owmlib.notifications.invokeAction(id?, key?)
//   owmlib.notifications.active             -- snapshot of active notifications
//   owmlib.notifications.defaultTimeout = 5000
//   owmlib.notifications.capabilities = ["body", "actions"]

import * as dbus from "dbus-next";
import { OWMLib } from "./owm";
import { Logger } from "./logger";

const SERVICE_NAME = "org.freedesktop.Notifications";
const OBJECT_PATH = "/org/freedesktop/Notifications";
const INTERFACE_NAME = "org.freedesktop.Notifications";

export enum NotificationCloseReason {
    Expired = 1,
    Dismissed = 2,
    CloseNotification = 3,
    Undefined = 4,
}

export enum NotificationUrgency {
    Low = 0,
    Normal = 1,
    Critical = 2,
}

export interface NotificationHints {
    urgency?: NotificationUrgency;
    category?: string;
    [key: string]: unknown;
}

export interface NotificationData {
    id: number;
    appName: string;
    replacesId: number;
    appIcon: string;
    summary: string;
    body: string;
    // Flat list of [key, label, key, label, ...] pairs as supplied by the client.
    actions: string[];
    hints: NotificationHints;
    // Resolved timeout in milliseconds. 0 means never auto-expire.
    expireTimeout: number;
}

export interface NotificationClosedEvent {
    id: number;
    reason: NotificationCloseReason;
}

interface NotificationsHost {
    _onNotify(appName: string,
              replacesId: number,
              appIcon: string,
              summary: string,
              body: string,
              actions: string[],
              hints: { [key: string]: dbus.Variant },
              expireTimeout: number): number;
    _onCloseNotification(id: number): void;
    _capabilities(): string[];
}

// The actual D-Bus surface. Methods/signals are declared as plain class
// members and wired up with the static `configureMembers` helper below, so we
// do not need TypeScript experimentalDecorators.
class NotificationsInterfaceImpl extends dbus.interface.Interface {
    private _host: NotificationsHost;

    constructor(host: NotificationsHost) {
        super(INTERFACE_NAME);
        this._host = host;
    }

    public Notify(appName: string,
                  replacesId: number,
                  appIcon: string,
                  summary: string,
                  body: string,
                  actions: string[],
                  hints: { [key: string]: dbus.Variant },
                  expireTimeout: number): number {
        return this._host._onNotify(appName, replacesId, appIcon, summary, body,
                                    actions, hints, expireTimeout);
    }

    public CloseNotification(id: number): void {
        this._host._onCloseNotification(id);
    }

    public GetCapabilities(): string[] {
        return this._host._capabilities();
    }

    public GetServerInformation(): [string, string, string, string] {
        return ["owm", "owm", "1.0", "1.2"];
    }

    // Signal bodies. configureMembers replaces the prototype slot with a
    // wrapper that calls this, then forwards the returned tuple onto the bus.
    public NotificationClosed(id: number, reason: number): [number, number] {
        return [id, reason];
    }

    public ActionInvoked(id: number, actionKey: string): [number, string] {
        return [id, actionKey];
    }
}

NotificationsInterfaceImpl.configureMembers({
    methods: {
        Notify: { inSignature: "susssasa{sv}i", outSignature: "u" },
        CloseNotification: { inSignature: "u", outSignature: "" },
        GetCapabilities: { inSignature: "", outSignature: "as" },
        GetServerInformation: { inSignature: "", outSignature: "ssss" },
    },
    signals: {
        NotificationClosed: { signature: "uu" },
        ActionInvoked: { signature: "us" },
    },
});

interface ActiveNotification {
    data: NotificationData;
    timer: NodeJS.Timeout | undefined;
    // Order in which it became active; used to find the "latest" notification
    // for keybinds that operate without an explicit id.
    sequence: number;
}

export class Notifications implements NotificationsHost {
    private _owm: OWMLib;
    private _log: Logger;
    private _bus: dbus.MessageBus | undefined;
    private _iface: NotificationsInterfaceImpl | undefined;
    private _active: Map<number, ActiveNotification>;
    private _nextId: number;
    private _sequence: number;
    private _defaultTimeout: number;
    private _capabilitiesList: string[];
    private _disabled: boolean;

    constructor(owm: OWMLib) {
        this._owm = owm;
        this._log = owm.logger.prefixed("notifications");
        this._bus = undefined;
        this._iface = undefined;
        this._active = new Map<number, ActiveNotification>();
        this._nextId = 1;
        this._sequence = 0;
        this._defaultTimeout = 5000;
        // We advertise "body" (we render the text) and "actions" (the config
        // can invoke them, even though we do not draw action buttons).
        this._capabilitiesList = ["body", "actions"];
        this._disabled = false;
    }

    disable(): void {
        this._disabled = true;
        if (this._bus !== undefined) {
            this.cleanup();
        }
    }

    get disabled(): boolean {
        return this._disabled;
    }

    get defaultTimeout(): number {
        return this._defaultTimeout;
    }
    set defaultTimeout(ms: number) {
        if (typeof ms !== "number" || ms < 0 || !isFinite(ms)) {
            throw new Error(`invalid defaultTimeout ${ms}`);
        }
        this._defaultTimeout = ms;
    }

    get capabilities(): string[] {
        return this._capabilitiesList.slice();
    }
    set capabilities(caps: string[]) {
        this._capabilitiesList = caps.slice();
    }

    get active(): NotificationData[] {
        const entries = Array.from(this._active.values());
        entries.sort((a, b) => a.sequence - b.sequence);
        return entries.map(e => e.data);
    }

    get connected(): boolean {
        return this._iface !== undefined;
    }

    async init(): Promise<void> {
        if (this._disabled) {
            this._log.info("notifications daemon disabled by config; skipping bus registration");
            return;
        }
        if (this._bus !== undefined) {
            this._log.warn("init called twice");
            return;
        }
        try {
            const bus = dbus.sessionBus();
            this._bus = bus;
            bus.on("error", (err) => {
                this._log.error("dbus session bus error",
                                err instanceof Error ? err.message : err);
            });
            const reply = await bus.requestName(
                SERVICE_NAME,
                dbus.NameFlag.REPLACE_EXISTING | dbus.NameFlag.DO_NOT_QUEUE
            );
            if (reply !== dbus.RequestNameReply.PRIMARY_OWNER
                && reply !== dbus.RequestNameReply.ALREADY_OWNER) {
                this._log.warn(`could not own ${SERVICE_NAME}, RequestName reply=${reply};`
                               + " another notification daemon is running. Skipping.");
                try { bus.disconnect(); } catch (_e) { /* ignore */ }
                this._bus = undefined;
                return;
            }
            const iface = new NotificationsInterfaceImpl(this);
            bus.export(OBJECT_PATH, iface);
            this._iface = iface;
            this._log.info(`registered ${SERVICE_NAME} on ${OBJECT_PATH}`);
        } catch (err) {
            this._log.error("failed to register notifications service",
                            err instanceof Error ? err.message : err);
            if (this._bus) {
                try { this._bus.disconnect(); } catch (_e) { /* ignore */ }
            }
            this._bus = undefined;
            this._iface = undefined;
        }
    }

    cleanup(): void {
        // Cancel pending expirations and forget state without emitting
        // close events: owm is going away.
        for (const entry of this._active.values()) {
            if (entry.timer) {
                clearTimeout(entry.timer);
            }
        }
        this._active.clear();

        if (this._iface && this._bus) {
            try {
                this._bus.unexport(OBJECT_PATH, this._iface);
            } catch (_e) { /* ignore */ }
        }
        if (this._bus) {
            try { this._bus.disconnect(); } catch (_e) { /* ignore */ }
        }
        this._iface = undefined;
        this._bus = undefined;
    }

    // ----- public, imperative API used from the user's config -----

    /** Dismiss a notification. Defaults to the most recently added one. */
    close(id?: number): boolean {
        const target = id !== undefined ? id : this._latestId();
        if (target === undefined) {
            return false;
        }
        return this._closeInternal(target, NotificationCloseReason.Dismissed, false);
    }

    /** Dismiss every active notification (user-initiated). */
    closeAll(): void {
        for (const id of Array.from(this._active.keys())) {
            this._closeInternal(id, NotificationCloseReason.Dismissed, false);
        }
    }

    /**
     * Invoke an action and close the notification (matches the dunst keybind
     * behavior the config replaced).
     *
     * Calling forms:
     *   invokeAction()                 // latest, "default"
     *   invokeAction("reply")          // latest, "reply"
     *   invokeAction(42)               // id=42, "default"
     *   invokeAction(42, "reply")      // id=42, "reply"
     */
    invokeAction(idOrKey?: number | string, key?: string): boolean {
        let id: number | undefined;
        let actionKey: string;
        if (typeof idOrKey === "number") {
            id = idOrKey;
            actionKey = key || "default";
        } else {
            id = this._latestId();
            actionKey = idOrKey || "default";
        }
        if (id === undefined || !this._active.has(id)) {
            return false;
        }
        if (this._iface) {
            try {
                this._iface.ActionInvoked(id, actionKey);
            } catch (err) {
                this._log.error("failed to emit ActionInvoked",
                                err instanceof Error ? err.message : err);
            }
        }
        // Most senders close the notification themselves after their
        // ActionInvoked handler runs; close it ourselves so dismiss is
        // deterministic if the sender does not.
        this._closeInternal(id, NotificationCloseReason.Dismissed, false);
        return true;
    }

    // ----- NotificationsHost (called from the dbus Interface) -----

    public _onNotify(appName: string,
                     replacesId: number,
                     appIcon: string,
                     summary: string,
                     body: string,
                     actions: string[],
                     hints: { [key: string]: dbus.Variant },
                     expireTimeout: number): number {
        // Resolve target id. replaces_id == 0 means "allocate new".
        let id: number;
        if (replacesId !== 0 && this._active.has(replacesId)) {
            id = replacesId;
            const prev = this._active.get(id);
            if (prev && prev.timer) {
                clearTimeout(prev.timer);
                prev.timer = undefined;
            }
        } else {
            id = this._allocId();
        }

        // Resolve timeout. expire_timeout == -1 means "default", 0 means "never".
        let timeoutMs: number;
        if (typeof expireTimeout !== "number" || expireTimeout < 0) {
            timeoutMs = this._defaultTimeout;
        } else {
            timeoutMs = expireTimeout;
        }

        // Unwrap Variant values in hints to plain JS values so consumers do
        // not need to import dbus-next.
        const flatHints: NotificationHints = {};
        if (hints) {
            for (const k of Object.keys(hints)) {
                const v = hints[k];
                if (v !== undefined && v !== null && typeof v === "object" && "value" in v) {
                    flatHints[k] = (v as dbus.Variant).value;
                } else {
                    flatHints[k] = v as unknown;
                }
            }
        }

        const data: NotificationData = {
            id: id,
            appName: appName || "",
            replacesId: replacesId,
            appIcon: appIcon || "",
            summary: summary || "",
            body: body || "",
            actions: actions ? actions.slice() : [],
            hints: flatHints,
            expireTimeout: timeoutMs,
        };

        const entry: ActiveNotification = {
            data: data,
            timer: undefined,
            sequence: ++this._sequence,
        };
        if (timeoutMs > 0) {
            entry.timer = setTimeout(() => {
                this._closeInternal(id, NotificationCloseReason.Expired, false);
            }, timeoutMs);
        }
        this._active.set(id, entry);

        try {
            this._owm.events.emit("notification", data);
        } catch (err) {
            this._log.error("listener threw on notification event",
                            err instanceof Error ? err.stack || err.message : err);
        }

        return id;
    }

    public _onCloseNotification(id: number): void {
        this._closeInternal(id, NotificationCloseReason.CloseNotification, false);
    }

    public _capabilities(): string[] {
        return this._capabilitiesList.slice();
    }

    // ----- internals -----

    private _closeInternal(id: number, reason: NotificationCloseReason, silent: boolean): boolean {
        const entry = this._active.get(id);
        if (!entry) {
            return false;
        }
        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
        }
        this._active.delete(id);
        if (!silent) {
            if (this._iface) {
                try {
                    this._iface.NotificationClosed(id, reason);
                } catch (err) {
                    this._log.error("failed to emit NotificationClosed",
                                    err instanceof Error ? err.message : err);
                }
            }
            const evt: NotificationClosedEvent = { id: id, reason: reason };
            try {
                this._owm.events.emit("notificationClosed", evt);
            } catch (err) {
                this._log.error("listener threw on notificationClosed event",
                                err instanceof Error ? err.stack || err.message : err);
            }
        }
        return true;
    }

    private _allocId(): number {
        // UInt32 wrap-around, skipping 0 (which has a reserved meaning on the
        // wire) and any id currently in use.
        let id = this._nextId;
        for (let i = 0; i < 0x100000000; ++i) {
            if (id !== 0 && !this._active.has(id)) {
                this._nextId = (id + 1) >>> 0;
                if (this._nextId === 0) {
                    this._nextId = 1;
                }
                return id;
            }
            id = (id + 1) >>> 0;
            if (id === 0) {
                id = 1;
            }
        }
        // Practically unreachable: would require 2^32 concurrent active
        // notifications.
        throw new Error("notification id space exhausted");
    }

    private _latestId(): number | undefined {
        let latest: number | undefined = undefined;
        let latestSeq = -1;
        for (const entry of this._active.values()) {
            if (entry.sequence > latestSeq) {
                latestSeq = entry.sequence;
                latest = entry.data.id;
            }
        }
        return latest;
    }
}
