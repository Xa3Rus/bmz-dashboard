/**
 * ============================================================================
 * [P] COMPOSITE PRESENTER: src/presenter.js — КОРНЕВОЙ ПРЕЗЕНТЕР MVP
 * ============================================================================
 * Объединяет 3 обособленных модуля слоя Presenter из папки `src/mvp/presenters/`:
 * 1. `TelemetryPresenter` (`src/mvp/presenters/telemetryPresenter.js`) — управление
 *    постом наблюдения печей ДСП-1..3, 3D-камерой и выгрузкой CSV-отчётов;
 * 2. `AuthShiftPresenter` (`src/mvp/presenters/authShiftPresenter.js`) — обязательная
 *    авторизация при запуске, кнопка «Конец смены» (с автовыходом без остановки ПЛК),
 *    добавление пользователей и матрица ответственных за печи;
 * 3. `IncidentsPresenter` (`src/mvp/presenters/incidentsPresenter.js`) — вывод плашки
 *    «АВАРИЯ» с инструкцией по устранению (СОП), аварийное охлаждение и учёт аварий по дням.
 */

import { TelemetryPresenter } from './mvp/presenters/telemetryPresenter.js';
import { AuthShiftPresenter } from './mvp/presenters/authShiftPresenter.js';
import { IncidentsPresenter } from './mvp/presenters/incidentsPresenter.js';

export class FurnacePresenter {
  /**
   * @param {import('./model.js').FurnaceModel} model
   * @param {import('./view.js').FurnaceView} view
   */
  constructor(model, view) {
    this.model = model;
    this.view = view;
    this.telemetryTimer = null;

    // Подключаем обособленные модули слоя Presenter
    this.telemetryPresenter = new TelemetryPresenter(model, view);
    this.authShiftPresenter = new AuthShiftPresenter(model, view);
    this.incidentsPresenter = new IncidentsPresenter(model, view);
  }

  async init() {
    // 1. Загружаем сохранённую базу 24/7 (штат, матрица смен, архив аварий по дням)
    await this.loadPersistentData();

    const sharedCallbacks = {
      onSyncAll: () => this.syncViewWithModel(),
      onSaveState: () => this.savePersistentData()
    };

    // 2. Инициализируем все 3 функциональных презентера
    this.telemetryPresenter.init(sharedCallbacks.onSyncAll);
    this.authShiftPresenter.init(sharedCallbacks);
    this.incidentsPresenter.init(sharedCallbacks);

    // 3. Первичная отрисовка всех зон дашборда
    this.updateClock();
    this.syncViewWithModel();

    // 4. Открываем обязательное окно ввода номера пользователя и пароля при запуске
    this.authShiftPresenter.openMandatoryStartupAuth();

    // 5. Запуск непрерывного секундного цикла опроса печей (работает 24/7 даже после «Конец смены»)
    this.telemetryTimer = setInterval(() => {
      const tickEvents = this.model.updateTelemetryTick();
      this.updateClock();
      this.syncViewWithModel();

      if (tickEvents && tickEvents.autoShiftEnded) {
        this.authShiftPresenter.onShiftEndedPrompt(tickEvents.autoShiftEnded, true);
      }

      if (tickEvents && tickEvents.newAlarmTriggered) {
        this.incidentsPresenter.showAlarmInstructionForFurnace(tickEvents.newAlarmTriggered.furnace);
      }
    }, 1000);
  }

  async loadPersistentData() {
    try {
      if (window.electronAPI && typeof window.electronAPI.loadState === 'function') {
        const res = await window.electronAPI.loadState();
        if (res && res.success && res.data) {
          this.model.importPersistentState(res.data);
          return;
        }
      }
      const localRaw = localStorage.getItem('bmz_scada_24_7_state');
      if (localRaw) {
        this.model.importPersistentState(JSON.parse(localRaw));
      }
    } catch (err) {
      console.warn('Не удалось загрузить сохранённое состояние:', err);
    }
  }

  async savePersistentData() {
    try {
      const payload = this.model.exportPersistentState();
      localStorage.setItem('bmz_scada_24_7_state', JSON.stringify(payload));
      if (window.electronAPI && typeof window.electronAPI.saveState === 'function') {
        await window.electronAPI.saveState(payload);
      }
    } catch (err) {
      console.warn('Ошибка сохранения состояния 24/7:', err);
    }
  }

  updateClock() {
    const now = new Date();
    const datePart = now.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timePart = now.toTimeString().split(' ')[0];
    this.view.updateClock(`${datePart} · ${timePart}`);
  }

