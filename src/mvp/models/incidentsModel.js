/**
 * ============================================================================
 * [M] MVP MODEL MODULE 3: src/mvp/models/incidentsModel.js
 * Назначение: Модель круглосуточного учёта аварий по дням (24/7),
 *             оперативного журнала событий и каталога инструкций СОП
 * ============================================================================
 * Роль в паттерне MVP:
 * 1. Хранит многодневный архив аварийных инцидентов (`incidents`) с привязкой
 *    к календарному дню (`YYYY-MM-DD`), смене, печи и ФИО ответственного сталевара.
 * 2. Отслеживает автоматический переход суток в 00:00 (24/7).
 * 3. Хранит каталог пошаговых инструкций СОП по устранению аварий (`emergencyInstructionsCatalog`).
 * 4. Ведёт массив оперативного журнала событий (`logs`).
 *
 * ВАЖНО: Ничего не знает о DOM и HTML.
 */

export class IncidentsModel {
  constructor() {
    this.currentDateKey = this.getDateKey(new Date());
    this.logs = [];

    this.emergencyInstructionsCatalog = {
      'АВ-01': {
        code: 'АВ-01',
        title: 'КРИТИЧЕСКИЙ ПЕРЕГРЕВ ЖИДКОЙ ВАННЫ (> 1650 °C) И ПРОГАР ПАНЕЛИ СВОДА',
        cause: 'Превышение тепловой нагрузки дуги 3-х фаз при снижении расхода охлаждающей воды водоохлаждаемых панелей свода ниже 45 м³/ч.',
        danger: 'Интенсивный размыв магнезитоуглеродистой футеровки и риск попадания воды под давлением в жидкий расплав стали (угроза парового выброса).',
        steps: [
          'Перевести переключатель ступеней печного трансформатора на пониженную ступень (снижение активной мощности дуги до 32 МВт).',
          'Приподнять графитированные электроды 3-х фаз гидроприводом для уменьшения теплового облучения свода.',
          'Перекрыть отсечной клапан подачи кислорода на сводовую фурму O₂.',
          'Включить резервный насос и форсированную подачу воды контура охлаждения панелей свода (112.5 м³/ч).',
          'Доложить мастеру смены ЭСПЦ-2 и зафиксировать локализацию аварии в суточном реестре.'
        ]
      }
    };

    this.incidents = this._createSeededDailyIncidents();
  }

  _createSeededDailyIncidents() {
    const now = new Date();
    const dayKey = (daysAgo) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return this.getDateKey(d);
    };

