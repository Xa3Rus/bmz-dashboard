/**
 * ============================================================================
 * [P] MVP PRESENTER MODULE 1: src/mvp/presenters/telemetryPresenter.js
 * Назначение: Презентер мониторинга датчиков, графика Chart.js и 3D-печи Three.js
 * ============================================================================
 * Роль в паттерне MVP:
 * Связывает `TelemetryModel`, `TelemetryView` и `Furnace3DView`.
 * Форматирует показания 5 датчиков, управляет 3D-ракурсами камеры, режимами
 * рендера и экспортом CSV-отчётов на Рабочий стол.
 */

export class TelemetryPresenter {
  constructor(rootModel, rootView) {
    this.model = rootModel;
    this.view = rootView;
  }

  init(onSyncAllCallback) {
    this.onSyncAll = onSyncAllCallback;

    this.view.bindFurnaceSelect(furnaceId => this.handleFurnaceSelect(furnaceId));
    this.view.bindSensorCardClick(sensorKey => this.handleSensorCardClick(sensorKey));
    this.view.bindCameraPresets(preset => this.view.setCameraPreset(preset));
    this.view.bindRenderModes(mode => this.view.set3DRenderMode(mode));
  }

  handleSensorCardClick(sensorKey) {
    const info = this.model.getSensorInfo(sensorKey);
    const furnace = this.model.getActiveFurnace();
    if (!info || !furnace) return;

    const status = furnace.sensorStatuses[sensorKey] || 'normal';
    const statusLabel = status === 'danger' ? 'АВАРИЯ' : (status === 'warning' ? 'ВНИМАНИЕ' : 'НОРМА');

    const valueMap = {
      temperature: `${furnace.temperature} °C`,
      current: `${furnace.current.toFixed(1)} кА`,
      pressure: `${furnace.pressure} Па`,
      energy: `${furnace.energy.toFixed(2)} МВт·ч`,
      oxygen: `${furnace.oxygen} м³/ч`
    };

    this.view.openSensorDetailModal({
      ...info,
      formattedValue: valueMap[sensorKey] || '—',
      status,
      statusLabel,
      furnaceInfo: `${furnace.fullName} · ${furnace.stage}`
    });
  }

  handleFurnaceSelect(furnaceId) {
    const currentUser = this.model.getCurrentUser();
    if (currentUser && !currentUser.isMaster) {
      const assigned = this.model.getAssignedFurnaceForUser(currentUser.badgeNo)
        || this.model.getUserAssignmentsAcrossShifts(currentUser.badgeNo)[0]?.furnaceId;
      if (assigned && Number(assigned) !== Number(furnaceId)) {
        return;
      }
    }

    const access = this.model.checkAccessToFurnace(furnaceId);
    this.model.setActiveFurnace(furnaceId);
    if (this.onSyncAll) this.onSyncAll();

    const resp = this.model.getResponsibleForFurnace(furnaceId);
    const shift = this.model.getActiveShift();

    if (!access.allowed) {
      this.view.showToast(
        `Пост ДСП-${furnaceId} · ${shift.name}`,
        `Ответственный за ДСП-${furnaceId} на этой смене: ${resp ? resp.fullName : '—'} (Таб. №${resp ? resp.badgeNo : '—'}).`,
        'warning'
      );
    }
  }

  async handleExportCsv() {
    const furnace = this.model.getActiveFurnace();
    const csvContent = this.model.generateCsvReport();
    const dateStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const fileName = `BMZ_DSP${furnace.id}_24x7_Report_${dateStamp}.csv`;

    try {
      if (window.electronAPI && typeof window.electronAPI.exportCSV === 'function') {
        const result = await window.electronAPI.exportCSV(csvContent, fileName);
        if (result.success) {
          this.model.addLog(
            'INFO',
            `Полный CSV-отчёт сохранён на Рабочий стол: ${result.filePath}`,
            furnace.name
          );
          if (this.onSyncAll) this.onSyncAll();
          this.view.showToast(
            'Экспорт отчёта выполнен (CSV)',
            `Файл сохранён на Рабочий стол: ${result.filePath}`,
            'success'
          );
          return;
        }
        throw new Error(result.error || 'Неизвестная ошибка записи файла');
      }

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);

      this.model.addLog('INFO', `CSV-отчёт выгружен: ${fileName}`, furnace.name);
      if (this.onSyncAll) this.onSyncAll();
      this.view.showToast('Экспорт отчёта выполнен', `Файл ${fileName} сохранён.`, 'success');
    } catch (err) {
      this.model.addLog('ALARM', `Ошибка экспорта CSV: ${err.message}`, furnace.name);
      if (this.onSyncAll) this.onSyncAll();
      this.view.showToast('Ошибка экспорта CSV', err.message, 'danger');
    }
  }
}
