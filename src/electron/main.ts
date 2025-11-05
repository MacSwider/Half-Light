import {app, BrowserWindow, ipcMain, dialog, Menu} from 'electron';
import {isDev} from "./util.js";
import {getPreloadPath, getUIPath} from "./pathResolver.js";
import {LithophaneProcessor} from "./lithophaneProcessor.js";
import { readFileSync } from 'fs';

let mainWindow: BrowserWindow | null = null;
let currentTheme: 'light' | 'dark' = 'light';

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
                        if (mainWindow) {
                            dialog.showMessageBox(mainWindow, {
                                type: 'info',
                                title: 'About Half-Light',
                                message: 'Half-Light',
                                detail: 'A lithophane STL generator\nVersion 1.0.0'
                            });
                        }
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    mainWindow = new BrowserWindow({
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
        if (!mainWindow) return null;
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

    // Theme management handlers
    ipcMain.handle('getTheme', async () => {
        return currentTheme;
    });

    ipcMain.handle('setTheme', async (_, theme: 'light' | 'dark') => {
        currentTheme = theme;
        if (mainWindow) {
            mainWindow.webContents.send('theme-changed', theme);
        }
        return theme;
    });

    // Send initial theme to renderer
    mainWindow.webContents.on('did-finish-load', () => {
        if (mainWindow) {
            mainWindow.webContents.send('theme-changed', currentTheme);
        }
    });
});

function openSettingsWindow() {
    if (!mainWindow) return;
    
    const settingsWindow = new BrowserWindow({
        width: 600,
        height: 400,
        title: 'Settings',
        modal: true,
        parent: mainWindow,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: true,
            preload: getPreloadPath(),
        },
    });

    // Create settings HTML with theme toggle
    const settingsHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Settings</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            padding: 2rem;
            background: #f5f5f5;
            color: #333;
        }
        [data-theme="dark"] body {
            background: #1a1a1a;
            color: #e0e0e0;
        }
        .container {
            max-width: 500px;
            margin: 0 auto;
        }
        h1 {
            margin-bottom: 2rem;
            font-size: 1.75rem;
        }
        .setting-item {
            background: white;
            padding: 1.5rem;
            border-radius: 12px;
            margin-bottom: 1rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        [data-theme="dark"] .setting-item {
            background: #2a2a2a;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .setting-label {
            font-weight: 600;
            margin-bottom: 1rem;
            display: block;
        }
        .theme-toggle {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .theme-toggle button {
            flex: 1;
            padding: 0.75rem 1.5rem;
            border: 2px solid #667eea;
            border-radius: 8px;
            background: white;
            color: #667eea;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.2s;
        }
        [data-theme="dark"] .theme-toggle button {
            background: #2a2a2a;
            color: #8a9aff;
            border-color: #8a9aff;
        }
        .theme-toggle button.active {
            background: #667eea;
            color: white;
        }
        [data-theme="dark"] .theme-toggle button.active {
            background: #8a9aff;
            color: #1a1a1a;
        }
        .theme-toggle button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        .theme-toggle button:active {
            transform: translateY(0);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Settings</h1>
        <div class="setting-item">
            <label class="setting-label">Theme</label>
            <div class="theme-toggle">
                <button id="light-theme" class="active">☀️ Light</button>
                <button id="dark-theme">🌙 Dark</button>
            </div>
        </div>
    </div>
    <script>
        let currentTheme = 'light';
        
        // Get initial theme
        window.electron.getTheme().then(theme => {
            currentTheme = theme;
            updateUI();
        });
        
        // Listen for theme changes
        window.electron.onThemeChanged((theme) => {
            currentTheme = theme;
            updateUI();
        });
        
        function updateUI() {
            document.documentElement.setAttribute('data-theme', currentTheme);
            document.getElementById('light-theme').classList.toggle('active', currentTheme === 'light');
            document.getElementById('dark-theme').classList.toggle('active', currentTheme === 'dark');
        }
        
        document.getElementById('light-theme').addEventListener('click', () => {
            window.electron.setTheme('light');
        });
        
        document.getElementById('dark-theme').addEventListener('click', () => {
            window.electron.setTheme('dark');
        });
    </script>
</body>
</html>`;
    
    settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(settingsHTML)}`);
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