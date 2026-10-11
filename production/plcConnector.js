// Модуль подключения к ПЛК и приёма телеметрии по HTTP (:4580)
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

    this.gatewayPort = DEFAULT_GATEWAY_PORT;
    this.gatewayRunning = false;
    this.totalRxPackets = 0;
    this.packetLog = [];

    this.furnaces = {};
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
      if (raw.gatewayPort) {
        this.gatewayPort = Number(raw.gatewayPort) || DEFAULT_GATEWAY_PORT;
      }
      if (raw.furnaces && typeof raw.furnaces === 'object') {
        const loadedFurnaces = {};
        for (const key of Object.keys(raw.furnaces)) {
          const fNo = Number(key);
          if (!Number.isInteger(fNo) || fNo < 1) continue;
          const saved = raw.furnaces[key];
          const host = saved.host || `192.168.10.${10 + fNo}`;
          const port = Number(saved.port) || 4840;
          const protocol = saved.protocol || 'OPC UA';
          loadedFurnaces[fNo] = {
            furnace_no: fNo,
            name: saved.name || `ДСП-135 №${fNo}`,
            steel_grade: saved.steel_grade || 'Ст3сп',
            controller: saved.controller || 'Siemens SIMATIC S7-1518F-4 PN/DP',
            protocol,
            host,
            port,
            endpoint: saved.endpoint || this.defaultEndpointForProtocol(protocol, fNo, host, port),
            poll_ms: Number(saved.poll_ms) || 1000,
            connected: false,
            status: 'DISCONNECTED',
            last_rx_at: null,
            rx_count: 0,
            last_error: null,
            ping_ms: null
          };
        }
        this.furnaces = loadedFurnaces;
      }
    } catch (_) {
      // Используем пустой список при ошибке чтения
    }
  }

  saveConfig() {
    if (!this.configFile) return;
    try {
      const data = {
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
          poll_ms: f.poll_ms
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
    const host = (params.host || `192.168.10.${10 + fNo}`).trim();
    const port = Number(params.port) || 4840;
    const name = (params.name || `ДСП-135 №${fNo}`).trim();
    const controller = (params.controller || 'Siemens SIMATIC S7-1518F-4 PN/DP').trim();
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
      connected: false,
      status: 'DISCONNECTED',
      last_rx_at: null,
      rx_count: 0,
      last_error: null,
      ping_ms: null
    };

    this.pushLog('OK', fNo, protocol, `Зарегистрирован промышленный узел ${name} (${controller} · ${host}:${port})`);
    this.saveConfig();

    if (params.autoConnect) {
      const connRes = await this.setFurnaceConnection(fNo, true);
      return {
        ok: true,
        furnace_no: fNo,
        connected: Boolean(connRes.ok),
        connect_error: connRes.ok ? null : connRes.error,
        status: this.getStatus()
      };
    }

    return {
      ok: true,
      furnace_no: fNo,
      connected: false,
      status: this.getStatus()
    };
  }

  removeFurnace(furnaceNo) {
    const fNo = Number(furnaceNo);
    if (!this.furnaces[fNo]) return { ok: false, error: 'Узел печи не найден' };
    const title = this.furnaces[fNo].name || `ДСП-135 №${fNo}`;
    delete this.furnaces[fNo];
    this.saveConfig();
    this.pushLog('INFO', fNo, 'SYSTEM', `Узел ${title} удалён из конфигурации цеха`);
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
              if (r && r.ok !== false) processed.push(r);
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

    this.httpServer.listen(this.gatewayPort, '0.0.0.0', () => {
      this.gatewayRunning = true;
      this.pushLog('INFO', 0, 'PROD-GW', `Промышленный шлюз АСУ ТП активен на 0.0.0.0:${this.gatewayPort}/api/v1/telemetry (STRICT REAL PLC)`);
    });
  }

  ingestTelemetryPacket(rawPacket, sourceIp = '127.0.0.1') {
    const fNo = Number(rawPacket.furnace_no || rawPacket.furnace || rawPacket.unit || 1);
    if (!this.furnaces[fNo]) return { ok: false, error: `Узел печи №${fNo} не зарегистрирован` };

    const unit = this.furnaces[fNo];
    if (!unit.connected) {
      this.pushLog('ERR', fNo, unit.protocol, `${unit.name || 'ДСП №' + fNo}: пакет отклонён — печь не подключена в Центре ПЛК`);
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
      melt_num: rawPacket.melt_num || rawPacket.num || undefined,
      mass_t: rawPacket.mass_t !== undefined ? Number(rawPacket.mass_t) : undefined,
      temp_c: Number.isFinite(temp_c) ? Math.max(20, Math.min(1850, Math.round(temp_c))) : undefined,
      power_mw: Number.isFinite(power_mw) ? Math.max(0, Math.min(65, Math.round(power_mw * 10) / 10)) : undefined,
      t_min: Number.isFinite(t_min) ? Math.max(0, Math.min(85, Math.round(t_min * 10) / 10)) : undefined,
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
    this.totalRxPackets += 1;

    const summary = `${unit.name || 'ДСП №' + fNo} [${sourceIp}] <= T=${normalized.temp_c ?? '—'}°C, P=${normalized.power_mw ?? '—'}МВт, t=${normalized.t_min ?? '—'}мин${normalized.stage ? ' [' + normalized.stage + ']' : ''}`;
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
    if (this.packetLog.length > 50) {
      this.packetLog.length = 50;
    }
  }

  // Проверка физического TCP-соединения с контроллером ПЛК
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
          if (unit.connected) unit.status = 'ONLINE';
          this.pushLog('OK', fNo, unit.protocol, `TCP-соединение с ПЛК ${unit.name} (${unit.host}:${unit.port}) подтверждено (${unit.ping_ms} мс)`);
          resolve({ ok: true, furnace_no: fNo, ping_ms: unit.ping_ms, endpoint: `${unit.host}:${unit.port}` });
        } else {
          unit.ping_ms = null;
          unit.status = unit.connected ? 'OFFLINE' : 'DISCONNECTED';
          unit.last_error = errText || 'Таймаут соединения';
          this.pushLog('ERR', fNo, unit.protocol, `${unit.name} (${unit.host}:${unit.port}) недоступен: ${unit.last_error}`);
          resolve({ ok: false, furnace_no: fNo, error: unit.last_error, endpoint: `${unit.host}:${unit.port}` });
        }
      };

      socket.setTimeout(1500);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false, 'Таймаут TCP (1500 мс)'));
      socket.once('error', err => finish(false, err.code || err.message));

      try {
        socket.connect(Number(unit.port) || 4840, unit.host || '192.168.10.11');
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
      unit.ping_ms = null;
      this.pushLog('INFO', fNo, unit.protocol, `${unit.name} отключена оператором от поста мониторинга`);
      return { ok: true, connected: false, furnace_no: fNo, status: this.getStatus() };
    }

    const probe = await this.testConnection(fNo);
    if (!probe.ok) {
      unit.connected = false;
      unit.status = 'OFFLINE';
      return {
        ok: false,
        connected: false,
        furnace_no: fNo,
        error: probe.error || 'Контроллер ПЛК не отвечает по TCP',
        status: this.getStatus()
      };
    }

    unit.connected = true;
    unit.status = 'STANDBY';
    this.pushLog('OK', fNo, unit.protocol, `${unit.name} подключена к промышленному посту мониторинга (${unit.host}:${unit.port})`);
    return {
      ok: true,
      connected: true,
      furnace_no: fNo,
      ping_ms: probe.ping_ms,
      status: this.getStatus()
    };
  }

  updateConfig(newCfg = {}) {
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
        if (src.port) f.port = Number(src.port) || 4840;
        if (src.endpoint) f.endpoint = src.endpoint.trim();
        if (src.poll_ms) f.poll_ms = Math.max(200, Number(src.poll_ms) || 1000);
      }
    }
    this.saveConfig();
    return this.getStatus();
  }

  getStatus() {
    const now = Date.now();
    const nums = this.getFurnaceNumbers();
    const units = nums.map(fNo => {
      const f = this.furnaces[fNo];
      const ageMs = f.last_rx_at ? (now - new Date(f.last_rx_at).getTime()) : null;
      const isLive = ageMs !== null && ageMs < 10000;
      let effectiveSource = 'DISCONNECTED';
      if (f.connected) {
        effectiveSource = isLive ? 'PLC_LIVE' : 'WAITING_PLC';
      }
      return {
        ...f,
        is_live: f.connected && isLive,
        effective_source: effectiveSource
      };
    });

    return {
      edition: 'production',
      mode: 'external',
      gatewayPort: this.gatewayPort,
      gatewayRunning: this.gatewayRunning,
      gatewayUrl: `http://0.0.0.0:${this.gatewayPort}/api/v1/telemetry`,
      connectedCount: units.filter(u => u.connected).length,
      totalFurnaces: units.length,
      totalRxPackets: this.totalRxPackets,
      furnaces: units,
      packetLog: this.packetLog
    };
  }
}

module.exports = new PlcConnector();
