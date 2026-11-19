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
        sensorKey: 'temperature',
        sensorName: 'Температура расплава',
        metricLabel: 'ТЕМПЕРАТУРА',
        direction: 'high',
        shortBadge: 'АВАРИЯ! ПЕРЕГРЕВ > 1650 °C',
        preview: 'Рост температуры ванны > 1650 °C, падение протока охлаждения свода.',
        title: 'КРИТИЧЕСКИЙ ПЕРЕГРЕВ ЖИДКОЙ ВАННЫ (> 1650 °C)',
        cause: 'Превышение тепловой нагрузки дуги 3-х фаз при снижении расхода охлаждающей воды водоохлаждаемых панелей свода ниже 45 м³/ч.',
        danger: 'Интенсивный размыв магнезитоуглеродистой футеровки и риск попадания воды под давлением в жидкий расплав стали (угроза парового выброса).',
        steps: [
          'Перевести переключатель ступеней печного трансформатора на пониженную ступень (снижение активной мощности дуги до 32 МВт).',
          'Приподнять графитированные электроды 3-х фаз гидроприводом для уменьшения теплового облучения свода.',
          'Перекрыть отсечной клапан подачи кислорода на сводовую фурму O₂.',
          'Включить резервный насос и форсированную подачу воды контура охлаждения панелей свода (112.5 м³/ч).',
          'Доложить мастеру смены ЭСПЦ-2 и зафиксировать локализацию аварии в суточном реестре.'
        ]
      },
      'АВ-02': {
        code: 'АВ-02',
        sensorKey: 'temperature',
        sensorName: 'Температура расплава',
        metricLabel: 'ТЕМПЕРАТУРА',
        direction: 'low',
        shortBadge: 'АВАРИЯ! ОСТЫВАНИЕ < 1525 °C',
        preview: 'Критическое падение температуры ванны < 1525 °C, угроза «козления».',
        title: 'КРИТИЧЕСКОЕ ПЕРЕОХЛАЖДЕНИЕ ВАННЫ (< 1525 °C · РИСК «КОЗЛЕНИЯ»)',
        cause: 'Длительный простой под пониженной мощностью, зависание холодной шихты или аварийное отключение ступени трансформатора.',
        danger: 'Загустевание шлака, застывание металла на подине и в выпускном отверстии («козление» печи), срыв выпуска плавки.',
        steps: [
          'Проверить положение электродов и работу автоматического регулятора мощности (АРМ).',
          'Перевести печной трансформатор на повышенную рабочую ступень для интенсивного прогрева ванны.',
          'Проверить герметичность рабочего окна и прикрыть шибер газоотвода для снижения тепловых потерь.',
          'Скорректировать шлаковый режим для восстановления теплового экрана дуги.',
          'Контролировать рост температуры ванны до выхода в рабочую зону (> 1550 °C) и доложить мастеру смены.'
        ]
      },
      'АВ-03': {
        code: 'АВ-03',
        sensorKey: 'current',
        sensorName: 'Ток электродов (3Ф)',
        metricLabel: 'ТОК (3Ф)',
        direction: 'high',
        shortBadge: 'АВАРИЯ! ПЕРЕГРУЗКА ТОКА > 63 кА',
        preview: 'Скачок фазного тока > 63 кА из-за обвала шихты и короткого замыкания.',
        title: 'ПЕРЕГРУЗКА ФАЗНОГО ТОКА ЭЛЕКТРОДОВ (> 63 кА · КЗ ШИХТЫ)',
        cause: 'Обвал тяжёлого металлолома на графитированные электроды (эксплуатационное КЗ) или сбой регулятора перемещения электродов.',
        danger: 'Поломка (облом) электродов из-за электродинамических ударов, тепловая перегрузка печного трансформатора и срабатывание МТЗ.',
        steps: [
          'Немедленно приподнять электроды аварийной фазы в ручном режиме АРМ для разрыва короткого замыкания.',
          'Снизить ступень печного трансформатора для ограничения токовой нагрузки на обмотки.',
          'Проверить симметрию фазных токов и отсутствие механического заклинивания свечи электрода.',
          'Перевести регулятор АРМ в автоматический режим с контролем уставки импеданса.',
          'Убедиться в стабилизации тока в пределах 42–58 кА и зафиксировать инцидент в журнале.'
        ]
      },
      'АВ-04': {
        code: 'АВ-04',
        sensorKey: 'current',
        sensorName: 'Ток электродов (3Ф)',
        metricLabel: 'ТОК (3Ф)',
        direction: 'low',
        shortBadge: 'АВАРИЯ! ОБРЫВ ДУГИ < 34 кА',
        preview: 'Резкое падение тока < 34 кА, обрыв электрической дуги или облом электрода.',
        title: 'ОБРЫВ ЭЛЕКТРИЧЕСКОЙ ДУГИ / ПАДЕНИЕ ТОКА (< 34 кА)',
        cause: 'Облом нижнего звена графитированного электрода, нарушение контакта в электрододержателе или падение давления в гидроприводе.',
        danger: 'Прекращение ввода активной мощности, охлаждение расплава и сильные колебания напряжения в электросети цеха.',
        steps: [
          'Отключить высоковольтный вакуумный выключатель печи перед осмотром электродного узла.',
          'Проверить состояние электродной свечи и зажимных контактных щёк на предмет облома.',
          'Проверить давление масла в гидросистеме перемещения электрододержателей.',
          'Восстановить контакт или выполнить наращивание электрода с соблюдением ТБ.',
          'Повторно зажечь дугу и вывести фазный ток в рабочий диапазон 42–58 кА.'
        ]
      },
      'АВ-05': {
        code: 'АВ-05',
        sensorKey: 'pressure',
        sensorName: 'Давление под сводом',
        metricLabel: 'ДАВЛЕНИЕ',
        direction: 'high',
        shortBadge: 'АВАРИЯ! ДАВЛЕНИЕ > 65 Па',
        preview: 'Рост давления газов > 65 Па, выбивание пламени и CO в цех.',
        title: 'КРИТИЧЕСКОЕ ДАВЛЕНИЕ ГАЗОВ ПОД СВОДОМ (> 65 Па)',
        cause: 'Заклинивание шибера газохода 4-го отверстия свода, падение тяги дымососа газоочистки или резкое газовыделение при продувке.',
        danger: 'Выбивание раскалённых печных газов (CO, пыль) и пламени в цех, перегрев электрододержателей и загазованность площадки.',
        steps: [
          'Открыть регулирующий шибер газохода 4-го отверстия свода на 100%.',
          'Включить резервный дымосос системы газоотвода и газоочистки.',
          'Снизить подачу кислорода O₂ на сводовую фурму для уменьшения газовыделения.',
          'Вывести персонал из зоны рабочего окна печи до нормализации давления.',
          'Восстановить рабочее давление под сводом в пределах 35–56 Па.'
        ]
      },
      'АВ-06': {
        code: 'АВ-06',
        sensorKey: 'pressure',
        sensorName: 'Давление под сводом',
        metricLabel: 'ДАВЛЕНИЕ',
        direction: 'low',
        shortBadge: 'АВАРИЯ! РАЗРЕЖЕНИЕ < 25 Па',
        preview: 'Падение давления < 25 Па, сильный подсос холодного воздуха под свод.',
        title: 'КРИТИЧЕСКОЕ РАЗРЕЖЕНИЕ ПОД СВОДОМ (< 25 Па · ПОДСОС ВОЗДУХА)',
        cause: 'Полное открытие шибера газоотвода при сбое датчика тяги или разгерметизация заслонки рабочего окна.',
        danger: 'Мощный подсос холодного атмосферного воздуха, резкий рост тепловых потерь, окисление электродов и угар металла.',
        steps: [
          'Перевести управление шибером 4-го отверстия свода в ручной режим.',
          'Прикрыть регулирующую заслонку газохода и снизить обороты дымососа.',
          'Проверить плотность закрытия заслонки рабочего окна и уплотнений свода.',
          'Проверить показания дифманометра (датчика давления под сводом) на достоверность.',
          'Вывести давление в стабильный диапазон 35–56 Па и вернуть автоматическое регулирование.'
        ]
      },
      'АВ-07': {
        code: 'АВ-07',
        sensorKey: 'energy',
        sensorName: 'Расход электроэнергии',
        metricLabel: 'ЭНЕРГИЯ',
        direction: 'high',
        shortBadge: 'АВАРИЯ! ПЕРЕРАСХОД > 82 МВт·ч',
        preview: 'Превышение лимита электроэнергии > 82 МВт·ч за плавку (> 600 кВт·ч/т).',
        title: 'ПРЕВЫШЕНИЕ ЛИМИТА РАСХОДА ЭЛЕКТРОЭНЕРГИИ (> 82 МВт·ч)',
        cause: 'Затянутый цикл плавки, отсутствие вспененного шлака (высокие потери открытой дуги) или неконтролируемые подсосы воздуха.',
        danger: 'Перегрузка цеховой подстанции, ускоренный износ огнеупорной футеровки и критический перерасход энергоресурсов.',
        steps: [
          'Ограничить активную мощность печного трансформатора до экономичной ступени.',
          'Восстановить вспененный шлак (присадка коксика/извести) для экранирования дуги.',
          'Устранить подсосы холодного воздуха и стабилизировать давление под сводом.',
          'Согласовать ускоренный выпуск плавки с мастером смены и разливочным пролётом.',
          'Уведомить диспетчера энергослужбы о превышении лимита потребления.'
        ]
      },
      'АВ-08': {
        code: 'АВ-08',
        sensorKey: 'oxygen',
        sensorName: 'Расход кислорода (O₂)',
        metricLabel: 'КИСЛОРОД O₂',
        direction: 'low',
        shortBadge: 'АВАРИЯ! ПАДЕНИЕ O₂ < 1000 м³/ч',
        preview: 'Падение расхода O₂ < 1000 м³/ч (засорение фурмы или падение давления).',
        title: 'ПАДЕНИЕ ПОДАЧИ КИСЛОРОДА O₂ (< 1000 м³/ч · ЗАСОРЕНИЕ ФУРМЫ)',
        cause: 'Падение давления в кислородной магистрали цеха, закрытие отсечного клапана или ошлакование сопла сводовой фурмы.',
        danger: 'Прекращение вспенивания шлака, открытое тепловое облучение стен печи дугой и остановка процесса обезуглероживания.',
        steps: [
          'Проверить давление в магистрали технического кислорода и состояние отсечного клапана.',
          'Переключить подачу O₂ на резервную линию или стеновые кислородные фурмы.',
          'Временно снизить мощность дуги для защиты водоохлаждаемых стен от прямого излучения.',
          'Выполнить продувку и очистку сопла сводовой фурмы от шлаковой корки.',
          'Восстановить расход кислорода в рабочем диапазоне 1800–3900 м³/ч.'
        ]
      },
      'АВ-09': {
        code: 'АВ-09',
        sensorKey: 'oxygen',
        sensorName: 'Расход кислорода (O₂)',
        metricLabel: 'КИСЛОРОД O₂',
        direction: 'high',
        shortBadge: 'АВАРИЯ! ИЗБЫТОК O₂ > 4300 м³/ч',
        preview: 'Скачок подачи O₂ > 4300 м³/ч, бурное вскипание и риск выброса шлака.',
        title: 'ПЕРЕИЗБЫТОК ПОДАЧИ КИСЛОРОДА O₂ (> 4300 м³/ч · ВЫБРОС ШЛАКА)',
        cause: 'Заклинивание регулирующего клапана кислородной фурмы в открытом положении или сбой расходомера.',
        danger: 'Бурное вскипание ванны, выбросы раскалённого шлака и металла через рабочее окно, переокисленность стали.',
        steps: [
          'Немедленно перекрыть аварийный отсечной клапан на линии подачи кислорода O₂.',
          'Перевести регулирующий клапан расхода O₂ на ручное управление.',
          'Увеличить тягу дымососа газоочистки для отвода избыточного объёма CO.',
          'Вывести персонал из зоны рабочего окна и стабилизировать шлак присадкой углерода.',
          'Восстановить штатный расход кислорода (≤ 3900 м³/ч) и проверить клапан.'
        ]
      }
    };

    this.incidents = [];
  }

  getEmergencyScenariosList() {
    return Object.values(this.emergencyInstructionsCatalog);
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
      topFurnaceName: this.incidents.length > 0
        ? `ДСП-${topFurnaceId} (${fCounts[topFurnaceId]} ав.)`
        : 'Нет аварий'
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
