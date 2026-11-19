/**
 * ============================================================================
 * [V] COMPOSITE VIEW: src/view.js — КОРНЕВОЕ ПАССИВНОЕ ПРЕДСТАВЛЕНИЕ MVP
 * ============================================================================
 * Объединяет 4 обособленных модуля слоя View из папки `src/mvp/views/`:
 * 1. `TelemetryView` (`src/mvp/views/telemetryView.js`) — шапка, 5 карточек датчиков,
 *    живой график `Chart.js` и журнал событий;
 * 2. `Furnace3DView` (`src/mvp/views/furnace3DView.js`) — интерактивная 3D-печь ДСП-135
 *    (`Three.js` + `GLTFLoader` для `models/dsp135.glb` + `OrbitControls` + подсветка перегрева);
 * 3. `AuthShiftView` (`src/mvp/views/authShiftView.js`) — обязательное окно входа по номеру
 *    и паролю, матрица назначения ответственных за печи 3x3 и добавление пользователей;
 * 4. `IncidentsView` (`src/mvp/views/incidentsView.js`) — тревожная плашка «АВАРИЯ»
 *    с пошаговой инструкцией по устранению (СОП) и учёт аварий по дням (24/7).
 *
 * ВАЖНОЕ ПРАВИЛО MVP:
 * Ни `FurnaceView`, ни его подмодули не содержат бизнес-логики и не знают о `Model`.
 */

import { TelemetryView } from './mvp/views/telemetryView.js';
import { Furnace3DView } from './mvp/views/furnace3DView.js';
import { AuthShiftView } from './mvp/views/authShiftView.js';
import { IncidentsView } from './mvp/views/incidentsView.js';

export class FurnaceView {
  constructor() {
    // Подключаем обособленные модули слоя View
    this.telemetryView = new TelemetryView();
    this.furnace3DView = new Furnace3DView();
    this.authShiftView = new AuthShiftView();
    this.incidentsView = new IncidentsView();
  }

  // 1. Привязка событий (делегируется специализированным модулям View)
  bindFurnaceSelect(handler) {
    this.telemetryView.bindFurnaceSelect(handler);
  }

  bindSensorCardClick(handler) {
    this.telemetryView.bindSensorCardClick(handler);
  }

  bindEndShift(handler) {
    this.telemetryView.bindEndShift(handler);
  }

  bindEmergencySimulate(handler) {
    this.telemetryView.bindEmergencySimulate(handler);
  }

  bindEmergencyCooling(handler) {
    this.telemetryView.bindEmergencyCooling(handler);
    this.incidentsView.bindExecuteSopCooling(handler);
  }

  bindCameraPresets(handler) {
    this.furnace3DView.bindCameraPresets(handler);
  }

  bindRenderModes(handler) {
    this.furnace3DView.bindRenderModes(handler);
  }

  bindStaffModalEvents(callbacks) {
    this.authShiftView.bindStaffModalEvents(callbacks);
  }

  bindIncidentsModalEvents(callbacks) {
    this.incidentsView.bindIncidentsModalEvents(callbacks);
  }

  // 2. Команды отрисовки от Presenter
  updateClock(timeString) {
    this.telemetryView.updateClock(timeString);
  }

  renderHeader(headerViewModel) {
    this.telemetryView.renderHeader(headerViewModel);
  }

  renderSensorCards(sensorsViewModel) {
    this.telemetryView.renderSensorCards(sensorsViewModel);
  }

  openSensorDetailModal(detailViewModel) {
    this.telemetryView.openSensorDetailModal(detailViewModel);
  }

  renderChart(chartViewModel) {
    this.telemetryView.renderChart(chartViewModel);
  }

  renderLogs(logs) {
    this.telemetryView.renderLogs(logs);
  }

  showToast(title, message, type) {
    this.telemetryView.showToast(title, message, type);
  }

  update3DFurnace(viewModel3D) {
    this.furnace3DView.update3DFurnace(viewModel3D);
    this.incidentsView.updateSopLiveTemperature(
      viewModel3D.alertBannerValue || `${viewModel3D.temperature} °C`,
      Boolean(viewModel3D.isOverheated || viewModel3D.isEmergency)
    );
  }

  setCameraPreset(presetName) {
    this.furnace3DView.setCameraPreset(presetName);
  }

  set3DRenderMode(mode) {
    this.furnace3DView.set3DRenderMode(mode);
  }

  openStaffModal(defaultTab, options) {
    this.authShiftView.openStaffModal(defaultTab, options);
  }

  closeStaffModal() {
    this.authShiftView.closeStaffModal();
  }

  setLoginError(msg) {
    this.authShiftView.setLoginError(msg);
  }

  setAddUserError(msg) {
    this.authShiftView.setAddUserError(msg);
  }

  clearAddUserForm() {
    this.authShiftView.clearAddUserForm();
  }

  renderStaffModal(data) {
    this.authShiftView.renderStaffModal(data);
  }

  showAlarmInstructionOverlay(payload) {
    this.incidentsView.showAlarmInstructionOverlay(payload);
  }

  hideAlarmInstructionOverlay() {
    this.incidentsView.hideAlarmInstructionOverlay();
  }

  openEmergencyPicker(scenarios, onSelectCode) {
    this.incidentsView.openEmergencyPicker(scenarios, onSelectCode);
  }

  openIncidentsModal() {
    this.incidentsView.openIncidentsModal();
  }

  closeIncidentsModal() {
    this.incidentsView.closeIncidentsModal();
  }

  renderDailyAlarmsWidget(dailyStats, onSelectDateKey) {
    this.incidentsView.renderDailyAlarmsWidget(dailyStats, onSelectDateKey);
  }

  renderIncidentsModal(dailyStats, filteredIncidents, selectedFilters) {
    this.incidentsView.renderIncidentsModal(dailyStats, filteredIncidents, selectedFilters);
  }
}
