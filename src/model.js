/**
 * ============================================================================
 * [M] COMPOSITE MODEL: src/model.js — КОРНЕВАЯ МОДЕЛЬ АРХИТЕКТУРЫ MVP
 * ============================================================================
 * Объединяет 3 обособленных модуля слоя Model из папки `src/mvp/models/`:
 * 1. `TelemetryModel` (`src/mvp/models/telemetryModel.js`) — данные и теплофизика печей ДСП-1..3;
 * 2. `AuthShiftModel` (`src/mvp/models/authShiftModel.js`) — сменная авторизация, кнопка «Конец смены»,
 *    добавление пользователей и матрица ответственных за печи;
 * 3. `IncidentsModel` (`src/mvp/models/incidentsModel.js`) — суточный учёт аварий по дням (24/7),
 *    каталог инструкций СОП по устранению аварий и журнал событий.
 *
 * ВАЖНОЕ ПРАВИЛО MVP:
 * Ни `FurnaceModel`, ни его подмодули ничего не знают о DOM, HTML, Chart.js или Three.js.
 */

import { TelemetryModel } from './mvp/models/telemetryModel.js';
import { AuthShiftModel } from './mvp/models/authShiftModel.js';
import { IncidentsModel } from './mvp/models/incidentsModel.js';

export class FurnaceModel {
  constructor() {
    // Подключаем обособленные модули слоя Model
    this.telemetry = new TelemetryModel();
    this.authShift = new AuthShiftModel();
    this.incidentsModule = new IncidentsModel();

    const shiftInfo = this.getActiveShift();
    this.addLog(
      'INFO',
      `АСУ ТП ДСП запущена в режиме непрерывного мониторинга 24/7 (${shiftInfo.name}). Ожидание авторизации дежурного оператора.`,
      'СИСТЕМА'
    );
  }

  get thresholds() {
    return this.telemetry.thresholds;
  }

  get furnaces() {
    return this.telemetry.furnaces;
  }

  get users() {
    return this.authShift.users;
  }

  get currentUser() {
    return this.authShift.currentUser;
  }

  get incidents() {
    return this.incidentsModule.incidents;
  }

  get logs() {
    return this.incidentsModule.logs;
  }

  // ==========================================================================
  // 1. PERSISTENCE (Сохранение и загрузка состояния 24/7)
  // ==========================================================================

  exportPersistentState() {
    return {
      users: this.authShift.users,
      shiftAssignments: this.authShift.shiftAssignments,
      incidents: this.incidentsModule.incidents,
      activeShiftId: this.authShift.activeShiftId
    };
  }

  importPersistentState(saved) {
    if (!saved || typeof saved !== 'object') return;
    if (Array.isArray(saved.users) && saved.users.length > 0) {
      this.authShift.users = saved.users;
    }
    if (saved.shiftAssignments && typeof saved.shiftAssignments === 'object') {
      this.authShift.shiftAssignments = saved.shiftAssignments;
    }
    if (Array.isArray(saved.incidents) && saved.incidents.length > 0) {
      this.incidentsModule.incidents = saved.incidents;
    }
    if (saved.activeShiftId && this.authShift.shiftsCatalog[saved.activeShiftId]) {
      this.authShift.activeShiftId = Number(saved.activeShiftId);
    }
    // При запуске всегда требуется обязательная авторизация по номеру и паролю
    this.authShift.currentUser = null;
  }

  // ==========================================================================
  // 2. ДЕЛЕГИРОВАНИЕ В МОДУЛЬ АВТОРИЗАЦИИ И СМЕН (AuthShiftModel)
  // ==========================================================================

  isAuthenticated() {
    return Boolean(this.authShift.currentUser);
  }

  getCurrentUser() {
    return this.authShift.currentUser;
  }

  getUsers() {
    return this.authShift.users;
  }

  getUserByBadge(badgeNo) {
    return this.authShift.getUserByBadge(badgeNo);
  }

  getActiveShift() {
    return this.authShift.getActiveShift();
  }

  getResponsibleForFurnace(furnaceId, shiftId = this.authShift.activeShiftId) {
    return this.authShift.getResponsibleForFurnace(furnaceId, shiftId);
  }

  getAssignedFurnaceForUser(badgeNo, shiftId = this.authShift.activeShiftId) {
    return this.authShift.getAssignedFurnaceForUser(badgeNo, shiftId);
  }

