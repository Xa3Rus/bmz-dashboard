const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#161719',
    autoHideMenuBar: true,
    title: 'Цифровая плавка — УЧЕБНЫЙ ТРЕНАЖЁР ДСП-135 | ОАО «БМЗ»',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  await db.init(path.join(__dirname, 'db', 'bmz-training.sqlite'));
  ipcMain.handle('api', (_e, method, args) => db.api(method, args));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
