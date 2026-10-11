// Коннектор ПЛК и встроенный эмулятор для тренажёрной версии
const http = require('http');
const net = require('net');
const fs = require('fs');

const DEFAULT_GATEWAY_PORT = 4580;

const STAGE_CODE_MAP = {
  1: 'Завалка',
  2: 'Плавление',
  3: 'Доводка',
  4: 'Выпуск'
};

class PlcConnector {
  constructor() {
    this.configFile = null;
    this.onTelemetry = null;
    this.httpServer = null;
    this.virtualPlcTimer = null;

    this.mode = 'simulation';
    this.gatewayPort = DEFAULT_GATEWAY_PORT;
    this.gatewayRunning = false;
    this.totalRxPackets = 0;
    this.packetLog = [];

    this.furnaces = {
      1: {
        furnace_no: 1,
        name: 'ДСП-135 №1',
        steel_grade: 'Ст3сп',
        controller: 'Siemens SIMATIC S7-1518F (Тренажёр)',
        protocol: 'OPC UA',
        host: '127.0.0.1',
        port: 4580,
        endpoint: 'opc.tcp://127.0.0.1:4840 (ns=3;s="DB_EAF1")',
        poll_ms: 1000,
        connected: true,
        status: 'SIMULATION',
        last_rx_at: null,
        rx_count: 0,
        last_error: null,
        ping_ms: 1
      },
      2: {
        furnace_no: 2,
        name: 'ДСП-135 №2',
        steel_grade: '09Г2С',
        controller: 'Schneider Modicon M580 (Тренажёр)',
        protocol: 'Modbus TCP',
        host: '127.0.0.1',
        port: 4580,
        endpoint: 'UnitID=1 · Holding Reg 40001–40016',
        poll_ms: 1000,
        connected: true,
        status: 'SIMULATION',
        last_rx_at: null,
        rx_count: 0,
        last_error: null,
        ping_ms: 1
      },
      3: {
        furnace_no: 3,
        name: 'ДСП-135 №3',
        steel_grade: '40Х',
        controller: 'Siemens SIMATIC S7-1516 (Тренажёр)',
        protocol: 'OPC UA',
        host: '127.0.0.1',
        port: 4580,
        endpoint: 'opc.tcp://127.0.0.1:4840 (ns=3;s="DB_EAF3")',
        poll_ms: 1000,
        connected: true,
        status: 'SIMULATION',
        last_rx_at: null,
        rx_count: 0,
        last_error: null,
        ping_ms: 1
      },
      4: {
        furnace_no: 4,
        name: 'ДСП-135 №4',
        steel_grade: '65Г',
        controller: 'Шлюз АСУ ТП Уровня 2 (Тренажёр)',
        protocol: 'MQTT / HTTP',
        host: '127.0.0.1',
        port: 4580,
        endpoint: 'POST /api/v1/telemetry · bmz/esp2/eaf4',
        poll_ms: 1000,
        connected: true,
        status: 'SIMULATION',
        last_rx_at: null,
        rx_count: 0,
        last_error: null,
        ping_ms: 1
      }
    };
  }

  getFurnaceNumbers() {
    return Object.keys(this.furnaces)
      .map(Number)
      .filter(n => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b);
  }

  defaultEndpointForProtocol(proto, fNo, host, port) {
    if (proto === 'Modbus TCP') {
      return `UnitID=${fNo} · Holding Reg 40001–40016`;
    }
    if (proto === 'MQTT / HTTP') {
      return `POST /api/v1/telemetry · bmz/esp2/eaf${fNo}`;
    }
    if (proto === 'Siemens S7comm') {
      return `ISO-on-TCP ${host}:${port} · Rack 0 / Slot 1 (DB_EAF${fNo})`;
    }
    return `opc.tcp://${host}:${port} (ns=3;s="DB_EAF${fNo}")`;
  }

  init(configPath, onTelemetryCallback) {
    this.configFile = configPath;
    this.onTelemetry = onTelemetryCallback;
    this.loadConfig();
    this.startHttpGateway();
  }