  syncViewWithModel() {
    const furnace = this.model.getActiveFurnace();
    const allSummary = this.model.getAllFurnacesSummary();
    const activeShift = this.model.getActiveShift();
    const currentUser = this.model.getCurrentUser();
    const isAuthenticated = this.model.isAuthenticated();
    const responsible = this.model.getResponsibleForFurnace(furnace.id, activeShift.id);
    const dailyStats = this.model.getDailyIncidentsStats(7);
    const thresholds = this.model.thresholds;
    const isOverheated = furnace.temperature > thresholds.temperature.critical;

    const statusMap = {
      normal:  'РЕЖИМ: ШТАТНЫЙ (НОРМА)',
      warning: furnace.isCooling ? 'АВАРИЙНОЕ ОХЛАЖДЕНИЕ' : 'ВНИМАНИЕ: ПРЕДПОРОГ',
      danger:  'ТРЕВОГА: ПЕРЕГРЕВ (> 1650 °C)'
    };

    const userAssignedFurnace = currentUser
      ? this.model.getAssignedFurnaceForUser(currentUser.badgeNo, activeShift.id)
      : null;

    const postLabel = currentUser?.isMaster
      ? 'Все печи (Мастер смены)'
      : (userAssignedFurnace ? `Пост: ДСП-${userAssignedFurnace}` : 'Дежурный оператор');

    this.view.renderHeader({
      activeId: furnace.id,
      activeShiftId: activeShift.id,
      activeShiftLabel: `${activeShift.name.toUpperCase()} · ${activeShift.hours}`,
      furnacesSummary: allSummary,
      meltNumber: furnace.meltNumber,
      steelGrade: furnace.steelGrade,
      stage: furnace.stage,
      controller: `${furnace.controller} (${furnace.protocol})`,
      responsibleName: responsible ? responsible.fullName : 'Не назначен',
      responsibleSub: responsible
        ? `Таб. №${responsible.badgeNo} · ${responsible.role} · Закреплён за ${furnace.name} на Смене ${activeShift.id}`
        : 'Ответственный не выбран',
      operatorName: currentUser ? currentUser.fullName : 'Пост ожидает приёма смены',
      operatorInitials: currentUser ? this._getInitials(currentUser.fullName) : '--',
      operatorRoleLine: currentUser
        ? `Таб. №${currentUser.badgeNo} · Смена ${activeShift.id} · ${postLabel}`
        : 'Требуется ввод табельного № и пароля',
      isAuthenticated,
      todayAlarmsCount: dailyStats.todayTotal,
      systemStatus: furnace.status,
      systemStatusLabel: statusMap[furnace.status] || statusMap.normal
    });

    const cardsViewModel = {
      temperature: {
        formattedValue: `${furnace.temperature} °C`,
        status: furnace.sensorStatuses.temperature,
        statusLabel: this._formatStatusBadge(furnace.sensorStatuses.temperature),
        percent: this._calcPercent(furnace.temperature, 1500, 1720),
        subtitle: `Диапазон: 1500–1720 °C · Темп: ${furnace.heatRate}`
      },
      current: {
        formattedValue: `${furnace.current.toFixed(1)} кА`,
        status: furnace.sensorStatuses.current,
        statusLabel: this._formatStatusBadge(furnace.sensorStatuses.current),
        percent: this._calcPercent(furnace.current, 30, 75),
        subtitle: `Мощность дуги: ${furnace.powerMw.toFixed(1)} МВт · Уставка ≤ 58 кА`
      },
      pressure: {
        formattedValue: `${furnace.pressure} Па`,
        status: furnace.sensorStatuses.pressure,
        statusLabel: this._formatStatusBadge(furnace.sensorStatuses.pressure),
        percent: this._calcPercent(furnace.pressure, 20, 85),
        subtitle: `Газоход 4-го отверстия свода · Норма: 35–56 Па`
      },
      energy: {
        formattedValue: `${furnace.energy.toFixed(2)} МВт·ч`,
        status: furnace.sensorStatuses.energy,
        statusLabel: this._formatStatusBadge(furnace.sensorStatuses.energy),
        percent: this._calcPercent(furnace.energy, 25, 85),
        subtitle: `Удельный расход: ${Math.round((furnace.energy * 1000) / 135)} кВт·ч/т (садка 135 т)`
      },
      oxygen: {
        formattedValue: `${furnace.oxygen} м³/ч`,
        status: furnace.sensorStatuses.oxygen,
        statusLabel: this._formatStatusBadge(furnace.sensorStatuses.oxygen),
        percent: this._calcPercent(furnace.oxygen, 800, 5000),
        subtitle: `Сводовая фурма O₂ · Стадия: ${furnace.stage}`
      }
    };

    this.view.renderSensorCards({
      cards: cardsViewModel,
      heatBalance: furnace.heatBalance,
      waterFlow: furnace.waterFlow,
      isEmergency: furnace.isEmergency,
      isCooling: furnace.isCooling,
      showCoolingBtn: furnace.isEmergency || furnace.isCooling || isOverheated
    });

    this.view.renderChart({
      labels: furnace.history.map(p => p.time),
      temperatures: furnace.history.map(p => p.temperature),
      criticalLine: furnace.history.map(() => thresholds.temperature.critical),
      isOverheated,
      furnaceName: furnace.fullName,
      currentTemp: furnace.temperature
    });

    const shortResp = responsible ? this.model._formatShortName(responsible.fullName) : '—';
    this.view.update3DFurnace({
      furnaceName: furnace.fullName,
      steelGrade: furnace.steelGrade,
      responsibleHud: `${shortResp} (Таб. №${responsible?.badgeNo || '—'} · Смена ${activeShift.id})`,
      temperature: furnace.temperature,
      current: furnace.current,
      pressure: furnace.pressure,
      oxygen: furnace.oxygen,
      powerMw: furnace.powerMw,
      waterFlow: furnace.waterFlow,
      isOverheated
    });

    this.view.renderDailyAlarmsWidget(dailyStats, selectedDateKey => {
      this.incidentsPresenter.openDayInRegistry(selectedDateKey);
    });

    this.view.renderLogs(this.model.getLogs());
  }

  _formatStatusBadge(status) {
    if (status === 'danger') return 'АВАРИЯ';
    if (status === 'warning') return 'ВНИМАНИЕ';
    return 'НОРМА';
  }

  _calcPercent(value, min, max) {
    const pct = ((value - min) / (max - min)) * 100;
    return Math.max(4, Math.min(100, Math.round(pct)));
  }

  _getInitials(fullName) {
    if (!fullName) return '--';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return fullName.slice(0, 2).toUpperCase();
  }
}
