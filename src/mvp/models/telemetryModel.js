/**
 * ============================================================================
 * [M] MVP MODEL MODULE 1: src/mvp/models/telemetryModel.js
 * Назначение: Модель телеметрии датчиков и теплофизики печей ДСП-1, ДСП-2, ДСП-3
 * ============================================================================
 * Роль в паттерне MVP:
 * 1. Хранит физическое состояние трёх дуговых сталеплавильных печей ОАО «БМЗ»
 *    (температура расплава °C, ток электродов кА, давление Па, расход энергии МВт·ч,
 *    расход кислорода м³/ч, тепловой баланс жидкой ванны).
 * 2. Рассчитывает показания датчиков на каждом секундном такте ПЛК (работает 24/7,
 *    даже когда оператор нажал «Конец смены» и вышел из системы).
 * 3. Проверяет критические пороги (Норма / Внимание / Авария > 1650 °C).
 *
 * ВАЖНО: Ничего не знает о DOM, HTML, Chart.js или Three.js.
 */

export class TelemetryModel {
  constructor() {
    this.activeFurnaceId = 1;
    this.tickCounter = 0;

    // Технологические уставки и критические пороги ЭСПЦ-2 ОАО «БМЗ» (верхние и нижние)
    this.thresholds = {
      temperature: { min: 1480, criticalLow: 1525, normalMin: 1540, normalMax: 1630, critical: 1650, max: 1720 },
      current:     { min: 15,   criticalLow: 34,   normalMin: 40,   normalMax: 58,   critical: 63,   max: 75 },
      pressure:    { min: 5,    criticalLow: 25,   normalMin: 33,   normalMax: 56,   critical: 65,   max: 85 },
      energy:      { min: 0,    criticalLow: null, normalMin: null, normalMax: 72,   critical: 82,   max: 95 },
      oxygen:      { min: 300,  criticalLow: 1000, normalMin: 1600, normalMax: 3900, critical: 4300, max: 5000 }
    };

    // Подробная технологическая справка по каждому показателю ДСП-135
    this.sensorCatalog = {
      temperature: {
        key: 'temperature',
        title: 'Температура расплава',
        unit: '°C',
        normalRange: '1540–1630 °C',
        criticalThreshold: '> 1650 °C',
        description: 'Контролирует тепловое состояние жидкой металлической ванны и готовность стали к выпуску. Определяет скорость растворения легирующих добавок, жидкоподвижность шлака и стойкость огнеупорной футеровки печи.',
        belowTitle: 'Если ниже нормы (< 1540 °C)',
        belowEffects: [
          'Неполное расплавление шихты и замедление рафинирования (удаления серы и фосфора).',
          'Загустевание шлака, риск «козления» — застывания металла на подине и в выпускном отверстии.',
          'Невозможность стабильной разливки на МНЛЗ из-за преждевременного затвердевания стали в ковше.'
        ],
        belowAction: 'Повысить ступень печного трансформатора, увеличить ввод активной мощности дуги и продлить подогрев ванны.',
        aboveTitle: 'Если выше нормы (> 1630 °C / критич. > 1650 °C)',
        aboveEffects: [
          'Интенсивный термический и химический размыв магнезитоуглеродистой футеровки стен и подины.',
          'Перегрев и прогар водоохлаждаемых панелей свода — угроза попадания воды в расплав и парового выброса.',
          'Повышенный угар легирующих элементов и насыщение стали газами (водородом и азотом).'
        ],
        aboveAction: 'Снизить ступень трансформатора, приподнять электроды, перекрыть подачу O₂ и включить форсированное охлаждение свода.'
      },
      current: {
        key: 'current',
        title: 'Ток электродов (3Ф)',
        unit: 'кА',
        normalRange: '42–58 кА',
        criticalThreshold: '> 63 кА',
        description: 'Отражает силу трёхфазного переменного тока в графитированных электродах при горении электрической дуги. Прямо определяет вводимую активную мощность и интенсивность плавления металлолома.',
        belowTitle: 'Если ниже нормы (< 42 кА)',
        belowEffects: [
          'Недостаточный тепловой ввод в ванну, затягивание цикла плавки и снижение производительности печи.',
          'Нестабильное горение дуги, частые обрывы разряда и колебания напряжения в питающей сети.',
          'Рост удельных тепловых потерь на тонну выплавляемой стали.'
        ],
        belowAction: 'Проверить автоматический регулятор мощности (АРМ), высоту стояния электродов и рабочую ступень трансформатора.',
        aboveTitle: 'Если выше нормы (> 58 кА / критич. > 63 кА)',
        aboveEffects: [
          'Тепловая перегрузка печного трансформатора, короткой сети и водоохлаждаемых кабелей.',
          'Ускоренный износ и риск поломки (облома) графитированных электродов из-за электродинамических ударов.',
          'Локальный перегрев откосов и свода, риск аварийного отключения по максимальной токовой защите (МТЗ).'
        ],
        aboveAction: 'Перевести печной трансформатор на пониженную ступень и скорректировать уставку импеданса в системе АРМ.'
      },
      pressure: {
        key: 'pressure',
        title: 'Давление под сводом',
        unit: 'Па',
        normalRange: '35–56 Па',
        criticalThreshold: '> 65 Па',
        description: 'Характеризует аэродинамический режим рабочего пространства печи — баланс между выделением технологических газов в ванне и тягой газоочистки через 4-е отверстие свода.',
        belowTitle: 'Если ниже нормы (< 35 Па, сильное разрежение)',
        belowEffects: [
          'Интенсивный подсос холодного воздуха через рабочее окно и неплотности свода.',
          'Резкий рост тепловых потерь, повышенный угар металла и ускоренное окисление электродов.',
          'Унос мелких фракций извести и шихты в систему газоотвода.'
        ],
        belowAction: 'Прикрыть регулирующую заслонку (шибер) газохода 4-го отверстия свода для стабилизации давления.',
        aboveTitle: 'Если выше нормы (> 56 Па / критич. > 65 Па)',
        aboveEffects: [
          'Выбивание раскалённых печных газов (CO, пыль) и языков пламени через электродные зазоры и рабочее окно.',
          'Термическое повреждение электрододержателей, уплотнений и металлоконструкций портала печи.',
          'Загазованность рабочей площадки сталеваров и нарушение норм промышленной безопасности.'
        ],
        aboveAction: 'Увеличить тягу дымососа газоочистки, открыть шибер газоотвода и снизить интенсивность продувки кислородом.'
      },
      energy: {
        key: 'energy',
        title: 'Расход электроэнергии',
        unit: 'МВт·ч',
        normalRange: '≤ 72 МВт·ч (340–530 кВт·ч/т)',
        criticalThreshold: '> 82 МВт·ч',
        description: 'Показывает суммарный расход электроэнергии за текущую плавку (садка 135 т) и удельные энергозатраты. Основной показатель энергоэффективности и себестоимости выплавки стали.',
        belowTitle: 'Если ниже нормы для текущей стадии',
        belowEffects: [
          'Недогрев шихты и неполное проплавление тяжёлого металлолома («недоплав» в холодных зонах).',
          'Недостаточный прогрев для формирования активного вспененного шлака.',
          'Задержка выхода на стадию доводки и необходимость дополнительного подогрева на установке «ковш-печь».'
        ],
        belowAction: 'Сверить фактический ввод энергии с технологической картой марки стали и скорректировать энергетический профиль.',
        aboveTitle: 'Если выше нормы (> 72 МВт·ч / критич. > 82 МВт·ч)',
        aboveEffects: [
          'Перерасход электроэнергии и рост себестоимости плавки (признак затянутой плавки, подсосов воздуха или перегрева).',
          'Повышенный износ футеровки, водоохлаждаемых панелей и графитированных электродов.',
          'Превышение цехового лимита энергопотребления и повышенная нагрузка на подстанцию.'
        ],
        aboveAction: 'Проверить тепловые потери и герметичность печи, оптимизировать вспенивание шлака и подготовить плавку к выпуску.'
      },
      oxygen: {
        key: 'oxygen',
        title: 'Расход кислорода (O₂)',
        unit: 'м³/ч',
        normalRange: '1800–3900 м³/ч',
        criticalThreshold: '> 4300 м³/ч',
        description: 'Контролирует подачу технического кислорода через сводовую и стеновые фурмы для интенсификации плавления, обезуглероживания ванны, вспенивания шлака и дожигания CO.',
        belowTitle: 'Если ниже нормы (< 1800 м³/ч)',
        belowEffects: [
          'Замедление окисления углерода и фосфора, затягивание периода доводки стали.',
          'Слабое вспенивание шлака — открытая дуга начинает напрямую облучать и разрушать стены и свод печи.',
          'Снижение доли химического тепла и компенсационный рост расхода электроэнергии.'
        ],
        belowAction: 'Проверить давление в кислородной магистрали, состояние сопел фурмы и положение регулирующего клапана.',
        aboveTitle: 'Если выше нормы (> 3900 м³/ч / критич. > 4300 м³/ч)',
        aboveEffects: [
          'Переокисленность жидкой стали и шлака (рост FeO), повышенный угар железа и расход раскислителей.',
          'Бурное вскипание ванны с риском выбросов шлака и металла через рабочее окно.',
          'Локальный перегрев футеровки и панелей свода из-за избыточного химического тепловыделения.'
        ],
        aboveAction: 'Прикрыть регулирующий клапан подачи O₂ на сводовую фурму и стабилизировать шлаковый режим.'
      }
    };

    this.furnaces = {
      1: this._createFurnace({
        id: 1,
        name: 'ДСП-1',
        fullName: 'ДСП-135 №1',
        steelGrade: 'Ст3сп',
        meltNumber: '261148',
        stage: 'Плавление',
        controller: 'Siemens SIMATIC S7-1518F',
        protocol: 'OPC UA · DB_EAF1',
        baseTemp: 1588,
        baseCurrent: 51.4,
        basePressure: 44,
        baseEnergy: 48.25,
        baseOxygen: 2450,
        basePowerMw: 42.5
      }),
      2: this._createFurnace({
        id: 2,
        name: 'ДСП-2',
        fullName: 'ДСП-135 №2',
        steelGrade: '09Г2С',
        meltNumber: '261149',
        stage: 'Доводка',
        controller: 'Schneider Modicon M580',
        protocol: 'Modbus TCP · UnitID=2',
        baseTemp: 1618,
        baseCurrent: 47.8,
        basePressure: 48,
        baseEnergy: 56.80,
        baseOxygen: 3420,
        basePowerMw: 38.2
      }),
      3: this._createFurnace({
        id: 3,
        name: 'ДСП-3',
        fullName: 'ДСП-135 №3',
        steelGrade: 'К70 (Металлокорд)',
        meltNumber: '261150',
        stage: 'Плавление',
        controller: 'Siemens SIMATIC S7-1516',
        protocol: 'OPC UA · DB_EAF3',
        baseTemp: 1572,
        baseCurrent: 53.6,
        basePressure: 41,
        baseEnergy: 41.15,
        baseOxygen: 2180,
        basePowerMw: 44.0
      })
    };
  }