  loadConfig() {
    if (!this.configFile || !fs.existsSync(this.configFile)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      if (raw.mode && ['simulation', 'hybrid', 'external'].includes(raw.mode)) {
        this.mode = raw.mode;
      }
      if (raw.gatewayPort) {
        this.gatewayPort = Number(raw.gatewayPort) || DEFAULT_GATEWAY_PORT;
      }
      if (raw.furnaces && typeof raw.furnaces === 'object') {
        const loadedFurnaces = {};
        for (const key of Object.keys(raw.furnaces)) {
          const fNo = Number(key);
          if (!Number.isInteger(fNo) || fNo < 1) continue;
          const saved = raw.furnaces[key];
          const base = this.furnaces[fNo] || {
            furnace_no: fNo,
            name: `ДСП-135 №${fNo}`,
            steel_grade: 'Ст3сп',
            controller: 'Siemens SIMATIC S7-1518F (Тренажёр)',
            protocol: 'OPC UA',
            host: '127.0.0.1',
            port: this.gatewayPort,
            endpoint: `opc.tcp://127.0.0.1:4840 (ns=3;s="DB_EAF${fNo}")`,
            poll_ms: 1000
          };
          const host = saved.host || base.host;
          const port = Number(saved.port) || base.port;
          const protocol = saved.protocol || base.protocol;
          loadedFurnaces[fNo] = {
            ...base,
            furnace_no: fNo,
            name: saved.name || base.name || `ДСП-135 №${fNo}`,
            steel_grade: saved.steel_grade || base.steel_grade || 'Ст3сп',
            controller: saved.controller || base.controller,
            protocol,
            host,
            port,
            endpoint: saved.endpoint || this.defaultEndpointForProtocol(protocol, fNo, host, port),
            poll_ms: Number(saved.poll_ms) || 1000,
            connected: saved.connected !== undefined ? Boolean(saved.connected) : true,
            status: 'SIMULATION',
            last_rx_at: null,
            rx_count: 0,
            last_error: null,
            ping_ms: 1
          };
        }
        if (Object.keys(loadedFurnaces).length > 0) {
          this.furnaces = loadedFurnaces;
        }
      }
    } catch (_) {
      // Используем настройки по умолчанию
    }
  }

