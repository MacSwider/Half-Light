const electron = require("electron");
import type { EventPayloadMapping } from "../../types.js";

electron.contextBridge.exposeInMainWorld("electron",{
    subscribeStatistic: (callback) => {
        ipcOn("statistics", (stats: any) => {
            callback(stats);
        })
    },
    getStaticData: () => ipcInvoke('getStaticData'),
    processImage: (imagePath: string, settings: any) => ipcInvoke('processImage', imagePath, settings),
    generateSTL: (imagePath: string, settings: any) => ipcInvoke('generateSTL', imagePath, settings),
    selectImage: () => ipcInvoke('selectImage'),
    getImagePreview: (imagePath: string) => ipcInvoke('getImagePreview', imagePath),
} satisfies Window["electron"]);

function ipcInvoke<Key extends keyof EventPayloadMapping>(
    key: Key,
    ...args: any[]
):  Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventPayloadMapping>(
    key: Key,
    callback: (payload: EventPayloadMapping[Key]) => void
) {
    electron.ipcRenderer.on(key, (_: any, payload: EventPayloadMapping[Key]) => callback(payload));
}   