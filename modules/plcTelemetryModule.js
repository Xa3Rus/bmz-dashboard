/**
 * ============================================================================
 * МОДУЛЬ 4 (Подключается в main.js): modules/plcTelemetryModule.js
 * Назначение: Конфигурация ПЛК и теплофизических уставок печей ДСП-1, ДСП-2, ДСП-3
 * ============================================================================
 * Содержит паспортные параметры печей ЭСПЦ-2 ОАО «БМЗ» и уставки критических
 * порогов для круглосуточного фонового опроса (24/7).
 */

class PlcTelemetryModule {
  constructor() {
    this.thresholds = {
      temperature: { min: 1500, normalMax: 1630, critical: 1650, max: 1720 },
      current:     { min: 30,   normalMax: 58,   critical: 63,   max: 75 },
      pressure:    { min: 20,   normalMax: 56,   critical: 65,   max: 85 },
      energy:      { min: 0,    normalMax: 72,   critical: 82,   max: 95 },
      oxygen:      { min: 500,  normalMax: 3900, critical: 4300, max: 5000 }
    };

    this.furnaceConfigs = [
      {
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
      },
      {
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
      },
      {
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
      }
    ];
  }

  getPlcConfig() {
    return {
      thresholds: this.thresholds,
      furnaceConfigs: this.furnaceConfigs
    };
  }

  registerIpcHandlers(ipcMain) {
    ipcMain.handle('plc:config', () => this.getPlcConfig());
  }
}

module.exports = { PlcTelemetryModule };
