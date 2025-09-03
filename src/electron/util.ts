import {ipcMain} from "electron";
import WebContents = Electron.WebContents;
import {getUIPath} from "./pathResolver.js";
import {pathToFileURL} from "url";
import type { EventPayloadMapping } from "../../types.js";

export function isDev():boolean{
    return process.env.NODE_ENV === "development";
}

export function  ipcMainHandle<Key extends keyof EventPayloadMapping>(
    key: Key,
    handler: () => EventPayloadMapping[Key]
) {
    ipcMain.handle(key as string, (event) => {
        validateEventFrame(event.sender)
        return handler()
    });
}

export function ipcWebContentSend<Key extends keyof EventPayloadMapping>(
    key: Key,
    webContents: WebContents,
    payload: EventPayloadMapping[Key]
){
    webContents.send(key as string, payload);
}

export function validateEventFrame(webContents: WebContents){
    if  (isDev() && new URL(webContents.getURL()).host === 'localhost:5523'){
        return;
    }
    if  (webContents.getURL() !== pathToFileURL(getUIPath()).toString()){
        throw new Error ("malicious event");
    }
}

