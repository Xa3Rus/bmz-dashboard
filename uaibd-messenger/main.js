const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

/**
 * Creates the primary application window with Discord dark industrial styling.
 * Dimensions: 1280x800, minWidth: 960, minHeight: 640.
 * Background: #202225.
 * @returns {BrowserWindow}
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        backgroundColor: '#202225',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    const indexPath = path.join(__dirname, 'renderer', 'index.html');
    mainWindow.loadFile(indexPath);

    mainWindow.once('ready-to-show', () => {
        if (mainWindow) mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow;
}

/**
 * Registers all IPC handlers for the renderer process.
 */
function registerIpcHandlers() {
    // Config retrieval
    ipcMain.handle('config:get', async () => {
        try {
            const configPath = path.join(__dirname, 'config.json');
            if (fs.existsSync(configPath)) {
                const data = fs.readFileSync(configPath, 'utf8');
                return JSON.parse(data);
            }
            return {};
        } catch (err) {
            console.error('Failed to load config.json:', err);
            return {};
        }
    });

    // Native notifications
    ipcMain.handle('notify:show', async (_event, payload) => {
        try {
            const title = typeof payload === 'object' && payload !== null ? payload.title : 'BMZ УАиБД Messenger';
            const body = typeof payload === 'object' && payload !== null ? payload.body : String(payload || '');
            if (Notification && typeof Notification.isSupported === 'function' && Notification.isSupported()) {
                const notification = new Notification({
                    title: title || 'BMZ УАиБД Messenger',
                    body: body || ''
                });
                notification.show();
                return { success: true };
            }
            return { success: false, reason: 'unsupported' };
        } catch (err) {
            console.error('Notification error:', err);
            return { success: false, error: err.message };
        }
    });

    // Open external URLs safely
    ipcMain.handle('shell:openExternal', async (_event, url) => {
        if (!url || typeof url !== 'string') return false;
        try {
            const parsed = new URL(url);
            if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
                await shell.openExternal(url);
                return true;
            }
        } catch (err) {
            console.error('Failed to open external url:', err);
        }
        return false;
    });

    // Window controls
    ipcMain.handle('window:minimize', (event) => {
        const win = (event && event.sender && BrowserWindow.fromWebContents(event.sender)) || mainWindow;
        if (win && !win.isDestroyed()) {
            win.minimize();
            return true;
        }
        return false;
    });

    ipcMain.handle('window:maximize', (event) => {
        const win = (event && event.sender && BrowserWindow.fromWebContents(event.sender)) || mainWindow;
        if (win && !win.isDestroyed()) {
            if (win.isMaximized()) {
                win.unmaximize();
            } else {
                win.maximize();
            }
            return true;
        }
        return false;
    });

    ipcMain.handle('window:close', (event) => {
        const win = (event && event.sender && BrowserWindow.fromWebContents(event.sender)) || mainWindow;
        if (win && !win.isDestroyed()) {
            win.close();
            return true;
        }
        return false;
    });

    // Local file reader for attachments
    ipcMain.handle('file:read', async (_event, filePath, encoding = 'utf8') => {
        try {
            const resolvedPath = path.resolve(filePath);
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            const buffer = fs.readFileSync(resolvedPath);
            if (encoding === 'base64') {
                return buffer.toString('base64');
            }
            return buffer.toString('utf8');
        } catch (err) {
            console.error('Failed to read file:', err);
            throw err;
        }
    });
}

// App lifecycle
if (app && typeof app.whenReady === 'function') {
    app.whenReady().then(() => {
        registerIpcHandlers();
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}

module.exports = {
    createWindow,
    registerIpcHandlers
};
