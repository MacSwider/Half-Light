const electron = require("electron");
import type { EventPayloadMapping } from "../../types.js";

electron.contextBridge.exposeInMainWorld("electron",{
    processImage: (imagePath: string, settings: any) => ipcInvoke('processImage', imagePath, settings),
    generateSTL: (imagePath: string, settings: any) => ipcInvoke('generateSTL', imagePath, settings),
    selectImage: () => ipcInvoke('selectImage'),
    getImagePreview: (imagePath: string) => ipcInvoke('getImagePreview', imagePath),
    getTheme: () => ipcInvoke('getTheme'),
    setTheme: (theme: 'light' | 'dark') => ipcInvoke('setTheme', theme),
    openSettings: () => ipcInvoke('openSettings'),
    onThemeChanged: (callback: (theme: 'light' | 'dark') => void) => {
        electron.ipcRenderer.on('theme-changed', (_: any, theme: 'light' | 'dark') => callback(theme));
    },
    onMenuSelectImage: (callback: () => void) => {
        // Remove existing listeners to prevent duplicates
        // This is a safety measure - ideally React should manage this properly
        electron.ipcRenderer.removeAllListeners('menu-select-image');
        electron.ipcRenderer.on('menu-select-image', callback);
    },
    onMenuGenerateSTL: (callback: () => void) => {
        // Remove existing listeners to prevent duplicates
        // This is a safety measure - ideally React should manage this properly
        electron.ipcRenderer.removeAllListeners('menu-generate-stl');
        electron.ipcRenderer.on('menu-generate-stl', callback);
    },
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