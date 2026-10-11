// Промышленный коннектор АСУ ТП ЭСПЦ-2 (Уровень 1 / Уровень 2)
// Поддержка режимов: Симуляция (Модель), Гибридный (ПЛК + Модель), Внешний ПЛК (OPC UA / Modbus TCP / MQTT / HTTP Gateway)
// Включает встроенный локальный HTTP REST-шлюз приёма телеметрии (порт 4580) и TCP-диагностику узлов ПЛК

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

class PlcConnector {
  constructor() {
    this.configFile = null;
    this.onTelemetryCallback = null;
    this.httpServer = null;
    this.gatewayPort = 4580;
    this.gatewayRunning = false;
    this.virtualPlcTimer = null;
    this.virtualPlcActive = false;

    this.mode = 'hybrid'; // 'simulation' | 'hybrid' | 'external'
    this.totalRxPackets = 0;
    this.packetLog = []; // Последние 60 кадров обмена

    // Конфигурация промышленных контроллеров печей цеха (количество печей не ограничено)
    // По умолчанию при запуске ни одна печь не подключена к мониторингу до ручного подключения в Центре ПЛК
    this.furnaces = {
      1: {
        furnace_no: 1,
        name: 'ДСП-135 №1',
        steel_grade: 'Ст3сп',
        enabled: true,
        connected: false,
        connected_at: null,
        protocol: 'OPC UA',
        controller: 'Siemens SIMATIC S7-1518F',
        host: '127.0.0.1',
        port: 4580,
        endpoint: 'ns=3;s="DB_EAF1_Telemetry"',
        poll_ms: 1000,
        read_only: true,
        status: 'OFFLINE',
        ping_ms: null,
        rx_count: 0,
        last_rx_at: null,
        last_payload: null
      },
      2: {
        furnace_no: 2,
        name: 'ДСП-135 №2',
        steel_grade: '09Г2С',
        enabled: true,
        connected: false,
        connected_at: null,
        protocol: 'Modbus TCP',
        controller: 'Schneider Modicon M580',
        host: '127.0.0.1',
        port: 4580,
        endpoint: 'UnitID=2 · Holding Reg 40001–40024',
        poll_ms: 1000,
        read_only: true,
        status: 'OFFLINE',
        ping_ms: null,
        rx_count: 0,
        last_rx_at: null,
        last_payload: null
      },
      3: {
        furnace_no: 3,
        name: 'ДСП-135 №3',
        steel_grade: '40Х',
        enabled: true,
        connected: false,
        connected_at: null,
        protocol: 'OPC UA',
        controller: 'Siemens SIMATIC S7-1516',
        host: '127.0.0.1',
        port: 4580,
        endpoint: 'ns=3;s="DB_EAF3_Telemetry"',
        poll_ms: 1000,
        read_only: true,
        status: 'OFFLINE',
        ping_ms: null,
        rx_count: 0,
        last_rx_at: null,
        last_payload: null
      },
      4: {
        furnace_no: 4,
        name: 'ДСП-135 №4',
        steel_grade: '65Г',
        enabled: true,
        connected: false,
        connected_at: null,
        protocol: 'MQTT / HTTP',
        controller: 'Шлюз АСУ ТП Уровня 2 (БМЗ ЭСПЦ-2)',
        host: '127.0.0.1',
        port: 4580,
        endpoint: 'bmz/espc2/dsp4/telemetry',
        poll_ms: 1000,
        read_only: true,
        status: 'OFFLINE',
        ping_ms: null,
        rx_count: 0,
        last_rx_at: null,
        last_payload: null
      }
    };
  }

  getFurnaceNumbers() {
    return Object.keys(this.furnaces)
      .map(Number)
      .filter(n => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b);
  }

  init(configPath, onTelemetry) {
    this.configFile = configPath;
    this.onTelemetryCallback = onTelemetry;
    this.loadConfig();
    this.startHttpGateway();
  }