  getUserAssignmentsAcrossShifts(badgeNo) {
    return this.authShift.getUserAssignmentsAcrossShifts(badgeNo);
  }

  getShiftAssignmentsMatrix() {
    return this.authShift.getShiftAssignmentsMatrix();
  }

  authenticateUser(badgeNo, pinCode, targetShiftId) {
    const res = this.authShift.authenticateUser(badgeNo, pinCode, targetShiftId);
    if (!res.ok) return res;

    if (res.assignedFurnaceId && res.assignedFurnaceId > 0) {
      this.telemetry.setActiveFurnace(res.assignedFurnaceId);
    }

    const postDesc = res.user.isMaster
      ? 'Все печи ДСП-1..3 (Мастер смены)'
      : (res.assignedFurnaceId ? `Ответственный за ДСП-${res.assignedFurnaceId}` : 'Дежурный оператор');

    this.addLog(
      'INFO',
      `Вход в систему: ${res.user.fullName} (Таб. №${res.user.badgeNo}) · ${res.shift.name} · ${postDesc}.`,
      res.assignedFurnaceId ? `ДСП-${res.assignedFurnaceId}` : 'СИСТЕМА'
    );

    return res;
  }

  endCurrentShift(reason = 'По кнопке «Конец смены»') {
    const furnace = this.getActiveFurnace();
    const res = this.authShift.endCurrentShift(furnace.id);

    this.addLog(
      'WARN',
      `КОНЕЦ СМЕНЫ (${res.prevShift.name}, ${reason}): оператор ${res.prevUser ? res.prevUser.fullName + ' (Таб. №' + res.prevUser.badgeNo + ')' : '—'} сдал дежурство. Опрос ПЛК печей ДСП-1..3 продолжается в фоновом режиме 24/7. Ожидание входа оператора «${res.nextShift.name}» (отв. за ${furnace.name}: ${res.nextResponsible ? res.nextResponsible.fullName : '—'}).`,
      furnace.name
    );

    return res;
  }

  setActiveShift(shiftId) {
    const id = Number(shiftId);
    if (!this.authShift.shiftsCatalog[id]) return null;

    this.authShift.activeShiftId = id;
    const shiftObj = this.getActiveShift();

    if (this.authShift.currentUser && !this.authShift.currentUser.isMaster) {
      const newResp = this.getResponsibleForFurnace(this.telemetry.activeFurnaceId, id);
      if (newResp) this.authShift.currentUser = newResp;
    }

    const r1 = this.getResponsibleForFurnace(1, id);
    const r2 = this.getResponsibleForFurnace(2, id);
    const r3 = this.getResponsibleForFurnace(3, id);

    this.addLog(
      'INFO',
      `Переключена активная вахта: ${shiftObj.name} (${shiftObj.hours}). Ответственные: ДСП-1 → ${r1?.fullName || '—'}, ДСП-2 → ${r2?.fullName || '—'}, ДСП-3 → ${r3?.fullName || '—'}.`,
      'СИСТЕМА'
    );
    return shiftObj;
  }

  checkAccessToFurnace(targetFurnaceId) {
    if (!this.authShift.currentUser) {
      return { allowed: false, reason: 'Требуется авторизация оператора текущей смены.' };
    }
    if (this.authShift.currentUser.isMaster) return { allowed: true };

    const assigned = this.getAssignedFurnaceForUser(this.authShift.currentUser.badgeNo, this.authShift.activeShiftId);
    if (assigned === Number(targetFurnaceId)) return { allowed: true };

    const actualResp = this.getResponsibleForFurnace(targetFurnaceId, this.authShift.activeShiftId);
    return {
      allowed: false,
      reason: `На этой смене за ДСП-${targetFurnaceId} отвечает ${actualResp ? actualResp.fullName : 'другой сталевар'}.`
    };
  }

