#!/usr/bin/env node

import { default as Options } from "@jhanssen/options";
//import * as WebSocket from "ws";
// I have no idea why the above statement doesn't work but this one does
import WebSocket = require("ws");
import { join } from "path";

const options = Options("owmcli");

function stringOption(key: string): string | undefined
{
    const value = options(key);
    if (typeof value === "string") {
        return value;
    }
    return undefined;
}

const knownCommands = [
    "exit",
    "restart",
    "message"
];

const cmd = stringOption("cmd");
const payload = stringOption("payload");
const sock = stringOption("sock");
let payloadType = stringOption("payload-type") || "auto";
if (payloadType !== "auto" && payloadType !== "json" && payloadType !== "string") {
    console.error("Invalid payload-type", payloadType);
    process.exit(1);
}

let display = stringOption("display");
if (display === undefined) {
    // read from env
    if ("DISPLAY" in process.env) {
        display = process.env.DISPLAY;
    }
}
if (display === undefined) {
    display = ":0";
}
const eq = display.lastIndexOf(":");
if (eq !== 0) {
    console.error("invalid display", display);
    process.exit();
}

const path = join("/tmp", (sock || "owm") + "." + display.substr(eq + 1) + ".sock");

if (cmd === undefined) {
    console.error("needs a cmd");
    process.exit();
}

if (cmd !== undefined && knownCommands.includes(cmd)) {
    const ws = new WebSocket("ws+unix://" + path);
    ws.on("message", (msg: string) => {
        console.log(msg);
        process.exit();
    });
    ws.on("error", (err: Error) => {
        console.log(err);
        process.exit();
    });
    ws.on("close", () => {
        process.exit();
    });
    ws.on("open", () => {
        let message: {
            type: string;
            payload: any;
        } = {
            type: cmd,
            payload: undefined
        };
        if (payload) {
            if (payloadType !== "string") {
                try {
                    message.payload = JSON.parse(payload);
                } catch (err) {
                    if (payloadType === "json") {
                        console.error("Invalid json", err);
                        process.exit();
                    }
                    message.payload = payload;
                }
            } else {
                message.payload = payload;
            }
        }
        ws.send(JSON.stringify(message));
    });
} else {
    console.log("unknown command", cmd);
    console.log("  available commands", knownCommands);
}