  loadConfig() {
    if (!this.configFile || !fs.existsSync(this.configFile)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
      if (raw.mode) this.mode = raw.mode;
      if (raw.gatewayPort) this.gatewayPort = Number(raw.gatewayPort) || 4580;
      if (raw.furnaces && typeof raw.furnaces === 'object') {
        const loaded = {};
        for (const key of Object.keys(raw.furnaces)) {
          const k = Number(key);
          if (!Number.isInteger(k) || k <= 0) continue;
          const saved = raw.furnaces[key];
          const base = this.furnaces[k] || {};
          loaded[k] = {
            furnace_no: k,
            name: saved.name || base.name || `ДСП-135 №${k}`,
            steel_grade: saved.steel_grade || base.steel_grade || 'Ст3сп',
            enabled: saved.enabled !== undefined ? Boolean(saved.enabled) : true,
            protocol: saved.protocol || base.protocol || 'OPC UA',
            controller: saved.controller || base.controller || `Контроллер ПЛК ДСП №${k}`,
            host: saved.host || base.host || '127.0.0.1',
            port: Number(saved.port) || base.port || 4580,
            endpoint: saved.endpoint || base.endpoint || `ns=3;s="DB_EAF${k}_Telemetry"`,
            poll_ms: Number(saved.poll_ms) || 1000,
            read_only: true,
            // На старте сессии печи всегда отключены до явного подключения оператором
            connected: false,
            connected_at: null,
            status: 'OFFLINE',
            ping_ms: null,
            rx_count: 0,
            last_rx_at: null,
            last_payload: null
          };
        }
        if (Object.keys(loaded).length > 0) {
          this.furnaces = loaded;
        }
      }
    } catch (err) {
      this.appendLog('SYS', 0, 'WARN', `Ошибка чтения конфигурации ПЛК: ${err.message}`);
    }
  }

  saveConfig() {
    if (!this.configFile) return;
    try {
      const serializable = {
        mode: this.mode,
        gatewayPort: this.gatewayPort,
        furnaces: {}
      };
      for (const k of this.getFurnaceNumbers()) {
        const f = this.furnaces[k];
        serializable.furnaces[k] = {
          furnace_no: k,
          name: f.name || `ДСП-135 №${k}`,
          steel_grade: f.steel_grade || 'Ст3сп',
          enabled: f.enabled,
          protocol: f.protocol,
          controller: f.controller,
          host: f.host,
          port: f.port,
          endpoint: f.endpoint,
          poll_ms: f.poll_ms,
          read_only: true
        };
      }
      fs.writeFileSync(this.configFile, JSON.stringify(serializable, null, 2), 'utf-8');
    } catch (err) {
      this.appendLog('SYS', 0, 'WARN', `Не удалось сохранить конфигурацию: ${err.message}`);
    }
  }