  addUser({ badgeNo, fullName, role, pinCode, isMaster = false, assignShiftId = 0, assignFurnaceId = 0 }) {
    const cleanBadge = String(badgeNo || '').trim();
    const cleanName = String(fullName || '').trim();
    const cleanPin = String(pinCode || '').trim();
    const cleanRole = String(role || 'Сталевар 6 разряда').trim();

    if (!cleanBadge || !cleanName || !cleanPin) {
      return { ok: false, error: 'Заполните табельный номер, ФИО и пароль сотрудника.' };
    }
    if (this.getUserByBadge(cleanBadge)) {
      return { ok: false, error: `Сотрудник с табельным номером №${cleanBadge} уже существует.` };
    }

    const newUser = {
      badgeNo: cleanBadge,
      fullName: cleanName,
      role: cleanRole,
      pinCode: cleanPin,
      isMaster: Boolean(isMaster) || cleanRole.toLowerCase().includes('мастер')
    };

    this.authShift.users.push(newUser);

    const sId = Number(assignShiftId);
    const fId = Number(assignFurnaceId);
    if (!newUser.isMaster && this.authShift.shiftsCatalog[sId] && [1, 2, 3].includes(fId)) {
      this.authShift.shiftAssignments[sId][fId] = newUser.badgeNo;
      this.addLog(
        'INFO',
        `Зарегистрирован сотрудник ${newUser.fullName} (Таб. №${newUser.badgeNo}) и назначен ответственным за ДСП-${fId} на Смену ${sId}.`,
        `ДСП-${fId}`
      );
    } else {
      this.addLog(
        'INFO',
        `Добавлен новый пользователь: ${newUser.fullName} (Таб. №${newUser.badgeNo}, ${newUser.role}).`,
        'СИСТЕМА'
      );
    }
    return { ok: true, user: newUser };
  }

  deleteUser(badgeNo) {
    const cleanBadge = String(badgeNo);
    if (cleanBadge === '10105') {
      return { ok: false, error: 'Системный аккаунт Мастера смены (Таб. №10105) удалить нельзя.' };
    }
    if (this.authShift.currentUser && String(this.authShift.currentUser.badgeNo) === cleanBadge) {
      return { ok: false, error: 'Нельзя удалить сотрудника, который сейчас находится на дежурстве.' };
    }

    const target = this.getUserByBadge(cleanBadge);
    if (!target) return { ok: false, error: 'Сотрудник не найден.' };

    this.authShift.users = this.authShift.users.filter(u => String(u.badgeNo) !== cleanBadge);
    this.addLog('WARN', `Сотрудник ${target.fullName} (Таб. №${target.badgeNo}) удалён из штата.`, 'СИСТЕМА');
    return { ok: true };
  }

  assignResponsibleForFurnace(shiftId, furnaceId, badgeNo) {
    const sId = Number(shiftId);
    const fId = Number(furnaceId);
    const user = this.getUserByBadge(badgeNo);

    if (!this.authShift.shiftsCatalog[sId] || ![1, 2, 3].includes(fId) || !user) {
      return { ok: false, error: 'Некорректные параметры смены, печи или пользователя.' };
    }

    this.authShift.shiftAssignments[sId][fId] = user.badgeNo;
    const shiftObj = this.authShift.shiftsCatalog[sId];

    this.addLog(
      'INFO',
      `Назначение ответственного: за печь ДСП-${fId} на «${shiftObj.name}» закреплён ${user.fullName} (Таб. №${user.badgeNo}).`,
      `ДСП-${fId}`
    );

    return { ok: true, shift: shiftObj, furnaceId: fId, user };
  }

  // ==========================================================================
  // 3. ДЕЛЕГИРОВАНИЕ В МОДУЛЬ ТЕЛЕМЕТРИИ И СУТОЧНОГО УЧЁТА АВАРИЙ
  // ==========================================================================

  getActiveFurnace() {
    return this.telemetry.getActiveFurnace();
  }

  setActiveFurnace(furnaceId) {
    const f = this.telemetry.setActiveFurnace(furnaceId);
    const resp = this.getResponsibleForFurnace(f.id, this.authShift.activeShiftId);
    this.addLog(
      'INFO',
      `Переключён пост наблюдения на ${f.fullName} (Ответственный на смене: ${resp ? resp.fullName : '—'}, Таб. №${resp ? resp.badgeNo : '—'}).`,
      f.name
    );
    return f;
  }

  getAllFurnacesSummary() {
    return Object.values(this.telemetry.furnaces).map(f => {
      const resp = this.getResponsibleForFurnace(f.id, this.authShift.activeShiftId);
      return {
        id: f.id,
        name: f.name,
        steelGrade: f.steelGrade,
        temperature: f.temperature,
        status: f.status,
        isEmergency: f.isEmergency,
        isCooling: f.isCooling,
        responsibleName: resp ? resp.fullName : 'Не назначен',
        responsibleShort: resp ? this._formatShortName(resp.fullName) : '—',
        responsibleBadge: resp ? resp.badgeNo : '—'
      };
    });
  }

