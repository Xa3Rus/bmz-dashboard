/**
 * ============================================================================
 * МОДУЛЬ 1 (Подключается в main.js): modules/storageModule.js
 * Назначение: Постоянное файловое хранилище 24/7 (data/bmz-scada-state.json)
 * ============================================================================
 * Отвечает за чтение и запись состояния АСУ ТП ДСП на диск:
 * - список зарегистрированных пользователей (сталевары и мастера смен);
 * - матрица назначения ответственных за печи ДСП-1..3 по сменам 1, 2, 3;
 * - многодневный архив учёта аварий по дням.
 */

const fs = require('fs');
const path = require('path');

class StorageModule {
  constructor(baseDir) {
    this.dataDir = path.join(baseDir, 'data');
    this.stateFile = path.join(this.dataDir, 'bmz-scada-state.json');
  }

  /**
   * Загрузка сохранённого состояния с диска при старте программы
   */
  async loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = await fs.promises.readFile(this.stateFile, 'utf8');
        return { success: true, data: JSON.parse(raw) };
      }
      return { success: true, data: null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Сохранение состояния на диск при любых изменениях штата, смен или аварий
   */
  async saveState(statePayload) {
    try {
      await fs.promises.mkdir(this.dataDir, { recursive: true });
      await fs.promises.writeFile(
        this.stateFile,
        JSON.stringify(statePayload, null, 2),
        'utf8'
      );
      return { success: true, filePath: this.stateFile };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Регистрация IPC-обработчиков модуля в главном процессе Electron (main.js)
   */
  registerIpcHandlers(ipcMain) {
    ipcMain.handle('load-state', async () => this.loadState());
    ipcMain.handle('save-state', async (_event, payload) => this.saveState(payload));
  }
}

module.exports = { StorageModule };
