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
    "exit"
];

const cmd = stringOption("cmd");
const sock = stringOption("sock");

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
        ws.send(cmd);
    });
} else {
    console.log("unknown command", cmd);
    console.log("  available commands", knownCommands);
}