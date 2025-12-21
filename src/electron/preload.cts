const electron = require("electron");
import type { EventPayloadMapping, LithophaneSettings, UserPreferences } from "../../types.js";

electron.contextBridge.exposeInMainWorld("electron",{
    processImage: (imagePath: string, settings: LithophaneSettings) => ipcInvoke('processImage', imagePath, settings),
    generateSTL: (imagePath: string, settings: LithophaneSettings) => ipcInvoke('generateSTL', imagePath, settings),
    selectImage: () => ipcInvoke('selectImage'),
    getImagePreview: (imagePath: string) => ipcInvoke('getImagePreview', imagePath),
    getTheme: () => ipcInvoke('getTheme'),
    setTheme: (theme: 'light' | 'dark' | 'high-contrast') => ipcInvoke('setTheme', theme),
    openSettings: () => ipcInvoke('openSettings'),
    getPreferences: () => ipcInvoke('getPreferences'),
    getPreference: <K extends keyof UserPreferences>(key: K) => ipcInvoke('getPreference', key) as Promise<UserPreferences[K]>,
    setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => ipcInvoke('setPreference', key, value) as Promise<UserPreferences[K]>,
    setPreferences: (preferences: Partial<UserPreferences>) => ipcInvoke('setPreferences', preferences),
    resetPreferences: () => ipcInvoke('resetPreferences'),
    selectSlicer: () => ipcInvoke('selectSlicer'),
    openInSlicer: (filePathOrContent: string, isContent?: boolean, filename?: string) => ipcInvoke('openInSlicer', filePathOrContent, isContent, filename),
    handleDroppedFile: (fileDataBase64: string, fileName: string) => ipcInvoke('handleDroppedFile', fileDataBase64, fileName),
    onThemeChanged: (callback: (theme: 'light' | 'dark' | 'high-contrast') => void) => {
        electron.ipcRenderer.on('theme-changed', (_: unknown, theme: 'light' | 'dark' | 'high-contrast') => callback(theme));
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
        electron.ipcRenderer.on('stl-generation-progress', (_: unknown, data: { progress: number; message: string }) => callback(data));
    },
} satisfies Window["electron"]);

function ipcInvoke<Key extends keyof EventPayloadMapping>(
    key: Key,
    ...args: unknown[]
):  Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key, ...args);
}
