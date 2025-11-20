import {app, BrowserWindow, ipcMain, dialog, Menu, shell} from 'electron';
import {isDev} from "./utils/util.js";
import {getPreloadPath, getUIPath} from "./utils/pathResolver.js";
import {LithophaneProcessor} from "./core/lithophaneProcessor.js";
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { preferencesManager, type UserPreferences} from "./services/preferences.js";
import { spawn, exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFile } from 'fs/promises';
import { PathValidator } from './utils/pathValidator.js';

let mainWindow: BrowserWindow | null = null;

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

    // Load saved window bounds or use defaults
    const savedBounds = preferencesManager.getPreference('windowBounds');
    const windowBounds = savedBounds || { width: 1200, height: 800 };

    mainWindow = new BrowserWindow({
        width: windowBounds.width,
        height: windowBounds.height,
        x: windowBounds.x,
        y: windowBounds.y,
        webPreferences: {
            preload: getPreloadPath(),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: true,
        },
    });

    // Save window bounds on move/resize
    let saveBoundsTimeout: NodeJS.Timeout | null = null;
    const saveWindowBounds = () => {
        if (saveBoundsTimeout) {
            clearTimeout(saveBoundsTimeout);
        }
        saveBoundsTimeout = setTimeout(() => {
            if (mainWindow) {
                const bounds = mainWindow.getBounds();
                preferencesManager.setPreference('windowBounds', {
                    width: bounds.width,
                    height: bounds.height,
                    x: bounds.x,
                    y: bounds.y,
                });
            }
        }, 500); // Debounce to avoid too many saves
    };

    mainWindow.on('resized', saveWindowBounds);
    mainWindow.on('moved', saveWindowBounds);

    // Save window bounds on close
    mainWindow.on('close', () => {
        if (mainWindow) {
            const bounds = mainWindow.getBounds();
            preferencesManager.setPreference('windowBounds', {
                width: bounds.width,
                height: bounds.height,
                x: bounds.x,
                y: bounds.y,
            });
        }
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
        
        // Validate image path
        const pathValidation = PathValidator.validatePathExists(imagePath);
        if (!pathValidation.isValid) {
            return {
                success: false,
                message: 'Invalid image path',
                error: pathValidation.error
            };
        }
        
        const imageExtValidation = PathValidator.validatePath(imagePath, ['.jpg', '.jpeg', '.png', '.bmp', '.gif']);
        if (!imageExtValidation.isValid) {
            return {
                success: false,
                message: 'Invalid image file',
                error: imageExtValidation.error
            };
        }
        
        const processor = LithophaneProcessor.getInstance();
        
        // Set up progress callback
        const progressCallback = (progress: number, message: string) => {
            if (mainWindow) {
                mainWindow.webContents.send('stl-generation-progress', { progress, message });
            }
        };
        
        return await processor.generateSTL(imagePath, settings, progressCallback);
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
            // Basic validation - check if file exists
            if (!existsSync(imagePath)) {
                console.error('Image file does not exist:', imagePath);
                return null;
            }
            
            // Validate extension (less strict - just check extension)
            const ext = PathValidator.getFileExtension(imagePath).toLowerCase();
            const allowedExts = ['.jpg', '.jpeg', '.png', '.bmp', '.gif'];
            if (!ext || !allowedExts.includes(ext)) {
                console.error('Invalid image extension:', ext);
                return null;
            }
            
            const imageBuffer = readFileSync(imagePath);
            const base64 = imageBuffer.toString('base64');
            const mimeType = getMimeType(imagePath);
            return `data:${mimeType};base64,${base64}`;
        } catch (error) {
            console.error('Error reading image for preview:', error);
            return null;
        }
    });

    // Handle dropped files - save temporarily and return path
    ipcMain.handle('handleDroppedFile', async (_, fileDataBase64: string, fileName: string) => {
        try {
            // Sanitize filename
            const sanitizedFilename = PathValidator.sanitizeFilename(fileName);
            if (!sanitizedFilename) {
                throw new Error('Invalid filename');
            }
            
            // Validate file extension
            const extValidation = PathValidator.validatePath(sanitizedFilename, ['.jpg', '.jpeg', '.png', '.bmp', '.gif']);
            if (!extValidation.isValid) {
                throw new Error(extValidation.error || 'Invalid file type');
            }
            
            const tempDir = tmpdir();
            const tempFilename = `dropped_${Date.now()}_${sanitizedFilename}`;
            const tempPath = join(tempDir, tempFilename);
            
            // Validate the final path
            const pathValidation = PathValidator.validatePathInDirectory(tempPath, tempDir);
            if (!pathValidation.isValid) {
                throw new Error(pathValidation.error || 'Invalid path');
            }
            
            // Convert base64 string to Buffer and write to temp file
            const buffer = Buffer.from(fileDataBase64, 'base64');
            await writeFile(tempPath, buffer);
            
            return tempPath;
        } catch (error) {
            console.error('Error handling dropped file:', error);
            throw new Error(`Failed to save dropped file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    // Settings window handler
    ipcMain.handle('openSettings', async () => {
        openSettingsWindow();
    });

    // Theme management handlers (now using preferences)
    ipcMain.handle('getTheme', async () => {
        return preferencesManager.getPreference('theme');
    });

    ipcMain.handle('setTheme', async (_, theme: 'light' | 'dark') => {
        preferencesManager.setPreference('theme', theme);
        if (mainWindow) {
            mainWindow.webContents.send('theme-changed', theme);
        }
        return theme;
    });

    // Preferences handlers
    ipcMain.handle('getPreferences', async () => {
        return preferencesManager.getPreferences();
    });

    ipcMain.handle('getPreference', async (_, key: keyof UserPreferences) => {
        return preferencesManager.getPreference(key);
    });

    ipcMain.handle('setPreference', async (_, key: keyof UserPreferences, value: any) => {
        preferencesManager.setPreference(key, value);
        return value;
    });

    ipcMain.handle('setPreferences', async (_, preferences: Partial<UserPreferences>) => {
        preferencesManager.setPreferences(preferences);
        return preferencesManager.getPreferences();
    });

    ipcMain.handle('resetPreferences', async () => {
        preferencesManager.resetPreferences();
        return preferencesManager.getPreferences();
    });

    // Slicer selection handler
    ipcMain.handle('selectSlicer', async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            title: 'Select Slicer Application',
            filters: [
                { name: 'Executables', extensions: process.platform === 'win32' ? ['exe'] : process.platform === 'darwin' ? ['app'] : [''] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
            const slicerPath = result.filePaths[0];
            preferencesManager.setPreference('slicerPath', slicerPath);
            return slicerPath;
        }
        return null;
    });

    // Open file in slicer handler (accepts either file path or STL content)
    ipcMain.handle('openInSlicer', async (_, filePathOrContent: string, isContent: boolean = false, filename?: string) => {
        const slicerPath = preferencesManager.getPreference('slicerPath');
        
        if (!slicerPath) {
            throw new Error('No slicer application selected. Please select a slicer in Settings.');
        }

        // Validate slicer path
        const slicerPathValidation = PathValidator.validatePathExists(slicerPath);
        if (!slicerPathValidation.isValid) {
            throw new Error(`Slicer application not found at: ${slicerPath}. Please update the slicer path in Settings.`);
        }

        let filePath: string;

        if (isContent) {
            // Save STL content to temporary file
            const tempDir = tmpdir();
            const sanitizedFilename = filename ? PathValidator.sanitizeFilename(filename) : `lithophane_${Date.now()}.stl`;
            const finalFilename = sanitizedFilename.endsWith('.stl') ? sanitizedFilename : `${sanitizedFilename}.stl`;
            filePath = join(tempDir, finalFilename);
            
            // Validate path
            const pathValidation = PathValidator.validatePathInDirectory(filePath, tempDir);
            if (!pathValidation.isValid) {
                throw new Error(pathValidation.error || 'Invalid file path');
            }
            
            try {
                writeFileSync(filePath, filePathOrContent, 'utf8');
            } catch (error: any) {
                throw new Error(`Failed to save STL file: ${error.message}`);
            }
        } else {
            filePath = filePathOrContent;
            
            // Validate STL file path
            const pathValidation = PathValidator.validatePathExists(filePath);
            if (!pathValidation.isValid) {
                throw new Error(pathValidation.error || `STL file not found: ${filePath}`);
            }
            
            const extValidation = PathValidator.validatePath(filePath, ['.stl']);
            if (!extValidation.isValid) {
                throw new Error('Invalid file type. Expected STL file.');
            }
        }

        try {
            if (process.platform === 'darwin') {
                // macOS: Use 'open' command for .app bundles
                spawn('open', ['-a', slicerPath, filePath], { detached: true });
            } else if (process.platform === 'win32') {
                // Windows: Use PowerShell to properly handle paths with spaces
                // PowerShell handles paths with spaces much better than cmd.exe
                const psCommand = `Start-Process -FilePath "${slicerPath.replace(/"/g, '`"')}" -ArgumentList "${filePath.replace(/"/g, '`"')}"`;
                exec(`powershell -Command "${psCommand}"`, (error: any) => {
                    if (error) {
                        console.error('Error opening slicer:', error);
                        // Fallback to cmd.exe method if PowerShell fails
                        const escapedSlicerPath = slicerPath.replace(/"/g, '""');
                        const escapedFilePath = filePath.replace(/"/g, '""');
                        const cmdCommand = `start "" "${escapedSlicerPath}" "${escapedFilePath}"`;
                        exec(cmdCommand, { shell: 'cmd.exe' }, (fallbackError: any) => {
                            if (fallbackError) {
                                console.error('Fallback method also failed:', fallbackError);
                            }
                        });
                    }
                });
            } else {
                // Linux: Execute directly
                spawn(slicerPath, [filePath], { detached: true });
            }
            return { success: true, filePath };
        } catch (error: any) {
            throw new Error(`Failed to open slicer: ${error.message}`);
        }
    });

    // Send initial theme to renderer
    mainWindow.webContents.on('did-finish-load', () => {
        if (mainWindow) {
            const theme = preferencesManager.getPreference('theme');
            mainWindow.webContents.send('theme-changed', theme);
        }
    });
});