  _createFurnace(config) {
    const history = [];
    const now = new Date();
    for (let i = 19; i >= 0; i--) {
      const pointTime = new Date(now.getTime() - i * 2000);
      const wave = Math.sin(i * 0.45 + config.id) * 4.5;
      history.push({
        time: pointTime.toTimeString().split(' ')[0],
        temperature: Math.round(config.baseTemp + wave)
      });
    }

    const furnace = {
      ...config,
      temperature: config.baseTemp,
      current: config.baseCurrent,
      pressure: config.basePressure,
      energy: config.baseEnergy,
      oxygen: config.baseOxygen,
      powerMw: config.basePowerMw,
      waterFlow: 76.4,
      heatRate: '+14.2 °C/мин',
      isEmergency: false,
      isCooling: false,
      emergencyCode: null,
      overheatLogged: false,
      activeIncidentId: null,
      status: 'normal',
      sensorStatuses: {
        temperature: 'normal',
        current: 'normal',
        pressure: 'normal',
        energy: 'normal',
        oxygen: 'normal'
      },
      heatBalance: {
        arcHeatMw: 32.3,
        chemHeatMw: 5.1,
        lossMw: 8.4,
        arcShare: 86,
        chemShare: 14
      },
      history
    };

    this.evaluateThresholds(furnace);
    this.updateHeatBalance(furnace);
    return furnace;
  }

