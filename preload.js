/**
 * ============================================================================
 * ELECTRON PRELOAD SCRIPT: preload.js — Безопасный мост IPC (Context Bridge)
 * ============================================================================
 * Связывает клиентскую архитектуру MVP (`src/`) с обособленными модулями,
 * подключенными в `main.js`:
 * - `storageModule`      -> `loadState()`, `saveState(payload)`
 * - `authShiftModule`    -> `getAuthDefaults()`
 * - `incidentsModule`    -> `getSopInstruction(code)`
 * - `plcTelemetryModule` -> `getPlcConfig()`
 * - `csvReportModule`    -> `exportCSV(csvContent, fileName)`
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 1. Модуль хранилища 24/7 (modules/storageModule.js)
  loadState: () => ipcRenderer.invoke('load-state'),
  saveState: (statePayload) => ipcRenderer.invoke('save-state', statePayload),

  // 2. Модуль авторизации, смен и ответственных (modules/authShiftModule.js)
  getAuthDefaults: () => ipcRenderer.invoke('auth:defaults'),

  // 3. Модуль учёта аварий и инструкций СОП (modules/incidentsModule.js)
  getSopInstruction: (code) => ipcRenderer.invoke('incidents:get-sop', code),

  // 4. Модуль ПЛК и уставок печей (modules/plcTelemetryModule.js)
  getPlcConfig: () => ipcRenderer.invoke('plc:config'),

  // 5. Модуль экспорта CSV-отчётов на Рабочий стол (modules/csvReportModule.js)
  exportCSV: (csvContent, fileName) => ipcRenderer.invoke('export-csv', { csvContent, fileName })
});