    return [
      { id: 'INC-101', dateKey: dayKey(6), time: '11:24:10', shiftId: 1, furnaceId: 1, furnaceName: 'ДСП-1', code: 'АВ-01', title: 'Перегрев жидкой ванны (> 1650 °C)', maxTemp: 1668, responsibleName: 'Иванов Алексей Владимирович', responsibleBadge: '10421', status: 'Устранена' },
      { id: 'INC-102', dateKey: dayKey(5), time: '19:42:05', shiftId: 2, furnaceId: 2, furnaceName: 'ДСП-2', code: 'АВ-02', title: 'Падение расхода воды охлаждения свода (< 45 м³/ч)', maxTemp: 1662, responsibleName: 'Кравченко Максим Олегович', responsibleBadge: '20422', status: 'Устранена' },
      { id: 'INC-103', dateKey: dayKey(5), time: '22:15:48', shiftId: 2, furnaceId: 1, furnaceName: 'ДСП-1', code: 'АВ-01', title: 'Перегрев жидкой ванны (> 1650 °C)', maxTemp: 1674, responsibleName: 'Сидоренко Павел Петрович', responsibleBadge: '20421', status: 'Устранена' },
      { id: 'INC-104', dateKey: dayKey(4), time: '03:18:30', shiftId: 3, furnaceId: 3, furnaceName: 'ДСП-3', code: 'АВ-03', title: 'Перегрузка фазного тока электродов (> 64 кА)', maxTemp: 1659, responsibleName: 'Громов Роман Сергеевич', responsibleBadge: '30423', status: 'Устранена' },
      { id: 'INC-105', dateKey: dayKey(3), time: '14:05:12', shiftId: 1, furnaceId: 2, furnaceName: 'ДСП-2', code: 'АВ-01', title: 'Перегрев жидкой ванны (> 1650 °C)', maxTemp: 1679, responsibleName: 'Петров Сергей Николаевич', responsibleBadge: '10422', status: 'Устранена' },
      { id: 'INC-106', dateKey: dayKey(2), time: '17:51:22', shiftId: 2, furnaceId: 3, furnaceName: 'ДСП-3', code: 'АВ-02', title: 'Критическое давление газов под сводом (> 68 Па)', maxTemp: 1664, responsibleName: 'Беляев Артём Викторович', responsibleBadge: '20423', status: 'Устранена' },
      { id: 'INC-107', dateKey: dayKey(2), time: '23:10:04', shiftId: 2, furnaceId: 1, furnaceName: 'ДСП-1', code: 'АВ-01', title: 'Перегрев жидкой ванны (> 1650 °C)', maxTemp: 1682, responsibleName: 'Сидоренко Павел Петрович', responsibleBadge: '20421', status: 'Устранена' },
      { id: 'INC-108', dateKey: dayKey(1), time: '04:33:19', shiftId: 3, furnaceId: 1, furnaceName: 'ДСП-1', code: 'АВ-01', title: 'Перегрев жидкой ванны (> 1650 °C)', maxTemp: 1671, responsibleName: 'Морозов Игорь Константинович', responsibleBadge: '30421', status: 'Устранена' },
      { id: 'INC-109', dateKey: dayKey(1), time: '13:20:45', shiftId: 1, furnaceId: 3, furnaceName: 'ДСП-3', code: 'АВ-03', title: 'Перегрузка фазного тока электродов (> 64 кА)', maxTemp: 1656, responsibleName: 'Ковалёв Дмитрий Игоревич', responsibleBadge: '10423', status: 'Устранена' },
      { id: 'INC-110', dateKey: dayKey(0), time: '09:15:00', shiftId: 1, furnaceId: 2, furnaceName: 'ДСП-2', code: 'АВ-01', title: 'Кратковременный перегрев ванны при доводке (> 1650 °C)', maxTemp: 1658, responsibleName: 'Петров Сергей Николаевич', responsibleBadge: '10422', status: 'Устранена' }
    ];
  }

  getEmergencyInstruction(code = 'АВ-01') {
    return this.emergencyInstructionsCatalog[code] || this.emergencyInstructionsCatalog['АВ-01'];
  }

  recordDailyIncident(furnace, shiftId, responsible, code = 'АВ-01', title = 'Критический перегрев ванны и прогар панели свода (> 1650 °C)') {
    const now = new Date();
    const incident = {
      id: `INC-${Date.now().toString().slice(-4)}`,
      dateKey: this.getDateKey(now),
      time: now.toTimeString().split(' ')[0],
      shiftId,
      furnaceId: furnace.id,
      furnaceName: furnace.name,
      code,
      title,
      maxTemp: furnace.temperature,
      responsibleName: responsible ? responsible.fullName : 'Не назначен',
      responsibleBadge: responsible ? responsible.badgeNo : '—',
      status: 'Активна'
    };

    this.incidents.unshift(incident);
    furnace.activeIncidentId = incident.id;
    return incident;
  }

  resolveActiveIncidentForFurnace(furnace) {
    if (!furnace.activeIncidentId) return;
    const inc = this.incidents.find(i => i.id === furnace.activeIncidentId);
    if (inc) {
      inc.status = 'Устранена';
      inc.maxTemp = Math.max(inc.maxTemp, furnace.temperature);
    }
    furnace.activeIncidentId = null;
  }

  updatePeakTemperature(furnace) {
    if (!furnace.activeIncidentId) return;
    const inc = this.incidents.find(i => i.id === furnace.activeIncidentId);
    if (inc && furnace.temperature > inc.maxTemp) {
      inc.maxTemp = furnace.temperature;
    }
  }

  getDailyIncidentsStats(daysCount = 7) {
    const now = new Date();
    const days = [];

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = this.getDateKey(d);
      const shortLabel = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      const weekday = d.toLocaleDateString('ru-RU', { weekday: 'short' });

      const dayIncidents = this.incidents.filter(inc => inc.dateKey === dateKey);
      days.push({
        dateKey,
        shortLabel,
        weekday,
        isToday: i === 0,
        total: dayIncidents.length,
        activeCount: dayIncidents.filter(inc => inc.status === 'Активна').length,
        byFurnace: {
          1: dayIncidents.filter(inc => Number(inc.furnaceId) === 1).length,
          2: dayIncidents.filter(inc => Number(inc.furnaceId) === 2).length,
          3: dayIncidents.filter(inc => Number(inc.furnaceId) === 3).length
        },
        byShift: {
          1: dayIncidents.filter(inc => Number(inc.shiftId) === 1).length,
          2: dayIncidents.filter(inc => Number(inc.shiftId) === 2).length,
          3: dayIncidents.filter(inc => Number(inc.shiftId) === 3).length
        }
      });
    }

    const todayStats = days[days.length - 1] || { total: 0, activeCount: 0 };
    const totalWeek = days.reduce((acc, d) => acc + d.total, 0);

    const fCounts = { 1: 0, 2: 0, 3: 0 };
    this.incidents.forEach(inc => {
      if (fCounts[inc.furnaceId] !== undefined) fCounts[inc.furnaceId]++;
    });
    const topFurnaceId = Object.keys(fCounts).sort((a, b) => fCounts[b] - fCounts[a])[0] || 1;

    return {
      days,
      todayTotal: todayStats.total,
      todayActive: todayStats.activeCount,
      weekTotal: totalWeek,
      allTimeTotal: this.incidents.length,
      topFurnaceName: `ДСП-${topFurnaceId} (${fCounts[topFurnaceId]} ав.)`
    };
  }

  getFilteredIncidents({ dateKey = 'ALL', shiftId = 'ALL', furnaceId = 'ALL' } = {}) {
    return this.incidents.filter(inc => {
      if (dateKey !== 'ALL' && inc.dateKey !== dateKey) return false;
      if (shiftId !== 'ALL' && Number(inc.shiftId) !== Number(shiftId)) return false;
      if (furnaceId !== 'ALL' && Number(inc.furnaceId) !== Number(furnaceId)) return false;
      return true;
    });
  }

  addLog(level, message, furnaceName = 'ДСП-1') {
    const entry = {
      id: Date.now() + Math.random(),
      time: new Date().toTimeString().split(' ')[0],
      furnace: furnaceName,
      level,
      message
    };
    this.logs.unshift(entry);
    if (this.logs.length > 150) this.logs.pop();
    return entry;
  }

  getDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
