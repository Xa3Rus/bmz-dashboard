// Работа с базой данных SQLite и обработка телеметрии от ПЛК
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const plcConnector = require('./plcConnector');

let db = null;
let dbFile = null;

const STAGES = [
  { name: 'Завалка',   from: 0,  to: 8 },
  { name: 'Плавление', from: 8,  to: 38 },
  { name: 'Доводка',   from: 38, to: 58 },
  { name: 'Выпуск',    from: 58, to: 65 }
];

const GRADES = [
  { name: 'Ст3сп',  c: [0.14, 0.22], si: [0.15, 0.30], mn: [0.40, 0.65] },
  { name: '09Г2С',  c: [0.05, 0.12], si: [0.50, 0.80], mn: [1.30, 1.65] },
  { name: '40Х',    c: [0.36, 0.44], si: [0.17, 0.37], mn: [0.50, 0.80] },
  { name: '65Г',    c: [0.62, 0.70], si: [0.17, 0.37], mn: [0.90, 1.20] }
];

function stageAt(t) {
  return STAGES.find(s => t >= s.from && t < s.to) || STAGES[STAGES.length - 1];
}

function persist() {
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
}

function q(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  return q('SELECT last_insert_rowid() AS id')[0].id;
}

async function init(file) {
  dbFile = file;
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const SQL = await initSqlJs({
    locateFile: f => {
      const localPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', f);
      return fs.existsSync(localPath) ? localPath : path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', f);
    }
  });
  if (fs.existsSync(file)) {
    db = new SQL.Database(fs.readFileSync(file));
  } else {
    db = new SQL.Database();
    createSchema();
    seedGradesOnly();
    persist();
  }
  const plcCfgPath = path.join(dir, 'plc-config-prod.json');
  plcConnector.init(plcCfgPath, packet => applyExternalTelemetry(packet));
}

function createSchema() {
  db.run(`
    CREATE TABLE melts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      furnace_no INTEGER NOT NULL DEFAULT 1,
      num TEXT NOT NULL,
      started_at TEXT NOT NULL,
      steel_grade TEXT NOT NULL,
      mass_t REAL NOT NULL,
      energy_kwh REAL NOT NULL,
      duration_min INTEGER NOT NULL,
      status TEXT NOT NULL,
      operator TEXT NOT NULL
    );
    CREATE TABLE temp_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      melt_id INTEGER NOT NULL REFERENCES melts(id),
      t_min REAL NOT NULL,
      temp_c REAL NOT NULL,
      power_mw REAL NOT NULL
    );
    CREATE TABLE alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      melt_id INTEGER REFERENCES melts(id),
      t_min REAL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      c_min REAL, c_max REAL, si_min REAL, si_max REAL, mn_min REAL, mn_max REAL
    );
  `);
}

function seedGradesOnly() {
  for (const g of GRADES) {
    run('INSERT INTO grades (name, c_min, c_max, si_min, si_max, mn_min, mn_max) VALUES (?,?,?,?,?,?,?)',
      [g.name, g.c[0], g.c[1], g.si[0], g.si[1], g.mn[0], g.mn[1]]);
  }
}

// Возвращает только реально подключённые печи и их фактические данные от ПЛК
function activeMelts(includeDisconnected = false) {
  const list = [];
  const plcStat = plcConnector.getStatus();
  for (const unitCfg of plcStat.furnaces) {
    const fNo = unitCfg.furnace_no;
    if (!includeDisconnected && !unitCfg.connected) {
      continue;
    }

    const m = q("SELECT * FROM melts WHERE status='active' AND furnace_no=? ORDER BY id DESC LIMIT 1", [fNo])[0];
    if (!m) {
      // Печь подключена по TCP, ожидается первый кадр телеметрии плавки от контроллера ПЛК
      list.push({
        id: null,
        furnace_no: fNo,
        furnace_name: unitCfg.name || `ДСП-135 №${fNo}`,
        num: 'ОЖИДАНИЕ ПЛК',
        started_at: new Date().toISOString(),
        steel_grade: unitCfg.steel_grade || '—',
        mass_t: 0,
        energy_kwh: 0,
        duration_min: 65,
        status: 'waiting_plc',
        operator: 'Ожидание кадра ПЛК',
        t_min: 0,
        temp_c: 25,
        power_mw: 0,
        stage: 'Завалка',
        plc_source: unitCfg.effective_source || 'WAITING_PLC',
        plc_protocol: unitCfg.protocol || 'OPC UA',
        plc_rx_count: unitCfg.rx_count || 0
      });
      continue;
    }

    const lastPt = q("SELECT t_min, temp_c, power_mw FROM temp_points WHERE melt_id=? ORDER BY t_min DESC LIMIT 1", [m.id])[0] || {
      t_min: 0,
      temp_c: 25,
      power_mw: 0
    };
    const st = stageAt(lastPt.t_min);
    list.push({
      ...m,
      furnace_name: unitCfg.name || `ДСП-135 №${fNo}`,
      t_min: lastPt.t_min,
      temp_c: lastPt.temp_c,
      power_mw: lastPt.power_mw,
      stage: st.name,
      plc_source: unitCfg.effective_source || 'PLC_LIVE',
      plc_protocol: unitCfg.protocol || 'OPC UA',
      plc_rx_count: unitCfg.rx_count || 0
    });
  }
  return list;
}