  getActiveFurnace() {
    return this.furnaces[this.activeFurnaceId];
  }

  getSensorInfo(sensorKey) {
    return this.sensorCatalog[sensorKey] || null;
  }

  setActiveFurnace(furnaceId) {
    const id = Number(furnaceId);
    if (this.furnaces[id]) {
      this.activeFurnaceId = id;
    }
    return this.getActiveFurnace();
  }

  /**
   * Шаг расчёта физики плавки (вызывается каждую секунду в режиме 24/7)
   */
  tickPhysics(onOverheatDetected, onCoolingCompleted, onPeakTempUpdated) {
    this.tickCounter += 1;
    const timestamp = new Date().toTimeString().split(' ')[0];

    Object.values(this.furnaces).forEach(furnace => {
      const phaseOffset = this.tickCounter * 0.35 + furnace.id * 1.7;

      if (furnace.isEmergency) {
        const code = furnace.emergencyCode || 'АВ-01';
        if (code === 'АВ-01') {
          const tempJump = 12 + Math.random() * 8;
          furnace.temperature = Math.min(this.thresholds.temperature.max, Math.round(furnace.temperature + tempJump));
          furnace.powerMw = Math.min(54.0, +(furnace.powerMw + 1.5).toFixed(1));
          furnace.current = Math.min(71.5, +(64.2 + Math.sin(phaseOffset) * 2.4 + Math.random() * 1.8).toFixed(1));
          furnace.pressure = Math.min(82, Math.round(68 + Math.sin(phaseOffset) * 4 + Math.random() * 4));
          furnace.oxygen = Math.min(4850, Math.round(4420 + Math.sin(phaseOffset) * 140));
          furnace.waterFlow = +(41.2 + Math.random() * 1.6).toFixed(1);
          furnace.heatRate = '+38.6 °C/мин (КРИТИЧ.)';
        } else if (code === 'АВ-02') {
          const tempDrop = 4 + Math.random() * 4;
          furnace.temperature = Math.max(1492, Math.round(furnace.temperature - tempDrop));
          furnace.powerMw = Math.max(22.0, +(furnace.powerMw - 1.2).toFixed(1));
          furnace.current = +(30.5 + Math.sin(phaseOffset) * 1.2).toFixed(1);
          furnace.pressure = Math.round(38 + Math.sin(phaseOffset) * 2);
          furnace.oxygen = Math.round(1750 + Math.sin(phaseOffset) * 80);
          furnace.waterFlow = +(74.5 + Math.sin(phaseOffset) * 1.2).toFixed(1);
          furnace.heatRate = '-24.5 °C/мин (ОСТЫВАНИЕ)';
        } else if (code === 'АВ-03') {
          furnace.current = Math.min(73.8, +(67.5 + Math.sin(phaseOffset) * 2.2 + Math.random() * 2.0).toFixed(1));
          furnace.powerMw = Math.min(54.5, +(51.8 + Math.sin(phaseOffset) * 1.4).toFixed(1));
          furnace.temperature = Math.min(1642, Math.round(furnace.temperature + 1));
          furnace.pressure = Math.round(50 + Math.sin(phaseOffset) * 3);
          furnace.heatRate = '+19.4 °C/мин (КЗ ШИХТЫ)';
        } else if (code === 'АВ-04') {
          furnace.current = Math.max(18.5, +(26.4 + Math.sin(phaseOffset) * 2.8 - Math.random() * 1.5).toFixed(1));
          furnace.powerMw = Math.max(16.0, +(19.2 + Math.sin(phaseOffset) * 1.6).toFixed(1));
          furnace.temperature = Math.max(1548, Math.round(furnace.temperature - 1));
          furnace.heatRate = '-9.2 °C/мин (ОБРЫВ ДУГИ)';
        } else if (code === 'АВ-05') {
          furnace.pressure = Math.min(83, Math.round(72 + Math.sin(phaseOffset) * 3.5 + Math.random() * 3.5));
          furnace.oxygen = Math.round(3720 + Math.sin(phaseOffset) * 110);
          furnace.heatRate = '+16.2 °C/мин (ГАЗОВАНИЕ)';
        } else if (code === 'АВ-06') {
          furnace.pressure = Math.max(10, Math.round(17 + Math.sin(phaseOffset) * 2.5 - Math.random() * 2));
          furnace.temperature = Math.max(1545, Math.round(furnace.temperature - 1));
          furnace.heatRate = '-6.8 °C/мин (ПОДСОС)';
        } else if (code === 'АВ-07') {
          furnace.energy = Math.min(93.5, +(furnace.energy + 0.35).toFixed(2));
          furnace.powerMw = +(47.2 + Math.sin(phaseOffset) * 1.2).toFixed(1);
          furnace.current = +(56.4 + Math.sin(phaseOffset) * 1.1).toFixed(1);
          furnace.heatRate = '+12.5 °C/мин (ПЕРЕРАСХОД)';
        } else if (code === 'АВ-08') {
          furnace.oxygen = Math.max(480, Math.round(720 + Math.sin(phaseOffset) * 75 - Math.random() * 40));
          furnace.pressure = Math.round(37 + Math.sin(phaseOffset) * 2);
          furnace.heatRate = '+5.1 °C/мин (ДЕФИЦИТ O₂)';
        } else if (code === 'АВ-09') {
          furnace.oxygen = Math.min(4920, Math.round(4560 + Math.sin(phaseOffset) * 140 + Math.random() * 90));
          furnace.pressure = Math.min(64, Math.round(59 + Math.sin(phaseOffset) * 2.5));
          furnace.temperature = Math.min(1644, Math.round(furnace.temperature + 1));
          furnace.heatRate = '+22.8 °C/мин (ИЗБЫТОК O₂)';
        }

        if (onPeakTempUpdated) onPeakTempUpdated(furnace);
      } else if (furnace.isCooling) {
        const basePower = furnace.id === 1 ? 42.5 : (furnace.id === 2 ? 38.2 : 44.0);
        const basePress = furnace.id === 2 ? 48 : 43;
        const baseO2 = furnace.stage === 'Доводка' ? 3420 : 2320;
        const moveToward = (val, target, step) => {
          if (Math.abs(val - target) <= step) return target;
          return val < target ? val + step : val - step;
        };

        furnace.temperature = Math.round(moveToward(furnace.temperature, furnace.baseTemp, 15));
        furnace.powerMw = +(moveToward(furnace.powerMw, basePower, 3.2)).toFixed(1);
        furnace.current = +(moveToward(furnace.current, basePower * 1.2, 4.5)).toFixed(1);
        furnace.pressure = Math.round(moveToward(furnace.pressure, basePress, 6));
        furnace.oxygen = Math.round(moveToward(furnace.oxygen, baseO2, 420));
        if (furnace.energy > 68) {
          furnace.energy = +(moveToward(furnace.energy, furnace.baseEnergy, 6.5)).toFixed(2);
        }
        furnace.waterFlow = +(112.5 + Math.sin(phaseOffset) * 2.0).toFixed(1);
        furnace.heatRate = 'СТАБИЛИЗАЦИЯ РЕЖИМА';

        const tempOk = Math.abs(furnace.temperature - furnace.baseTemp) <= 6;
        const currOk = furnace.current >= 40 && furnace.current <= 58;
        const pressOk = furnace.pressure >= 35 && furnace.pressure <= 56;
        const o2Ok = furnace.oxygen >= 1800 && furnace.oxygen <= 3900;
        const energyOk = furnace.energy <= 72;

        if (tempOk && currOk && pressOk && o2Ok && energyOk) {
          furnace.isCooling = false;
          furnace.emergencyCode = null;
          furnace.overheatLogged = false;
          furnace.powerMw = basePower;
          if (onCoolingCompleted) onCoolingCompleted(furnace);
        }
      } else {
        const tempDrift = Math.sin(phaseOffset) * 3.8 + (Math.random() - 0.48) * 2.5;
        furnace.temperature = Math.round(
          Math.max(1545, Math.min(1628, furnace.baseTemp + tempDrift))
        );

        const basePower = furnace.id === 1 ? 42.5 : (furnace.id === 2 ? 38.2 : 44.0);
        furnace.powerMw = +(basePower + Math.sin(phaseOffset * 0.8) * 1.1).toFixed(1);
        furnace.current = +(furnace.powerMw * 1.21 + Math.cos(phaseOffset) * 1.2).toFixed(1);

        const basePress = furnace.id === 2 ? 48 : 43;
        furnace.pressure = Math.round(basePress + Math.sin(phaseOffset * 1.1) * 3.2);

        const baseO2 = furnace.stage === 'Доводка' ? 3420 : 2320;
        furnace.oxygen = Math.round(baseO2 + Math.sin(phaseOffset * 0.9) * 145);
        furnace.waterFlow = +(75.8 + Math.sin(phaseOffset * 0.6) * 1.8).toFixed(1);
        furnace.heatRate = furnace.stage === 'Доводка' ? '+4.6 °C/мин' : '+14.8 °C/мин';
      }

      furnace.energy = +(furnace.energy + furnace.powerMw / 3600).toFixed(2);
      this.updateHeatBalance(furnace);
      this.evaluateThresholds(furnace);

      if (furnace.temperature > this.thresholds.temperature.critical && !furnace.overheatLogged) {
        furnace.overheatLogged = true;
        if (onOverheatDetected) onOverheatDetected(furnace);
      }

      furnace.history.push({
        time: timestamp,
        temperature: furnace.temperature
      });
      if (furnace.history.length > 20) {
        furnace.history.shift();
      }
    });
  }

