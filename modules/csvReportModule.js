/**
 * ============================================================================
 * МОДУЛЬ 5 (Подключается в main.js): modules/csvReportModule.js
 * Назначение: Экспорт сводных CSV-отчётов АСУ ТП ДСП на Рабочий стол оператора
 * ============================================================================
 * Записывает сформированный CSV-отчёт (показания датчиков, матрицу ответственных
 * по сменам, реестр аварий по дням и журнал событий) на Рабочий стол ОС с UTF-8 BOM.
 */

const fs = require('fs');
const path = require('path');

class CsvReportModule {
  constructor(app) {
    this.app = app;
  }

  async exportCsvToDesktop({ csvContent, fileName }) {
    try {
      const desktopDir = this.app.getPath('desktop');
      const safeName = fileName || `BMZ_DSP_Report_${Date.now()}.csv`;
      const fullPath = path.join(desktopDir, safeName);

      // UTF-8 BOM (\uFEFF) для корректного отображения кириллицы в Microsoft Excel
      const bomCsv = '\uFEFF' + csvContent;
      await fs.promises.writeFile(fullPath, bomCsv, 'utf8');

      return {
        success: true,
        filePath: fullPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  registerIpcHandlers(ipcMain) {
    ipcMain.handle('export-csv', async (_event, payload) => this.exportCsvToDesktop(payload));
  }
}

module.exports = { CsvReportModule };