function activeProgress(meltId) {
  const r = q('SELECT MAX(t_min) AS m FROM temp_points WHERE melt_id=?', [meltId])[0];
  return r && r.m !== null ? r.m : 0;
}

// Запись реального кадра телеметрии от промышленного ПЛК
function applyExternalTelemetry(packet) {
  if (!db) return null;
  const fNo = Number(packet.furnace_no) || 1;
  const plcStat = plcConnector.getStatus();
  const unitCfg = plcStat.furnaces.find(u => u.furnace_no === fNo);
  if (!unitCfg || !unitCfg.connected) return null;

  let melt = q("SELECT * FROM melts WHERE status='active' AND furnace_no=? ORDER BY id DESC LIMIT 1", [fNo])[0];

  // Если активной плавки в БД ещё нет — открываем новый паспорт плавки по данным от ПЛК
  if (!melt) {
    const nowD = new Date();
    const num = packet.melt_num || `ПЛ-${fNo}-${nowD.toISOString().slice(5, 10).replace('-', '')}-${String(nowD.getHours()).padStart(2, '0')}${String(nowD.getMinutes()).padStart(2, '0')}`;
    const grade = packet.steel_grade || unitCfg.steel_grade || 'Ст3сп';
    const mass = packet.mass_t || 135;
    const operator = packet.operator || 'Пост АСУ ТП ЭСПЦ-2';
    const newId = run(
      'INSERT INTO melts (furnace_no, num, started_at, steel_grade, mass_t, energy_kwh, duration_min, status, operator) VALUES (?,?,?,?,?,?,?,?,?)',
      [fNo, num, nowD.toISOString(), grade, mass, 0, 65, 'active', operator]
    );
    melt = q("SELECT * FROM melts WHERE id=?", [newId])[0];
  }

  if (packet.steel_grade && packet.steel_grade !== melt.steel_grade) {
    run('UPDATE melts SET steel_grade=? WHERE id=?', [packet.steel_grade, melt.id]);
    melt.steel_grade = packet.steel_grade;
  }
  if (packet.operator && packet.operator !== melt.operator) {
    run('UPDATE melts SET operator=? WHERE id=?', [packet.operator, melt.id]);
    melt.operator = packet.operator;
  }
  if (packet.mass_t && packet.mass_t !== melt.mass_t) {
    run('UPDATE melts SET mass_t=? WHERE id=?', [packet.mass_t, melt.id]);
    melt.mass_t = packet.mass_t;
  }

  const prevT = activeProgress(melt.id);
  let tRounded = packet.t_min !== undefined ? Number(packet.t_min) : Math.round((prevT + 0.5) * 10) / 10;

  if (packet.stage && packet.t_min === undefined) {
    const stObj = STAGES.find(s => s.name.toLowerCase() === String(packet.stage).toLowerCase());
    if (stObj && (tRounded < stObj.from || tRounded >= stObj.to)) {
      tRounded = stObj.from + 1.0;
    }
  }

  // Завершение плавки по сигналу от ПЛК
  if (tRounded >= melt.duration_min) {
    run("UPDATE melts SET status='completed' WHERE id=?", [melt.id]);
    run('INSERT INTO alerts (melt_id, t_min, level, message, created_at) VALUES (?,?,?,?,?)',
      [melt.id, melt.duration_min, 'info', `[${unitCfg.name || 'ДСП №' + fNo}] Плавка ${melt.num} (${melt.steel_grade}) завершена по сигналу ПЛК.`, new Date().toISOString()]);
    persist();
    return { status: 'cycle_completed', furnace_no: fNo };
  }

  const temp = packet.temp_c !== undefined ? Number(packet.temp_c) : 25;
  const power = packet.power_mw !== undefined ? Number(packet.power_mw) : 0;
  const dt = Math.max(0.1, tRounded - prevT);

  run('INSERT INTO temp_points (melt_id, t_min, temp_c, power_mw) VALUES (?,?,?,?)', [melt.id, tRounded, temp, power]);
  run('UPDATE melts SET energy_kwh=? WHERE id=?', [Math.round(melt.energy_kwh + power * dt * 1000 / 60), melt.id]);

  if (packet.alert && packet.alert.message) {
    run('INSERT INTO alerts (melt_id, t_min, level, message, created_at) VALUES (?,?,?,?,?)',
      [melt.id, Math.round(tRounded), packet.alert.level || 'warn', `[${unitCfg.name || 'ДСП №' + fNo} · ПЛК] ${packet.alert.message}`, new Date().toISOString()]);
  } else if (temp >= 1660) {
    run('INSERT INTO alerts (melt_id, t_min, level, message, created_at) VALUES (?,?,?,?,?)',
      [melt.id, Math.round(tRounded), 'crit', `[${unitCfg.name || 'ДСП №' + fNo} · ПЛК] Превышение температурной уставки (${temp} °C > 1660 °C)`, new Date().toISOString()]);
  }

  persist();
  return { furnace_no: fNo, melt_id: melt.id, t_min: tRounded, temp_c: temp, power_mw: power };
}