  saveConfig() {
    if (!this.configFile) return;
    try {
      const data = {
        mode: this.mode,
        gatewayPort: this.gatewayPort,
        furnaces: {}
      };
      for (const fNo of this.getFurnaceNumbers()) {
        const f = this.furnaces[fNo];
        data.furnaces[fNo] = {
          furnace_no: f.furnace_no,
          name: f.name,
          steel_grade: f.steel_grade,
          controller: f.controller,
          protocol: f.protocol,
          host: f.host,
          port: f.port,
          endpoint: f.endpoint,
          poll_ms: f.poll_ms,
          connected: f.connected
        };
      }
      fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (_) {}
  }

  async addFurnace(params = {}) {
    const existingNums = this.getFurnaceNumbers();
    let fNo = Number(params.furnace_no);
    if (!Number.isInteger(fNo) || fNo < 1 || this.furnaces[fNo]) {
      fNo = 1;
      while (existingNums.includes(fNo)) fNo++;
    }

    const protocol = params.protocol || 'OPC UA';
    const host = (params.host || '127.0.0.1').trim();
    const port = Number(params.port) || this.gatewayPort;
    const name = (params.name || `ДСП-135 №${fNo}`).trim();
    const controller = (params.controller || 'Siemens SIMATIC S7-1518F (Тренажёр)').trim();
    const steel_grade = params.steel_grade || 'Ст3сп';
    const endpoint = (params.endpoint || '').trim() || this.defaultEndpointForProtocol(protocol, fNo, host, port);

    this.furnaces[fNo] = {
      furnace_no: fNo,
      name,
      steel_grade,
      controller,
      protocol,
      host,
      port,
      endpoint,
      poll_ms: 1000,
      connected: params.autoConnect !== false,
      status: 'SIMULATION',
      last_rx_at: null,
      rx_count: 0,
      last_error: null,
      ping_ms: 1
    };

    this.pushLog('OK', fNo, protocol, `Тренажёр: добавлен учебный агрегат ${name} (${controller})`);
    this.saveConfig();
    return { ok: true, furnace_no: fNo, status: this.getStatus() };
  }

  removeFurnace(furnaceNo) {
    const fNo = Number(furnaceNo);
    const nums = this.getFurnaceNumbers();
    if (!this.furnaces[fNo]) return { ok: false, error: 'Узел печи не найден' };
    if (nums.length <= 1) return { ok: false, error: 'В тренажёре должна оставаться минимум 1 печь' };
    const title = this.furnaces[fNo].name || `ДСП-135 №${fNo}`;
    delete this.furnaces[fNo];
    this.saveConfig();
    this.pushLog('INFO', fNo, 'SYSTEM', `${title} удалена из учебного стенда`);
    return { ok: true, removed: fNo, status: this.getStatus() };
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
          body += chunk.toString();
          if (body.length > 1e6) req.socket.destroy();
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            const packets = Array.isArray(payload) ? payload : [payload];
            const processed = [];
            for (const pkt of packets) {
              const r = this.ingestTelemetryPacket(pkt, req.socket.remoteAddress || '127.0.0.1');
              if (r) processed.push(r);
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, received: processed.length, packets: processed }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'Invalid JSON telemetry frame: ' + err.message }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Use POST /api/v1/telemetry or GET /api/v1/status' }));
    });

    this.httpServer.on('error', err => {
      this.gatewayRunning = false;
      this.pushLog('ERR', 0, 'HTTP-GW', `Порт ${this.gatewayPort} занят (${err.code})`);
    });

    this.httpServer.listen(this.gatewayPort, '127.0.0.1', () => {
      this.gatewayRunning = true;
      this.pushLog('INFO', 0, 'TRAINING-GW', `Учебный шлюз телеметрии активен: http://127.0.0.1:${this.gatewayPort}/api/v1/telemetry`);
    });
  }

  ingestTelemetryPacket(rawPacket, sourceIp = '127.0.0.1') {
    const fNo = Number(rawPacket.furnace_no || rawPacket.furnace || rawPacket.unit || 1);
    if (!this.furnaces[fNo]) return null;

    const unit = this.furnaces[fNo];
    if (!unit.connected) {
      this.pushLog('ERR', fNo, unit.protocol, `${unit.name || 'ДСП №' + fNo} отключена на учебном стенде`);
      return { ok: false, error: `Печь №${fNo} не подключена` };
    }

    const nowIso = new Date().toISOString();

    const temp_c = rawPacket.temp_c !== undefined
      ? Number(rawPacket.temp_c)
      : (rawPacket.reg_40001 !== undefined ? Number(rawPacket.reg_40001) : undefined);

    const power_mw = rawPacket.power_mw !== undefined
      ? Number(rawPacket.power_mw)
      : (rawPacket.reg_40003 !== undefined ? Number(rawPacket.reg_40003) / 10 : undefined);

    const t_min = rawPacket.t_min !== undefined
      ? Number(rawPacket.t_min)
      : (rawPacket.reg_40005 !== undefined ? Number(rawPacket.reg_40005) / 10 : undefined);

    let stage = rawPacket.stage;
    if (!stage && rawPacket.stage_code && STAGE_CODE_MAP[rawPacket.stage_code]) {
      stage = STAGE_CODE_MAP[rawPacket.stage_code];
    }

    const normalized = {
      furnace_no: fNo,
      temp_c: Number.isFinite(temp_c) ? Math.max(20, Math.min(1850, Math.round(temp_c))) : undefined,
      power_mw: Number.isFinite(power_mw) ? Math.max(0, Math.min(65, Math.round(power_mw * 10) / 10)) : undefined,
      t_min: Number.isFinite(t_min) ? Math.max(0, Math.min(75, Math.round(t_min * 10) / 10)) : undefined,
      stage: stage || undefined,
      steel_grade: rawPacket.steel_grade || undefined,
      operator: rawPacket.operator || undefined,
      alert: rawPacket.alert || undefined,
      protocol: rawPacket.protocol || unit.protocol,
      source_ip: sourceIp,
      timestamp: nowIso
    };

    unit.status = 'ONLINE';
    unit.last_rx_at = nowIso;
    unit.rx_count += 1;
    unit.last_error = null;
    unit.ping_ms = Math.max(1, Math.round(1 + Math.random() * 4));
    this.totalRxPackets += 1;

    const summary = `${unit.name || 'ДСП №' + fNo} <= T=${normalized.temp_c ?? '—'}°C, P=${normalized.power_mw ?? '—'}МВт, t=${normalized.t_min ?? '—'}мин${normalized.stage ? ' [' + normalized.stage + ']' : ''}`;
    this.pushLog('RX', fNo, normalized.protocol, summary);

    if (typeof this.onTelemetry === 'function') {
      this.onTelemetry(normalized);
    }

    return normalized;
  }

  pushLog(dir, furnace_no, protocol, summary) {
    this.packetLog.unshift({
      ts: new Date().toISOString(),
      dir,
      furnace_no,
      protocol,
      summary
    });
    if (this.packetLog.length > 40) {
      this.packetLog.length = 40;
    }
  }

  testConnection(furnaceNo) {
    const fNo = Number(furnaceNo) || 1;
    const unit = this.furnaces[fNo];
    if (!unit) return Promise.resolve({ ok: false, error: 'Неизвестный номер печи' });

    const start = Date.now();
    return new Promise(resolve => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (ok, errText = null) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        const rtt = Date.now() - start;
        if (ok) {
          unit.ping_ms = Math.max(1, rtt);
          unit.last_error = null;
          this.pushLog('OK', fNo, unit.protocol, `Тест канала ${unit.name} (${unit.host}:${unit.port}) — OK (${unit.ping_ms} мс)`);
          resolve({ ok: true, furnace_no: fNo, ping_ms: unit.ping_ms, endpoint: `${unit.host}:${unit.port}` });
        } else {
          unit.ping_ms = 1;
          this.pushLog('INFO', fNo, unit.protocol, `Тренажёр: перевод ${unit.name} на внутреннюю эмуляцию`);
          resolve({ ok: true, furnace_no: fNo, ping_ms: 1, endpoint: 'INTERNAL-SIMULATOR' });
        }
      };

      socket.setTimeout(1200);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false, 'Таймаут'));
      socket.once('error', err => finish(false, err.code || err.message));

      try {
        socket.connect(Number(unit.port) || 4580, unit.host || '127.0.0.1');
      } catch (e) {
        finish(false, e.message);
      }
    });
  }

  async setFurnaceConnection(furnaceNo, shouldConnect) {
    const fNo = Number(furnaceNo) || 1;
    const unit = this.furnaces[fNo];
    if (!unit) return { ok: false, error: 'Неизвестный номер печи' };

    if (!shouldConnect) {
      unit.connected = false;
      unit.status = 'DISCONNECTED';
      this.saveConfig();
      this.pushLog('INFO', fNo, unit.protocol, `${unit.name} отключена от учебного экрана`);
      return { ok: true, connected: false, furnace_no: fNo, status: this.getStatus() };
    }

    unit.connected = true;
    unit.status = 'SIMULATION';
    this.saveConfig();
    this.pushLog('OK', fNo, unit.protocol, `${unit.name} подключена к тренажёру`);
    return {
      ok: true,
      connected: true,
      furnace_no: fNo,
      ping_ms: 1,
      status: this.getStatus()
    };
  }

  toggleVirtualPlcStream(enable, getActiveMeltsFn) {
    if (!enable) {
      if (this.virtualPlcTimer) {
        clearInterval(this.virtualPlcTimer);
        this.virtualPlcTimer = null;
      }
      this.pushLog('INFO', 0, 'VIRT-PLC', 'Потоковый эмулятор ПЛК остановлен');
      return { running: false };
    }

    if (this.virtualPlcTimer) clearInterval(this.virtualPlcTimer);

    const stepStream = () => {
      const actives = typeof getActiveMeltsFn === 'function' ? getActiveMeltsFn() : [];
      const connectedNos = this.getFurnaceNumbers().filter(n => this.furnaces[n]?.connected);
      if (!connectedNos.length) return;

      for (const fNo of connectedNos) {
        const m = actives.find(a => a.furnace_no === fNo);
        const curT = m ? Number(m.t_min || 0) : 10;
        const nextT = Math.round((curT + 0.65) * 10) / 10;

        let baseTemp = 1520;
        let basePower = 42.5;
        let stCode = 2;
        if (nextT < 8) {
          stCode = 1;
          baseTemp = 25 + (nextT / 8) * 825;
          basePower = 12 + (nextT / 8) * 30;
        } else if (nextT < 38) {
          stCode = 2;
          baseTemp = 850 + ((nextT - 8) / 30) * 730;
          basePower = 43.5;
        } else if (nextT < 58) {
          stCode = 3;
          baseTemp = 1580 + ((nextT - 38) / 20) * 72;
          basePower = 24.0;
        } else {
          stCode = 4;
          baseTemp = 1640 - ((nextT - 58) / 7) * 20;
          basePower = 0.0;
        }

        const pkt = {
          furnace_no: fNo,
          t_min: nextT,
          temp_c: Math.round(baseTemp + (Math.random() * 14 - 7)),
          power_mw: Math.max(0, Math.round((basePower + (Math.random() * 2 - 1)) * 10) / 10),
          stage_code: stCode,
          protocol: this.furnaces[fNo].protocol
        };

        const body = JSON.stringify(pkt);
        const req = http.request({
          hostname: '127.0.0.1',
          port: this.gatewayPort,
          path: '/api/v1/telemetry',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        });
        req.on('error', () => {});
        req.write(body);
        req.end();
      }
    };

    stepStream();
    this.virtualPlcTimer = setInterval(stepStream, 1500);
    this.pushLog('INFO', 0, 'VIRT-PLC', 'Запущен потоковый эмулятор ПЛК по HTTP');
    return { running: true };
  }

  updateConfig(newCfg = {}) {
    if (newCfg.mode && ['simulation', 'hybrid', 'external'].includes(newCfg.mode)) {
      this.mode = newCfg.mode;
      this.pushLog('INFO', 0, 'MODE', `Режим тренажёра переключён на: ${this.mode.toUpperCase()}`);
    }
    if (newCfg.furnaces && typeof newCfg.furnaces === 'object') {
      for (const key of Object.keys(newCfg.furnaces)) {
        const fNo = Number(key);
        const src = newCfg.furnaces[key];
        if (!src || !this.furnaces[fNo]) continue;
        const f = this.furnaces[fNo];
        if (src.name) f.name = String(src.name).trim();
        if (src.steel_grade) f.steel_grade = String(src.steel_grade).trim();
        if (src.controller) f.controller = String(src.controller).trim();
        if (src.protocol) f.protocol = src.protocol;
        if (src.host) f.host = src.host.trim();
        if (src.port) f.port = Number(src.port) || 4580;
        if (src.endpoint) f.endpoint = src.endpoint.trim();
        if (src.poll_ms) f.poll_ms = Math.max(200, Number(src.poll_ms) || 1000);
      }
    }
    this.saveConfig();
    return this.getStatus();
  }

  isFurnaceLiveExternal(fNo) {
    const f = this.furnaces[fNo];
    if (!f || !f.connected || !f.last_rx_at) return false;
    return (Date.now() - new Date(f.last_rx_at).getTime()) < 8000;
  }

  getStatus() {
    const now = Date.now();
    const nums = this.getFurnaceNumbers();
    const units = nums.map(fNo => {
      const f = this.furnaces[fNo];
      const ageMs = f.last_rx_at ? (now - new Date(f.last_rx_at).getTime()) : null;
      const isLive = ageMs !== null && ageMs < 8000;
      let effectiveSource = 'DISCONNECTED';
      if (f.connected) {
        if (this.mode === 'external') {
          effectiveSource = isLive ? 'PLC_LIVE' : 'WAITING_PLC';
        } else if (this.mode === 'hybrid') {
          effectiveSource = isLive ? 'PLC_LIVE' : 'MODEL';
        } else {
          effectiveSource = 'MODEL';
        }
      }
      return {
        ...f,
        is_live: f.connected && isLive,
        effective_source: effectiveSource
      };
    });

    return {
      edition: 'training',
      mode: this.mode,
      gatewayPort: this.gatewayPort,
      gatewayRunning: this.gatewayRunning,
      gatewayUrl: `http://127.0.0.1:${this.gatewayPort}/api/v1/telemetry`,
      virtualPlcActive: Boolean(this.virtualPlcTimer),
      connectedCount: units.filter(u => u.connected).length,
      totalFurnaces: units.length,
      totalRxPackets: this.totalRxPackets,
      furnaces: units,
      packetLog: this.packetLog
    };
  }
}

module.exports = new PlcConnector();
