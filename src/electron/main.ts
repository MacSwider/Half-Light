import {app, BrowserWindow, ipcMain, dialog, Menu} from 'electron';
import {isDev} from "./utils/util.js";
import {getPreloadPath, getUIPath, getSettingsWindowPath, getIconPath} from "./utils/pathResolver.js";
import {LithophaneProcessor} from "./core/lithophaneProcessor.js";
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { preferencesManager, type UserPreferences} from "./services/preferences.js";
import { spawn, exec } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFile } from 'fs/promises';
import { PathValidator } from './utils/pathValidator.js';
import { logger } from './utils/logger.js';

let mainWindow: BrowserWindow | null = null;

app.on("ready", () => {
    // Build the menu bar
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Select Image',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('menu-select-image');
                        }
                    }
                },
                {
                    label: 'Generate STL',
                    accelerator: 'CmdOrCtrl+G',
                    click: () => {
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

    // Restore window size/position
    const savedBounds = preferencesManager.getPreference('windowBounds');
    const windowBounds = savedBounds || { width: 1200, height: 800 };

    mainWindow = new BrowserWindow({
        width: windowBounds.width,
        height: windowBounds.height,
        x: windowBounds.x,
        y: windowBounds.y,
        title: 'Half-Light',
        icon: getIconPath(),
        webPreferences: {
            preload: getPreloadPath(),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: true,
        },
    });

    // Remember window position/size (debounced)
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
        }, 500); // Don't save too often
    };

    mainWindow.on('resized', saveWindowBounds);
    mainWindow.on('moved', saveWindowBounds);

    // Save one last time on close
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
        mainWindow.webContents.openDevTools();
    }else{
        mainWindow.loadFile(getUIPath());
    }

    // IPC handlers
    ipcMain.handle('processImage', async (_, imagePath: string, settings: any) => {
        const processor = LithophaneProcessor.getInstance();
        return await processor.processImage(imagePath, settings);
    });

    ipcMain.handle('generateSTL', async (_, imagePath: string, settings: any) => {
        logger.debug('Main process received settings:', settings);
        logger.debug('Main process resolutionMultiplier:', settings.resolutionMultiplier);
        
        // Check if the image file exists
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
        
        // Send progress updates to the UI
        const progressCallback = (progress: number, message: string) => {
            if (mainWindow) {
                mainWindow.webContents.send('stl-generation-progress', { progress, message });
            }
        };
        
        return await processor.generateSTL(imagePath, settings, progressCallback);
    });

    // File picker
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

    // Convert image to base64 for preview
    ipcMain.handle('getImagePreview', async (_, imagePath: string) => {
        try {
            // Make sure file exists
            if (!existsSync(imagePath)) {
                logger.error('Image file does not exist:', imagePath);
                return null;
            }
            
            // Check file extension
            const ext = PathValidator.getFileExtension(imagePath).toLowerCase();
            const allowedExts = ['.jpg', '.jpeg', '.png', '.bmp', '.gif'];
            if (!ext || !allowedExts.includes(ext)) {
                logger.error('Invalid image extension:', ext);
                return null;
            }
            
            const imageBuffer = readFileSync(imagePath);
            const base64 = imageBuffer.toString('base64');
            const mimeType = getMimeType(imagePath);
            return `data:${mimeType};base64,${base64}`;
        } catch (error) {
            logger.error('Error reading image for preview:', error);
            return null;
        }
    });

    // Save dropped file to temp directory
    ipcMain.handle('handleDroppedFile', async (_, fileDataBase64: string, fileName: string) => {
        try {
            // Clean up the filename
            const sanitizedFilename = PathValidator.sanitizeFilename(fileName);
            if (!sanitizedFilename) {
                throw new Error('Invalid filename');
            }
            
            // Check extension
            const extValidation = PathValidator.validatePath(sanitizedFilename, ['.jpg', '.jpeg', '.png', '.bmp', '.gif']);
            if (!extValidation.isValid) {
                throw new Error(extValidation.error || 'Invalid file type');
            }
            
            const tempDir = tmpdir();
            const tempFilename = `dropped_${Date.now()}_${sanitizedFilename}`;
            const tempPath = join(tempDir, tempFilename);
            
            // Make sure path is safe
            const pathValidation = PathValidator.validatePathInDirectory(tempPath, tempDir);
            if (!pathValidation.isValid) {
                throw new Error(pathValidation.error || 'Invalid path');
            }
            
            // Write the file
            const buffer = Buffer.from(fileDataBase64, 'base64');
            await writeFile(tempPath, buffer);
            
            return tempPath;
        } catch (error) {
            logger.error('Error handling dropped file:', error);
            throw new Error(`Failed to save dropped file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    // Open settings window
    ipcMain.handle('openSettings', async () => {
        openSettingsWindow();
    });

    // Theme stuff
    ipcMain.handle('getTheme', async () => {
        return preferencesManager.getPreference('theme');
    });

    ipcMain.handle('setTheme', async (_, theme: 'light' | 'dark' | 'high-contrast') => {
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

    // Open STL file in slicer (can pass file path or content)
    ipcMain.handle('openInSlicer', async (_, filePathOrContent: string, isContent: boolean = false, filename?: string) => {
        const slicerPath = preferencesManager.getPreference('slicerPath');
        
        if (!slicerPath) {
            throw new Error('No slicer application selected. Please select a slicer in Settings.');
        }

        // Make sure slicer exists
        const slicerPathValidation = PathValidator.validatePathExists(slicerPath);
        if (!slicerPathValidation.isValid) {
            throw new Error(`Slicer application not found at: ${slicerPath}. Please update the slicer path in Settings.`);
        }

        let filePath: string;

        if (isContent) {
            // Save content to temp file first
            const tempDir = tmpdir();
            const sanitizedFilename = filename ? PathValidator.sanitizeFilename(filename) : `lithophane_${Date.now()}.stl`;
            const finalFilename = sanitizedFilename.endsWith('.stl') ? sanitizedFilename : `${sanitizedFilename}.stl`;
            filePath = join(tempDir, finalFilename);
            
            // Check path is safe
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
            
            // Check file exists
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
                // macOS: use 'open' command
                spawn('open', ['-a', slicerPath, filePath], { detached: true });
            } else if (process.platform === 'win32') {
                // Windows: PowerShell handles spaces better than cmd
                const psCommand = `Start-Process -FilePath "${slicerPath.replace(/"/g, '`"')}" -ArgumentList "${filePath.replace(/"/g, '`"')}"`;
                exec(`powershell -Command "${psCommand}"`, (error: any) => {
                    if (error) {
                        logger.error('Error opening slicer:', error);
                        // Fallback to cmd.exe if PowerShell fails
                        const escapedSlicerPath = slicerPath.replace(/"/g, '""');
                        const escapedFilePath = filePath.replace(/"/g, '""');
                        const cmdCommand = `start "" "${escapedSlicerPath}" "${escapedFilePath}"`;
                        exec(cmdCommand, { shell: 'cmd.exe' }, (fallbackError: any) => {
                            if (fallbackError) {
                                logger.error('Fallback method also failed:', fallbackError);
                            }
                        });
                    }
                });
            } else {
                // Linux: just run it
                spawn(slicerPath, [filePath], { detached: true });
            }
            return { success: true, filePath };
        } catch (error: any) {
            throw new Error(`Failed to open slicer: ${error.message}`);
        }
    });

    // Apply theme when window loads
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

    // Load settings window from separate HTML file
    settingsWindow.loadFile(getSettingsWindowPath());
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