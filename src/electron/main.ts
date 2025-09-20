import {app, BrowserWindow, ipcMain, dialog, Menu} from 'electron';
import {isDev} from "./util.js";
import {getPreloadPath, getUIPath} from "./pathResolver.js";
import {LithophaneProcessor} from "./lithophaneProcessor.js";
import { readFileSync } from 'fs';

app.on("ready", () => {
    // Create the application menu
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Select Image',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => {
                        // Trigger image selection
                        if (mainWindow) {
                            mainWindow.webContents.send('menu-select-image');
                        }
                    }
                },
                {
                    label: 'Generate STL',
                    accelerator: 'CmdOrCtrl+G',
                    click: () => {
                        // Trigger STL generation
                        if (mainWindow) {
                            mainWindow.webContents.send('menu-generate-stl');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Settings',
            submenu: [
                {
                    label: 'Preferences...',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => {
                        openSettingsWindow();
                    }
                }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About Half-Light',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About Half-Light',
                            message: 'Half-Light',
                            detail: 'A lithophane STL generator\nVersion 1.0.0'
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: getPreloadPath(),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: true,
        },
    });

    if(isDev()){
        mainWindow.loadURL('http://localhost:5523');
        // Open DevTools in development
        mainWindow.webContents.openDevTools();
    }else{
        mainWindow.loadFile(getUIPath());
    }


    // Lithophane processing handlers
    ipcMain.handle('processImage', async (_, imagePath: string, settings: any) => {
        const processor = LithophaneProcessor.getInstance();
        return await processor.processImage(imagePath, settings);
    });

    ipcMain.handle('generateSTL', async (_, imagePath: string, settings: any) => {
        console.log('DEBUG: Main process received settings:', settings);
        console.log('DEBUG: Main process resolutionMultiplier:', settings.resolutionMultiplier);
        const processor = LithophaneProcessor.getInstance();
        return await processor.generateSTL(imagePath, settings);
    });

    // File dialog handler for image selection
    ipcMain.handle('selectImage', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'gif'] }
            ]
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });

    // Image preview handler - convert image to base64
    ipcMain.handle('getImagePreview', async (_, imagePath: string) => {
        try {
            const imageBuffer = readFileSync(imagePath);
            const base64 = imageBuffer.toString('base64');
            const mimeType = getMimeType(imagePath);
            return `data:${mimeType};base64,${base64}`;
        } catch (error) {
            console.error('Error reading image for preview:', error);
            return null;
        }
    });

    // Settings window handler
    ipcMain.handle('openSettings', async () => {
        openSettingsWindow();
    });
});

function openSettingsWindow() {
    const settingsWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: 'Settings',
        modal: true,
        parent: undefined, // Remove parent to show its own menu bar
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: true,
        },
    });

    // For now, just show a placeholder
    settingsWindow.loadURL('data:text/html,<html><body><h1>Settings</h1><p>Settings window - coming soon!</p></body></html>');
}

function getMimeType(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();
    switch (ext) {
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'png':
            return 'image/png';
        case 'bmp':
            return 'image/bmp';
        case 'gif':
            return 'image/gif';
        default:
            return 'image/jpeg';
    }
}