function openSettingsWindow() {
    if (!mainWindow) return;
    
    const settingsWindow = new BrowserWindow({
        width: 600,
        height: 500,
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
        .slicer-path {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }
        .slicer-path-display {
            padding: 0.75rem;
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            font-size: 0.875rem;
            color: #666;
            word-break: break-all;
            min-height: 2.5rem;
            display: flex;
            align-items: center;
        }
        [data-theme="dark"] .slicer-path-display {
            background: #2a2a2a;
            border-color: rgba(255, 255, 255, 0.2);
            color: rgba(255, 255, 255, 0.7);
        }
        .slicer-path-display.empty {
            color: #999;
            font-style: italic;
        }
        [data-theme="dark"] .slicer-path-display.empty {
            color: rgba(255, 255, 255, 0.4);
        }
        .slicer-path button {
            padding: 0.75rem 1.5rem;
            border: 2px solid #667eea;
            border-radius: 8px;
            background: #667eea;
            color: white;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.2s;
            font-weight: 500;
        }
        [data-theme="dark"] .slicer-path button {
            background: #8a9aff;
            border-color: #8a9aff;
            color: #1a1a1a;
        }
        .slicer-path button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        .slicer-path button:active {
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
        <div class="setting-item">
            <label class="setting-label">Slicer Application</label>
            <div class="slicer-path">
                <div id="slicer-path-display" class="slicer-path-display empty">No slicer selected</div>
                <button id="select-slicer-btn">Select Slicer...</button>
            </div>
        </div>
    </div>
    <script>
        let currentTheme = 'light';
        let currentSlicerPath = null;
        
        // Get initial theme
        window.electron.getTheme().then(theme => {
            currentTheme = theme;
            updateUI();
        });
        
        // Get initial slicer path
        window.electron.getPreference('slicerPath').then(path => {
            currentSlicerPath = path;
            updateSlicerPath();
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
        
        function updateSlicerPath() {
            const display = document.getElementById('slicer-path-display');
            if (currentSlicerPath) {
                display.textContent = currentSlicerPath;
                display.classList.remove('empty');
            } else {
                display.textContent = 'No slicer selected';
                display.classList.add('empty');
            }
        }
        
        document.getElementById('light-theme').addEventListener('click', () => {
            window.electron.setTheme('light');
        });
        
        document.getElementById('dark-theme').addEventListener('click', () => {
            window.electron.setTheme('dark');
        });
        
        document.getElementById('select-slicer-btn').addEventListener('click', async () => {
            try {
                const path = await window.electron.selectSlicer();
                if (path) {
                    currentSlicerPath = path;
                    updateSlicerPath();
                }
            } catch (error) {
                console.error('Error selecting slicer:', error);
            }
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