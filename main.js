/**
 * ============================================================================
 * ELECTRON MAIN PROCESS: main.js — Главный процесс и точка сборки модулей Node.js
 * ============================================================================
 * Архитектура главного процесса:
 * Весь системный функционал разбит на 5 обособленных модулей в папке `modules/`,
 * которые подключаются и регистрируют свои IPC-каналы в `main.js`:
 *
 * 1. `modules/storageModule.js`      — Постоянное хранение данных 24/7 (JSON-БД на диске).
 * 2. `modules/authShiftModule.js`    — Модуль сменной авторизации, штата пользователей
 *                                      и матрицы назначения ответственных за печи ДСП-1..3.
 * 3. `modules/incidentsModule.js`    — Модуль суточного учёта аварий по дням (24/7)
 *                                      и каталога инструкций по устранению ЧС (СОП БМЗ).
 * 4. `modules/plcTelemetryModule.js` — Модуль конфигурации ПЛК и теплофизических уставок печей.
 * 5. `modules/csvReportModule.js`    — Модуль экспорта сводных CSV-отчётов на Рабочий стол.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Подключение обособленных функциональных модулей системы
const { StorageModule } = require('./modules/storageModule');
const { AuthShiftModule } = require('./modules/authShiftModule');
const { IncidentsModule } = require('./modules/incidentsModule');
const { PlcTelemetryModule } = require('./modules/plcTelemetryModule');
const { CsvReportModule } = require('./modules/csvReportModule');

// Инициализация экземпляров модулей
const storageModule = new StorageModule(__dirname);
const authShiftModule = new AuthShiftModule();
const incidentsModule = new IncidentsModule();
const plcTelemetryModule = new PlcTelemetryModule();
const csvReportModule = new CsvReportModule(app);

function registerAllModulesIpc() {
  storageModule.registerIpcHandlers(ipcMain);
  authShiftModule.registerIpcHandlers(ipcMain);
  incidentsModule.registerIpcHandlers(ipcMain);
  plcTelemetryModule.registerIpcHandlers(ipcMain);
  csvReportModule.registerIpcHandlers(ipcMain);
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1580,
    height: 950,
    minWidth: 1280,
    minHeight: 780,
    backgroundColor: '#060709',
    autoHideMenuBar: true,
    title: 'АСУ ТП ДСП | ОАО «БМЗ» — Круглосуточный мониторинг печей ЭСПЦ-2 (24/7)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  // Регистрируем IPC-обработчики всех подключенных модулей
  registerAllModulesIpc();

  // Открываем главное окно SCADA-дашборда
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