  updateTelemetryTick() {
    const now = new Date();
    let autoShiftEnded = null;
    let newAlarmTriggered = null;

    // 1. Контроль смены суток в 00:00 (24/7)
    const liveDateKey = this.incidentsModule.getDateKey(now);
    if (liveDateKey !== this.incidentsModule.currentDateKey) {
      this.incidentsModule.currentDateKey = liveDateKey;
      this.addLog(
        'INFO',
        `Наступили новые календарные сутки (${liveDateKey}). Открыт новый суточный том учёта аварий АСУ ТП.`,
        'СИСТЕМА'
      );
    }

    // 2. Автоматический контроль завершения смены по расписанию (08:00, 16:00, 00:00)
    const currentHour = now.getHours();
    if (currentHour !== this.authShift.lastAutoShiftHour) {
      this.authShift.lastAutoShiftHour = currentHour;
      if ((currentHour === 8 || currentHour === 16 || currentHour === 0) && this.authShift.currentUser) {
        autoShiftEnded = this.endCurrentShift('Автоматическое окончание времени вахты по расписанию');
      }
    }

    // 3. Шаг расчёта физики всех печей ДСП-1..3 (включая фоновый режим без оператора)
    this.telemetry.tickPhysics(
      furnace => {
        const resp = this.getResponsibleForFurnace(furnace.id, this.authShift.activeShiftId);
        const inc = !furnace.activeIncidentId
          ? this.incidentsModule.recordDailyIncident(
              furnace,
              this.authShift.activeShiftId,
              resp,
              'АВ-01',
              'Превышение критического порога температуры ванны (> 1650 °C)'
            )
          : null;
        this.addLog(
          'ALARM',
          `КРИТИЧЕСКИЙ ПЕРЕГРЕВ (${furnace.temperature} °C > 1650 °C)! Ответственный на смене: ${resp ? resp.fullName : '—'} (Таб. №${resp ? resp.badgeNo : '—'}).`,
          furnace.name
        );
        newAlarmTriggered = { furnace, incident: inc };
      },
      furnace => {
        this.incidentsModule.resolveActiveIncidentForFurnace(furnace);
        const resp = this.getResponsibleForFurnace(furnace.id, this.authShift.activeShiftId);
        this.addLog(
          'INFO',
          `Авария локализована (${furnace.temperature} °C). Ответственный сталевар: ${resp ? resp.fullName : '—'}.`,
          furnace.name
        );
      },
      furnace => {
        this.incidentsModule.updatePeakTemperature(furnace);
      }
    );

    return { autoShiftEnded, newAlarmTriggered };
  }

  triggerEmergency() {
    const furnace = this.getActiveFurnace();
    if (!furnace.isEmergency) {
      this.telemetry.setEmergencyState(furnace);
      const resp = this.getResponsibleForFurnace(furnace.id, this.authShift.activeShiftId);
      const incident = this.incidentsModule.recordDailyIncident(
        furnace,
        this.authShift.activeShiftId,
        resp,
        'АВ-01',
        'Прогар водоохлаждаемой панели свода и перегрев ванны (> 1650 °C)'
      );
      this.addLog(
        'ALARM',
        `АВАРИЯ [${incident.id}]: перегрев ${furnace.temperature} °C! Выведена инструкция СОП по устранению (${incident.dateKey}, Смена ${incident.shiftId}, отв. ${incident.responsibleName}).`,
        furnace.name
      );
    } else {
      this.activateEmergencyCooling();
    }
    return furnace;
  }

  activateEmergencyCooling() {
    const furnace = this.getActiveFurnace();
    this.telemetry.setCoolingState(furnace);
    const resp = this.getResponsibleForFurnace(furnace.id, this.authShift.activeShiftId);
    this.addLog(
      'WARN',
      `Инструкция СОП выполнена. АВАРИЙНОЕ ОХЛАЖДЕНИЕ запущено (${resp ? resp.fullName : '—'}): проток воды 112.5 м³/ч, мощность снижена до 32 МВт.`,
      furnace.name
    );
    return furnace;
  }

  getEmergencyInstruction(code = 'АВ-01') {
    return this.incidentsModule.getEmergencyInstruction(code);
  }

  getDailyIncidentsStats(daysCount = 7) {
    return this.incidentsModule.getDailyIncidentsStats(daysCount);
  }

