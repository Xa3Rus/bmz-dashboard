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

    // Технологические уставки и критические пороги ЭСПЦ-2 ОАО «БМЗ»
    this.thresholds = {
      temperature: { min: 1500, normalMax: 1630, critical: 1650, max: 1720 },
      current:     { min: 30,   normalMax: 58,   critical: 63,   max: 75 },
      pressure:    { min: 20,   normalMax: 56,   critical: 65,   max: 85 },
      energy:      { min: 0,    normalMax: 72,   critical: 82,   max: 95 },
      oxygen:      { min: 500,  normalMax: 3900, critical: 4300, max: 5000 }
    };

    this.furnaces = {
      1: this._createFurnace({
        id: 1,
        name: 'ДСП-1',
        fullName: 'ДСП-135 №1 (ЭСПЦ-2)',
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
        fullName: 'ДСП-135 №2 (ЭСПЦ-2)',
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
        fullName: 'ДСП-135 №3 (ЭСПЦ-2)',
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
        const tempJump = 14 + Math.random() * 9;
        furnace.temperature = Math.min(
          this.thresholds.temperature.max,
          Math.round(furnace.temperature + tempJump)
        );
        furnace.powerMw = Math.min(54.0, +(furnace.powerMw + 1.8).toFixed(1));
        furnace.current = Math.min(71.5, +(64.2 + Math.sin(phaseOffset) * 2.4 + Math.random() * 1.8).toFixed(1));
        furnace.pressure = Math.min(82, Math.round(68 + Math.sin(phaseOffset) * 4 + Math.random() * 4));
        furnace.oxygen = Math.min(4850, Math.round(4420 + Math.sin(phaseOffset) * 140));
        furnace.waterFlow = +(41.2 + Math.random() * 1.6).toFixed(1);
        furnace.heatRate = '+38.6 °C/мин (КРИТИЧ.)';

        if (onPeakTempUpdated) onPeakTempUpdated(furnace);
      } else if (furnace.isCooling) {
        const coolStep = 16 + Math.random() * 7;
        furnace.temperature = Math.max(
          furnace.baseTemp,
          Math.round(furnace.temperature - coolStep)
        );
        furnace.powerMw = Math.max(32.0, +(furnace.powerMw - 2.2).toFixed(1));
        furnace.current = +(furnace.powerMw * 1.18 + Math.sin(phaseOffset) * 0.8).toFixed(1);
        furnace.pressure = Math.max(furnace.id === 2 ? 46 : 42, Math.round(furnace.pressure - 4));
        furnace.oxygen = Math.max(2100, Math.round(furnace.oxygen - 280));
        furnace.waterFlow = +(112.5 + Math.sin(phaseOffset) * 2.0).toFixed(1);
        furnace.heatRate = '-29.4 °C/мин (ОХЛАЖДЕНИЕ)';

        if (furnace.temperature <= furnace.baseTemp + 4) {
          furnace.isCooling = false;
          furnace.overheatLogged = false;
          furnace.powerMw = furnace.id === 1 ? 42.5 : (furnace.id === 2 ? 38.2 : 44.0);
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

  setEmergencyState(furnace) {
    furnace.isEmergency = true;
    furnace.isCooling = false;
    furnace.overheatLogged = true;
    furnace.temperature = Math.max(furnace.temperature, 1664);
    furnace.current = 66.4;
    furnace.pressure = 71;
    furnace.oxygen = 4520;
    furnace.waterFlow = 41.5;

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
    const check = (val, rule) => val > rule.critical ? 'danger' : (val > rule.normalMax ? 'warning' : 'normal');

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