function api(method, args = {}) {
  switch (method) {
    case 'summary': {
      const actives = activeMelts(false);
      const selectedFurnace = args.furnace_no ? Number(args.furnace_no) : 1;
      const active = actives.find(a => a.furnace_no === selectedFurnace) || actives[0] || null;
      const today = q("SELECT COUNT(*) AS n FROM melts WHERE date(started_at)=date('now')")[0].n;
      const avgEVal = q('SELECT AVG(energy_kwh/mass_t) AS v FROM melts WHERE status="completed" AND mass_t > 0')[0].v;
      const avgDVal = q('SELECT AVG(duration_min) AS v FROM melts WHERE status="completed"')[0].v;
      const avgEnergy = avgEVal ? Math.round(avgEVal) : 0;
      const avgDur = avgDVal ? Math.round(avgDVal) : 0;
      const month = q("SELECT COUNT(*) AS n FROM melts WHERE started_at >= date('now','-30 day')")[0].n;
      const plc = plcConnector.getStatus();
      return { active, actives, meltsToday: today, avgEnergyPerT: avgEnergy, avgDuration: avgDur, meltsMonth: month, plc };
    }
    case 'melt:list': {
      return q('SELECT id, furnace_no, num, started_at, steel_grade, mass_t, energy_kwh, duration_min, status, operator FROM melts ORDER BY started_at DESC LIMIT 120');
    }
    case 'melt:detail': {
      if (!args.id) return null;
      const melt = q('SELECT * FROM melts WHERE id=?', [args.id])[0];
      if (!melt) return null;
      const points = q('SELECT t_min, temp_c, power_mw FROM temp_points WHERE melt_id=? ORDER BY t_min', [args.id]);
      const alerts = q('SELECT t_min, level, message, created_at FROM alerts WHERE melt_id=? ORDER BY t_min', [args.id]);
      return { melt, points, alerts };
    }
    case 'alerts:list': {
      return q(`SELECT a.id, a.level, a.message, a.t_min, a.created_at, m.num AS melt_num, m.furnace_no AS furnace_no
                FROM alerts a LEFT JOIN melts m ON m.id=a.melt_id
                ORDER BY a.created_at DESC LIMIT 100`);
    }
    case 'grades:list': {
      return q('SELECT * FROM grades ORDER BY id');
    }
    case 'live:tick': {
      return [];
    }
    case 'plc:status': {
      return plcConnector.getStatus();
    }
    case 'plc:config': {
      return plcConnector.updateConfig(args);
    }
    case 'plc:test': {
      return plcConnector.testConnection(args.furnace_no);
    }
    case 'plc:connect': {
      return plcConnector.setFurnaceConnection(args.furnace_no, args.connect !== false);
    }
    case 'plc:add': {
      return plcConnector.addFurnace(args);
    }
    case 'plc:remove': {
      return plcConnector.removeFurnace(args.furnace_no);
    }
    default:
      throw new Error('Unknown API method: ' + method);
  }
}

module.exports = { init, api };