  getFilteredIncidents(filters) {
    return this.incidentsModule.getFilteredIncidents(filters);
  }

  addLog(level, message, furnaceName = 'ДСП-1') {
    return this.incidentsModule.addLog(level, message, furnaceName);
  }

  getLogs() {
    return this.incidentsModule.logs;
  }

  generateCsvReport() {
    const lines = [];
    const shiftObj = this.getActiveShift();
    const currentUser = this.getCurrentUser();

    lines.push('ОТЧЁТ АСУ ТП ДСП (КРУГЛОСУТОЧНЫЙ МОНИТОРИНГ 24/7) | ОАО «БМЗ» (ЭСПЦ-2, г. Жлобин)');
    lines.push(`Дата выгрузки;${new Date().toLocaleString('ru-RU')}`);
    lines.push(`Активная смена;${shiftObj.name} (${shiftObj.hours})`);
    lines.push(`Авторизованный оператор;${currentUser ? currentUser.fullName + ' (Таб. №' + currentUser.badgeNo + ')' : 'Ожидание приёма смены'}`);
    lines.push('');

    lines.push('1. ТЕКУЩИЕ ПОКАЗАНИЯ ДАТЧИКОВ И ОТВЕТСТВЕННЫЕ ЗА ПЕЧИ НА ТЕКУЩЕЙ СМЕНЕ');
    lines.push('Агрегат;Ответственный сталевар;Таб. №;Плавка №;Марка стали;Стадия;Статус;Температура (°C);Ток (кА);Давление (Па);Энергия (МВт·ч);Кислород (м³/ч)');

    Object.values(this.telemetry.furnaces).forEach(f => {
      const resp = this.getResponsibleForFurnace(f.id, this.authShift.activeShiftId);
      const statusRu = f.status === 'danger' ? 'АВАРИЯ' : (f.status === 'warning' ? 'ВНИМАНИЕ' : 'НОРМА');
      lines.push([
        f.name,
        resp ? resp.fullName : 'Не назначен',
        resp ? resp.badgeNo : '—',
        f.meltNumber,
        f.steelGrade,
        f.stage,
        statusRu,
        f.temperature,
        f.current,
        f.pressure,
        f.energy,
        f.oxygen
      ].join(';'));
    });

    lines.push('');
    lines.push('2. МАТРИЦА НАЗНАЧЕНИЯ ОТВЕТСТВЕННЫХ СТАЛЕВАРОВ ПО СМЕНАМ');
    lines.push('Смена;Часы работы;ДСП-1 (Ответственный);ДСП-2 (Ответственный);ДСП-3 (Ответственный)');
    this.getShiftAssignmentsMatrix().forEach(row => {
      lines.push([
        row.shiftName,
        row.hours,
        `${row.furnaces[1].fullName} (Таб. №${row.furnaces[1].badgeNo})`,
        `${row.furnaces[2].fullName} (Таб. №${row.furnaces[2].badgeNo})`,
        `${row.furnaces[3].fullName} (Таб. №${row.furnaces[3].badgeNo})`
      ].join(';'));
    });

    lines.push('');
    lines.push('3. РЕЕСТР УЧЁТА АВАРИЙ ПО ДНЯМ И СМЕНАМ (24/7)');
    lines.push('ID;Дата (День);Время;Смена;Печь;Код;Описание аварии;Пиковая T (°C);Ответственный сталевар;Таб. №;Статус');
    this.incidentsModule.incidents.forEach(inc => {
      lines.push([
        inc.id,
        inc.dateKey,
        inc.time,
        `Смена ${inc.shiftId}`,
        inc.furnaceName,
        inc.code,
        `"${String(inc.title).replace(/;/g, ',')}"`,
        inc.maxTemp,
        inc.responsibleName,
        inc.responsibleBadge,
        inc.status
      ].join(';'));
    });

    lines.push('');
    lines.push('4. ОПЕРАТИВНЫЙ ЖУРНАЛ СОБЫТИЙ АСУ ТП');
    lines.push('Время;Агрегат;Уровень;Технологическое сообщение');
    this.incidentsModule.logs.forEach(log => {
      const cleanMsg = String(log.message).replace(/;/g, ',');
      lines.push(`${log.time};${log.furnace};${log.level};"${cleanMsg}"`);
    });

    return lines.join('\r\n');
  }

  _formatShortName(fullName) {
    return this.authShift.formatShortName(fullName);
  }
}