  appendLog(protocol, furnaceNo, dir, summary, payload = null) {
    const entry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      ts: new Date().toISOString(),
      protocol,
      furnace_no: furnaceNo,
      dir,
      summary,
      payload
    };
    this.packetLog.unshift(entry);
    if (this.packetLog.length > 60) {
      this.packetLog.length = 60;
    }
    return entry;
  }

  startHttpGateway() {
    if (this.httpServer) return;

    this.httpServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'GET' && (req.url === '/api/v1/status' || req.url === '/status')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(this.getStatus()));
        return;
      }

      if (req.method === 'POST' && (req.url === '/api/v1/telemetry' || req.url === '/telemetry')) {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
          if (body.length > 65536) req.destroy();
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const result = this.ingestTelemetryPacket(data, req.socket.remoteAddress || '127.0.0.1');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, result }));
          } catch (err) {
            this.appendLog('HTTP', 0, 'ERR', `Некорректный JSON-пакет: ${err.message}`);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        message: 'Шлюз АСУ ТП ДСП-135: используйте POST /api/v1/telemetry или GET /api/v1/status'
      }));
    });

    this.httpServer.on('error', err => {
      this.gatewayRunning = false;
      this.appendLog('GATEWAY', 0, 'ERR', `Ошибка запуска HTTP-шлюза (порт ${this.gatewayPort}): ${err.message}`);
    });

    this.httpServer.listen(this.gatewayPort, '127.0.0.1', () => {
      this.gatewayRunning = true;
      this.appendLog('GATEWAY', 0, 'INFO', `Приёмный шлюз телеметрии АСУ ТП запущен на http://127.0.0.1:${this.gatewayPort}/api/v1/telemetry (READ-ONLY DMZ)`);
    });
  }

  ingestTelemetryPacket(packet, sourceIp = '127.0.0.1') {
    const fNo = Number(packet.furnace_no || packet.furnace || 1);
    const fCfg = this.furnaces[fNo];
    if (!fCfg) {
      throw new Error(`Печь ДСП №${fNo} не зарегистрирована в конфигурации цеха`);
    }

    if (!fCfg.connected) {
      this.appendLog(
        packet.source || fCfg.protocol,
        fNo,
        'WARN',
        `Пакет для ${fCfg.name || 'ДСП №' + fNo} отклонён: агрегат не подключён в Центре подключения ПЛК`
      );
      return { ok: false, furnace_no: fNo, error: `${fCfg.name || 'ДСП-135 №' + fNo} не подключена к мониторингу` };
    }

    const nowIso = new Date().toISOString();

    const normalized = {
      furnace_no: fNo,
      temp_c: packet.temp_c !== undefined ? Math.round(Number(packet.temp_c)) : undefined,
      power_mw: packet.power_mw !== undefined ? Math.round(Number(packet.power_mw) * 10) / 10 : undefined,
      t_min: packet.t_min !== undefined ? Math.round(Number(packet.t_min) * 10) / 10 : undefined,
      stage: packet.stage || undefined,
      steel_grade: packet.steel_grade || undefined,
      operator: packet.operator || undefined,
      o2_nm3: packet.o2_nm3 !== undefined ? Math.round(Number(packet.o2_nm3)) : undefined,
      electrode_pos: packet.electrode_pos !== undefined ? Number(packet.electrode_pos) : undefined,
      alert: packet.alert || undefined,
      source: packet.source || fCfg.protocol,
      received_at: nowIso
    };

    fCfg.rx_count += 1;
    fCfg.last_rx_at = nowIso;
    fCfg.last_payload = normalized;
    fCfg.status = 'ONLINE';
    fCfg.ping_ms = packet.ping_ms || Math.max(1, Math.round(Math.random() * 4 + 1));
    this.totalRxPackets += 1;

    this.appendLog(
      normalized.source,
      fNo,
      'RX',
      `ДСП №${fNo} ← T=${normalized.temp_c ?? '—'}°C, P=${normalized.power_mw ?? '—'} МВт${normalized.stage ? ', ' + normalized.stage : ''} (${sourceIp})`,
      normalized
    );

    let dbUpdate = null;
    if (this.onTelemetryCallback) {
      dbUpdate = this.onTelemetryCallback(normalized);
    }
    return { ok: true, furnace_no: fNo, rx_count: fCfg.rx_count, received_at: nowIso, dbUpdate };
  }

  // Проверка реальной TCP-доступности контроллера / шлюза печи
  testConnection(furnaceNo) {
    const fNo = Number(furnaceNo) || 1;
    const fCfg = this.furnaces[fNo];
    if (!fCfg) return Promise.resolve({ ok: false, error: 'Неизвестный номер печи' });

    const start = Date.now();
    return new Promise(resolve => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (ok, msg) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        const elapsed = Date.now() - start;
        fCfg.ping_ms = ok ? elapsed : null;
        if (fCfg.connected) {
          fCfg.status = ok ? 'ONLINE' : 'STANDBY';
        }
        this.appendLog(
          fCfg.protocol,
          fNo,
          ok ? 'OK' : 'ERR',
          `Проверка канала ${fCfg.name || 'ДСП №' + fNo} (${fCfg.host}:${fCfg.port}): ${msg} [${elapsed} мс]`
        );
        resolve({
          ok,
          furnace_no: fNo,
          host: fCfg.host,
          port: fCfg.port,
          protocol: fCfg.protocol,
          ping_ms: ok ? elapsed : null,
          message: msg
        });
      };

      socket.setTimeout(2200);
      socket.once('connect', () => finish(true, `TCP-рукопожатие успешно (${fCfg.protocol} · READ-ONLY)`));
      socket.once('timeout', () => finish(false, 'Таймаут ожидания ответа от узла ПЛК (2200 мс)'));
      socket.once('error', err => finish(false, `Узел недоступен (${err.code || err.message})`));

      socket.connect(Number(fCfg.port) || 4580, fCfg.host || '127.0.0.1');
    });
  }

  // Ручное подключение / отключение печи с обязательной проверкой канала связи
  async setFurnaceConnection(furnaceNo, shouldConnect = true) {
    const fNo = Number(furnaceNo) || 1;
    const fCfg = this.furnaces[fNo];
    if (!fCfg) return { ok: false, error: 'Неизвестный номер печи' };

    if (!shouldConnect) {
      fCfg.connected = false;
      fCfg.connected_at = null;
      fCfg.status = 'OFFLINE';
      fCfg.ping_ms = null;
      this.appendLog('CFG', fNo, 'WARN', `${fCfg.name || 'ДСП-135 №' + fNo} (${fCfg.controller}) отключена от поста мониторинга АРМ`);
      return { ok: true, connected: false, furnace_no: fNo, status: this.getStatus() };
    }

    const testRes = await this.testConnection(fNo);
    if (!testRes.ok && this.mode === 'external') {
      fCfg.connected = false;
      fCfg.status = 'OFFLINE';
      return {
        ok: false,
        connected: false,
        furnace_no: fNo,
        error: testRes.message,
        status: this.getStatus()
      };
    }

    fCfg.connected = true;
    fCfg.connected_at = new Date().toISOString();
    fCfg.status = testRes.ok ? 'ONLINE' : 'STANDBY';
    this.appendLog(
      fCfg.protocol,
      fNo,
      'OK',
      testRes.ok
        ? `${fCfg.name || 'ДСП-135 №' + fNo} (${fCfg.controller}) подключена к посту мониторинга [${testRes.ping_ms} мс]`
        : `${fCfg.name || 'ДСП-135 №' + fNo} подключена к мониторингу (резервный контур модели — узел ${fCfg.host}:${fCfg.port} недоступен)`
    );

    return {
      ok: true,
      connected: true,
      furnace_no: fNo,
      ping_ms: testRes.ping_ms,
      status: this.getStatus()
    };
  }

  // Добавление новой печи (узла ПЛК) без ограничения по количеству печей на предприятии
  async addFurnace(params = {}) {
    const existingNums = this.getFurnaceNumbers();
    const maxNo = existingNums.length ? Math.max(...existingNums) : 0;
    let fNo = Number(params.furnace_no) || (maxNo + 1);
    if (!Number.isInteger(fNo) || fNo <= 0 || this.furnaces[fNo]) {
      fNo = maxNo + 1;
    }

    const protocol = params.protocol || 'OPC UA';
    const defaultEndpoint = protocol === 'Modbus TCP'
      ? `UnitID=${fNo} · Holding Reg 40001–40024`
      : protocol === 'MQTT / HTTP'
        ? `bmz/espc2/dsp${fNo}/telemetry`
        : `ns=3;s="DB_EAF${fNo}_Telemetry"`;

    const entry = {
      furnace_no: fNo,
      name: (params.name || `ДСП-135 №${fNo}`).trim(),
      steel_grade: params.steel_grade || 'Ст3сп',
      enabled: true,
      connected: false,
      connected_at: null,
      protocol,
      controller: (params.controller || `Siemens SIMATIC S7-1518F (Пост №${fNo})`).trim(),
      host: (params.host || '127.0.0.1').trim(),
      port: Number(params.port) || 4580,
      endpoint: (params.endpoint || defaultEndpoint).trim(),
      poll_ms: 1000,
      read_only: true,
      status: 'OFFLINE',
      ping_ms: null,
      rx_count: 0,
      last_rx_at: null,
      last_payload: null
    };

    this.furnaces[fNo] = entry;
    this.saveConfig();
    this.appendLog('CFG', fNo, 'INFO', `Зарегистрирован новый агрегат ${entry.name} (${entry.controller} · ${entry.protocol})`);

    if (params.autoConnect) {
      await this.setFurnaceConnection(fNo, true);
    }

    return { ok: true, furnace_no: fNo, furnace: this.furnaces[fNo], status: this.getStatus() };
  }

  // Удаление узла печи из конфигурации
  removeFurnace(furnaceNo) {
    const fNo = Number(furnaceNo);
    const fCfg = this.furnaces[fNo];
    if (!fCfg) {
      return { ok: false, error: 'Печь не найдена', status: this.getStatus() };
    }
    const name = fCfg.name || `ДСП-135 №${fNo}`;
    delete this.furnaces[fNo];
    this.saveConfig();
    this.appendLog('CFG', fNo, 'WARN', `Удалён узел агрегата ${name} из конфигурации цеха`);
    return { ok: true, removed_furnace_no: fNo, status: this.getStatus() };
  }

  // Встроенный эмулятор внешнего ПЛК-передатчика (отправляет реальные HTTP-пакеты только для подключённых печей)
  toggleVirtualPlcStream(enable, getActiveMeltsFn) {
    if (this.virtualPlcTimer) {
      clearInterval(this.virtualPlcTimer);
      this.virtualPlcTimer = null;
    }
    this.virtualPlcActive = Boolean(enable);

    if (!this.virtualPlcActive) {
      this.appendLog('PLC-SIM', 0, 'INFO', 'Внешний эмулятор ПЛК-пакетов остановлен');
      return { active: false };
    }

    this.appendLog('PLC-SIM', 0, 'INFO', `Запущена потоковая передача пакетов для подключённых печей в шлюз 127.0.0.1:${this.gatewayPort}`);

    const sendCycle = () => {
      const actives = typeof getActiveMeltsFn === 'function' ? getActiveMeltsFn() : [];
      for (const fNo of this.getFurnaceNumbers()) {
        const fCfg = this.furnaces[fNo];
        if (!fCfg || !fCfg.enabled || !fCfg.connected) continue;

        const m = actives.find(a => a.furnace_no === fNo) || { t_min: 15, temp_c: 1540, power_mw: 42.5, duration_min: 65 };
        const nextT = ((Number(m.t_min) || 0) + 0.55) % (m.duration_min || 65);

        let stage = 'Завалка';
        let baseTemp = 540;
        let basePower = 18.0;
        if (nextT >= 8 && nextT < 38) {
          stage = 'Плавление';
          baseTemp = 880 + ((nextT - 8) / 30) * 700;
          basePower = 43.5;
        } else if (nextT >= 38 && nextT < 58) {
          stage = 'Доводка';
          baseTemp = 1585 + ((nextT - 38) / 20) * 68;
          basePower = 24.0;
        } else if (nextT >= 58) {
          stage = 'Выпуск';
          baseTemp = 1630;
          basePower = 0.0;
        } else {
          baseTemp = 120 + (nextT / 8) * 700;
          basePower = 12.5;
        }

        const payload = JSON.stringify({
          furnace_no: fNo,
          t_min: Math.round(nextT * 10) / 10,
          temp_c: Math.round(baseTemp + (Math.random() * 14 - 7)),
          power_mw: Math.max(0, Math.round((basePower + (Math.random() * 2.2 - 1.1)) * 10) / 10),
          stage,
          source: fCfg.protocol
        });

        const req = http.request({
          hostname: '127.0.0.1',
          port: this.gatewayPort,
          path: '/api/v1/telemetry',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        });
        req.on('error', () => {});
        req.write(payload);
        req.end();
      }
    };

    sendCycle();
    this.virtualPlcTimer = setInterval(sendCycle, 1800);
    return { active: true };
  }

  updateConfig({ mode, furnaces }) {
    if (mode && ['simulation', 'hybrid', 'external'].includes(mode)) {
      this.mode = mode;
      this.appendLog('CFG', 0, 'INFO', `Режим источника данных переключён на: ${mode.toUpperCase()}`);
    }
    if (furnaces && typeof furnaces === 'object') {
      for (const k of this.getFurnaceNumbers()) {
        const item = furnaces[k] || furnaces[String(k)];
        if (item) {
          this.furnaces[k] = {
            ...this.furnaces[k],
            name: item.name ? item.name.trim() : this.furnaces[k].name,
            steel_grade: item.steel_grade || this.furnaces[k].steel_grade,
            enabled: item.enabled !== undefined ? Boolean(item.enabled) : this.furnaces[k].enabled,
            protocol: item.protocol || this.furnaces[k].protocol,
            controller: item.controller || this.furnaces[k].controller,
            host: (item.host || this.furnaces[k].host).trim(),
            port: Number(item.port) || this.furnaces[k].port,
            endpoint: (item.endpoint || this.furnaces[k].endpoint).trim(),
            poll_ms: Number(item.poll_ms) || 1000
          };
        }
      }
    }
    this.saveConfig();
    return this.getStatus();
  }

  isFurnaceLiveExternal(furnaceNo) {
    const f = this.furnaces[Number(furnaceNo)];
    if (!f || !f.connected || !f.last_rx_at) return false;
    const ageMs = Date.now() - new Date(f.last_rx_at).getTime();
    return ageMs <= 12000; // Считаем активным потоком ПЛК, если пакет был не старше 12 сек
  }

  getStatus() {
    const now = Date.now();
    const units = this.getFurnaceNumbers().map(k => {
      const f = this.furnaces[k];
      const isFresh = f.connected && f.last_rx_at && (now - new Date(f.last_rx_at).getTime() <= 12000);
      let effectiveSource = 'DISCONNECTED';
      if (f.connected) {
        if (this.mode === 'external') {
          effectiveSource = isFresh ? 'PLC_LIVE' : 'WAITING_PLC';
        } else if (this.mode === 'hybrid') {
          effectiveSource = isFresh ? 'PLC_LIVE' : 'MODEL';
        } else {
          effectiveSource = 'MODEL';
        }
      }
      return {
        ...f,
        is_fresh: Boolean(isFresh),
        effective_source: effectiveSource
      };
    });

    return {
      mode: this.mode,
      gatewayPort: this.gatewayPort,
      gatewayUrl: `http://127.0.0.1:${this.gatewayPort}/api/v1/telemetry`,
      gatewayRunning: this.gatewayRunning,
      virtualPlcActive: this.virtualPlcActive,
      totalRxPackets: this.totalRxPackets,
      connectedCount: units.filter(u => u.connected).length,
      totalFurnaces: units.length,
      furnaces: units,
      packetLog: this.packetLog.slice(0, 35)
    };
  }
}

module.exports = new PlcConnector();