  setEmergencyState(furnace, code = 'АВ-01') {
    furnace.isEmergency = true;
    furnace.isCooling = false;
    furnace.emergencyCode = code;
    furnace.overheatLogged = true;

    if (code === 'АВ-01') {
      furnace.temperature = Math.max(furnace.temperature, 1664);
      furnace.current = 66.4;
      furnace.pressure = 71;
      furnace.oxygen = 4520;
      furnace.waterFlow = 41.5;
    } else if (code === 'АВ-02') {
      furnace.temperature = 1516;
      furnace.powerMw = 24.5;
      furnace.current = 31.2;
      furnace.heatRate = '-24.5 °C/мин (ОСТЫВАНИЕ)';
    } else if (code === 'АВ-03') {
      furnace.current = 67.8;
      furnace.powerMw = 52.4;
    } else if (code === 'АВ-04') {
      furnace.current = 26.8;
      furnace.powerMw = 19.5;
    } else if (code === 'АВ-05') {
      furnace.pressure = 72;
    } else if (code === 'АВ-06') {
      furnace.pressure = 18;
    } else if (code === 'АВ-07') {
      furnace.energy = 85.4;
    } else if (code === 'АВ-08') {
      furnace.oxygen = 740;
    } else if (code === 'АВ-09') {
      furnace.oxygen = 4560;
      furnace.pressure = 60;
    }

    this.evaluateThresholds(furnace);
    this.updateHeatBalance(furnace);
  }

