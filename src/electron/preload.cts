const electron = require("electron");
import type { EventPayloadMapping } from "../../types.js";

electron.contextBridge.exposeInMainWorld("electron",{
    processImage: (imagePath: string, settings: any) => ipcInvoke('processImage', imagePath, settings),
    generateSTL: (imagePath: string, settings: any) => ipcInvoke('generateSTL', imagePath, settings),
    selectImage: () => ipcInvoke('selectImage'),
    getImagePreview: (imagePath: string) => ipcInvoke('getImagePreview', imagePath),
    getTheme: () => ipcInvoke('getTheme'),
    setTheme: (theme: 'light' | 'dark' | 'high-contrast') => ipcInvoke('setTheme', theme),
    openSettings: () => ipcInvoke('openSettings'),
    getPreferences: () => ipcInvoke('getPreferences'),
    getPreference: (key: string) => ipcInvoke('getPreference', key),
    setPreference: (key: string, value: any) => ipcInvoke('setPreference', key, value),
    setPreferences: (preferences: any) => ipcInvoke('setPreferences', preferences),
    resetPreferences: () => ipcInvoke('resetPreferences'),
    selectSlicer: () => ipcInvoke('selectSlicer'),
    openInSlicer: (filePathOrContent: string, isContent?: boolean, filename?: string) => ipcInvoke('openInSlicer', filePathOrContent, isContent, filename),
    handleDroppedFile: (fileDataBase64: string, fileName: string) => ipcInvoke('handleDroppedFile', fileDataBase64, fileName),
    onThemeChanged: (callback: (theme: 'light' | 'dark' | 'high-contrast') => void) => {
        electron.ipcRenderer.on('theme-changed', (_: any, theme: 'light' | 'dark' | 'high-contrast') => callback(theme));
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
    onSTLGenerationProgress: (callback: (progress: { progress: number; message: string }) => void) => {
        electron.ipcRenderer.removeAllListeners('stl-generation-progress');
        electron.ipcRenderer.on('stl-generation-progress', (_: any, data: { progress: number; message: string }) => callback(data));
    },
} satisfies Window["electron"]);

function ipcInvoke<Key extends keyof EventPayloadMapping>(
    key: Key,
    ...args: any[]
):  Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key, ...args);
}