  setCoolingState(furnace) {
    furnace.isEmergency = false;
    furnace.isCooling = true;
  }

  updateHeatBalance(furnace) {
    const arcHeatMw = +(furnace.powerMw * 0.76).toFixed(1);
    const chemHeatMw = +(furnace.oxygen * 0.0021).toFixed(1);
    const lossMw = +(6.2 + (furnace.temperature > 1600 ? 2.4 : 1.5)).toFixed(1);
    const totalHeat = Math.max(1, arcHeatMw + chemHeatMw);
    const arcShare = Math.round((arcHeatMw / totalHeat) * 100);

    furnace.heatBalance = {
      arcHeatMw,
      chemHeatMw,
      lossMw,
      arcShare,
      chemShare: 100 - arcShare
    };
  }

  evaluateThresholds(furnace) {
    const t = this.thresholds;
    const check = (val, rule) => {
      if (val > rule.critical || (rule.criticalLow !== null && val < rule.criticalLow)) return 'danger';
      if (val > rule.normalMax || (rule.normalMin !== null && val < rule.normalMin)) return 'warning';
      return 'normal';
    };

    furnace.sensorStatuses = {
      temperature: check(furnace.temperature, t.temperature),
      current:     check(furnace.current, t.current),
      pressure:    check(furnace.pressure, t.pressure),
      energy:      check(furnace.energy, t.energy),
      oxygen:      check(furnace.oxygen, t.oxygen)
    };

    const statuses = Object.values(furnace.sensorStatuses);
    if (statuses.includes('danger') || furnace.isEmergency) {
      furnace.status = 'danger';
    } else if (statuses.includes('warning') || furnace.isCooling) {
      furnace.status = 'warning';
    } else {
      furnace.status = 'normal';
    }
  }
}
