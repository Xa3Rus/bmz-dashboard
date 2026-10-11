// Слой данных: SQLite (sql.js) + генератор данных + коннектор промышленных ПЛК (OPC UA / Modbus TCP / MQTT / HTTP)
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const plcConnector = require('./plcConnector');

let db = null;
let dbFile = null;

const STAGES = [
  { name: 'Завалка',   from: 0,  to: 8,  t0: 25,   t1: 850,  p0: 10, p1: 42 },
  { name: 'Плавление', from: 8,  to: 38, t0: 850,  t1: 1580, p0: 42, p1: 45 },
  { name: 'Доводка',   from: 38, to: 58, t0: 1580, t1: 1655, p0: 25, p1: 18 },
  { name: 'Выпуск',    from: 58, to: 65, t0: 1655, t1: 1620, p0: 18, p1: 0 }
];

const GRADES = [
  { name: 'Ст3сп',  c: [0.14, 0.22], si: [0.15, 0.30], mn: [0.40, 0.65] },
  { name: '09Г2С',  c: [0.05, 0.12], si: [0.50, 0.80], mn: [1.30, 1.65] },
  { name: '40Х',    c: [0.36, 0.44], si: [0.17, 0.37], mn: [0.50, 0.80] },
  { name: '65Г',    c: [0.62, 0.70], si: [0.17, 0.37], mn: [0.90, 1.20] }
];

const OPERATORS = ['Иванов А.В.', 'Петров С.Н.', 'Ковалёв Д.И.', 'Сидоренко П.П.', 'Лукашов В.Г.'];
const ALERT_TEMPLATES = [
  { level: 'warn', message: 'Температура близка к верхнему пределу' },
  { level: 'crit', message: 'Превышение температуры металла (уставка 1660 °C)' },
  { level: 'warn', message: 'Повышенный расход электродов' },
  { level: 'warn', message: 'Отклонение напряжения питающей сети' },
  { level: 'info', message: 'Стадия «Плавление» завершена' },
  { level: 'crit', message: 'Расход воды охлаждения свода ниже нормы' },
  { level: 'info', message: 'Плавка передана в разливочный пролёт' }
];

function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function stageAt(t) {
  return STAGES.find(s => t >= s.from && t < s.to) || STAGES[STAGES.length - 1];
}

function curveValue(t, kind) {
  const st = stageAt(t);
  const k = (t - st.from) / (st.to - st.from);
  const base = kind === 'temp'
    ? st.t0 + (st.t1 - st.t0) * k
    : st.p0 + (st.p1 - st.p0) * k;
  const noise = kind === 'temp' ? rnd(-12, 12) : rnd(-1.5, 1.5);
  return Math.max(0, base + noise);
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
  const id = q('SELECT last_insert_rowid() AS id')[0].id;
  return id;
}

async function init(file) {
  dbFile = file;
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const SQL = await initSqlJs({
    locateFile: f => path.join(__dirname, 'node_modules', 'sql.js', 'dist', f)
  });
  if (fs.existsSync(file)) {
    db = new SQL.Database(fs.readFileSync(file));
    ensureMultiFurnaceMigration();
  } else {
    db = new SQL.Database();
    createSchema();
    seed();
    persist();
  }
  const plcCfgPath = path.join(dir, 'plc-config.json');
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
    CREATE TABLE materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      c_pct REAL, si_pct REAL, mn_pct REAL, price_per_t REAL
    );
    CREATE TABLE grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      c_min REAL, c_max REAL, si_min REAL, si_max REAL, mn_min REAL, mn_max REAL
    );
  `);
}

function createPreheatedActiveMelt(furnaceNo, gradeName, initialMinutes, seqOffset = 0) {
  const nowD = new Date(Date.now() - initialMinutes * 60000);
  const duration = 65;
  const mass = Math.round(rnd(104, 126));
  const num = `ПЛ-${furnaceNo}-${nowD.toISOString().slice(5, 10).replace('-', '')}-${String(200 + furnaceNo * 10 + seqOffset).padStart(3, '0')}`;
  const operator = OPERATORS[(furnaceNo - 1) % OPERATORS.length];

  let energyAcc = 0;
  const points = [];
  const step = 1.2;
  for (let t = 0; t <= initialMinutes; t += step) {
    const tRound = Math.round(t * 10) / 10;
    const temp = Math.round(curveValue(tRound, 'temp'));
    const power = Math.round(curveValue(tRound, 'power') * 10) / 10;
    points.push({ t_min: tRound, temp_c: temp, power_mw: power });
    if (t > 0) {
      energyAcc += power * step * 1000 / 60;
    }
  }

  const meltId = run(
    'INSERT INTO melts (furnace_no, num, started_at, steel_grade, mass_t, energy_kwh, duration_min, status, operator) VALUES (?,?,?,?,?,?,?,?,?)',
    [furnaceNo, num, nowD.toISOString(), gradeName, mass, Math.round(energyAcc), duration, 'active', operator]
  );

  for (const pt of points) {
    run('INSERT INTO temp_points (melt_id, t_min, temp_c, power_mw) VALUES (?,?,?,?)',
      [meltId, pt.t_min, pt.temp_c, pt.power_mw]);
  }
  return meltId;
}

function ensureMultiFurnaceMigration() {
  const cols = q("PRAGMA table_info(melts)");
  const hasFurnaceNo = cols.some(c => c.name === 'furnace_no');
  if (!hasFurnaceNo) {
    db.run('ALTER TABLE melts ADD COLUMN furnace_no INTEGER NOT NULL DEFAULT 1');
    // Распределяем архивные плавки по 4 печам
    db.run("UPDATE melts SET furnace_no = ((id - 1) % 4) + 1 WHERE status = 'completed'");
  }

  // Проверяем, чтобы на каждой из 4 печей (1..4) работала своя активная плавка с уникальной маркой стали
  const defaultConfigs = [
    { furnace_no: 1, grade: 'Ст3сп', initMin: 4.5 },
    { furnace_no: 2, grade: '09Г2С', initMin: 23.0 },
    { furnace_no: 3, grade: '40Х',   initMin: 44.5 },
    { furnace_no: 4, grade: '65Г',   initMin: 59.5 }
  ];

  let changed = !hasFurnaceNo;
  for (const cfg of defaultConfigs) {
    const activeOnFurnace = q("SELECT * FROM melts WHERE status='active' AND furnace_no=? ORDER BY id DESC LIMIT 1", [cfg.furnace_no])[0];
    if (!activeOnFurnace) {
      createPreheatedActiveMelt(cfg.furnace_no, cfg.grade, cfg.initMin, Math.floor(rnd(1, 80)));
      changed = true;
    }
  }
  if (changed) persist();
}

function seed() {
  const now = Date.now();
  // 40 завершённых плавок за последние 30 дней по 4 печам
  for (let i = 40; i >= 1; i--) {
    const furnaceNo = ((40 - i) % 4) + 1;
    const started = new Date(now - i * rnd(10, 15) * 3600 * 1000);
    const grade = pick(GRADES).name;
    const mass = Math.round(rnd(98, 126));
    const duration = Math.round(rnd(58, 70));
    const energy = Math.round(mass * rnd(382, 425));
    const num = `ПЛ-${furnaceNo}-` + started.toISOString().slice(5, 10).replace('-', '') + '-' + String(101 + (40 - i)).padStart(3, '0');
    const id = run(
      'INSERT INTO melts (furnace_no, num, started_at, steel_grade, mass_t, energy_kwh, duration_min, status, operator) VALUES (?,?,?,?,?,?,?,?,?)',
      [furnaceNo, num, started.toISOString(), grade, mass, energy, duration, 'completed', pick(OPERATORS)]
    );
    const step = duration / rnd(22, 30);
    for (let t = 0; t <= duration; t += step) {
      run('INSERT INTO temp_points (melt_id, t_min, temp_c, power_mw) VALUES (?,?,?,?)',
        [id, Math.round(t * 10) / 10, Math.round(curveValue(t, 'temp')), Math.round(curveValue(t, 'power') * 10) / 10]);
    }
    if (Math.random() < 0.45) {
      const tpl = pick(ALERT_TEMPLATES);
      const t = Math.round(rnd(5, duration - 5));
      run('INSERT INTO alerts (melt_id, t_min, level, message, created_at) VALUES (?,?,?,?,?)',
        [id, t, tpl.level, tpl.message, new Date(started.getTime() + t * 60000).toISOString()]);
    }
  }

  // 4 параллельные активные плавки на ДСП №1..4 с разными марками стали и фазами цикла
  createPreheatedActiveMelt(1, 'Ст3сп', 4.5, 1);
  createPreheatedActiveMelt(2, '09Г2С', 23.0, 2);
  createPreheatedActiveMelt(3, '40Х',   44.5, 3);
  createPreheatedActiveMelt(4, '65Г',   59.5, 4);

  run('INSERT INTO materials (name, role, c_pct, si_pct, mn_pct, price_per_t) VALUES (?,?,?,?,?,?)', ['Металлолом', 'основа', 0.30, 0.20, 0.50, 350]);
  run('INSERT INTO materials (name, role, c_pct, si_pct, mn_pct, price_per_t) VALUES (?,?,?,?,?,?)', ['Чугун передельный', 'основа', 4.20, 0.80, 0.60, 1650]);
  run('INSERT INTO materials (name, role, c_pct, si_pct, mn_pct, price_per_t) VALUES (?,?,?,?,?,?)', ['Ферросилиций ФС45', 'легирующее', 0.10, 45.0, 0.40, 3400]);
  run('INSERT INTO materials (name, role, c_pct, si_pct, mn_pct, price_per_t) VALUES (?,?,?,?,?,?)', ['Ферромарганец ФМн78', 'легирующее', 6.00, 1.20, 78.0, 4600]);
  run('INSERT INTO materials (name, role, c_pct, si_pct, mn_pct, price_per_t) VALUES (?,?,?,?,?,?)', ['Известь', 'флюс', 0, 0, 0, 140]);
  run('INSERT INTO materials (name, role, c_pct, si_pct, mn_pct, price_per_t) VALUES (?,?,?,?,?,?)', ['Кокс (науглероживатель)', 'добавка', 88.0, 0.5, 0.3, 850]);

  for (const g of GRADES) {
    run('INSERT INTO grades (name, c_min, c_max, si_min, si_max, mn_min, mn_max) VALUES (?,?,?,?,?,?,?)',
      [g.name, g.c[0], g.c[1], g.si[0], g.si[1], g.mn[0], g.mn[1]]);
  }
}

// ---------- Симуляция и приём телеметрии ПЛК для 4 параллельных печей ----------

function activeMelts() {
  const list = [];
  const plcStat = plcConnector.getStatus();
  for (let fNo = 1; fNo <= 4; fNo++) {
    let m = q("SELECT * FROM melts WHERE status='active' AND furnace_no=? ORDER BY id DESC LIMIT 1", [fNo])[0];
    if (!m) {
      const grade = GRADES[(fNo - 1) % GRADES.length].name;
      const newId = createPreheatedActiveMelt(fNo, grade, 1.0, Math.floor(rnd(10, 99)));
      m = q("SELECT * FROM melts WHERE id=?", [newId])[0];
    }
    const lastPt = q("SELECT t_min, temp_c, power_mw FROM temp_points WHERE melt_id=? ORDER BY t_min DESC LIMIT 1", [m.id])[0] || {
      t_min: 0,
      temp_c: 25,
      power_mw: 0
    };
    const st = stageAt(lastPt.t_min);
    const unitCfg = plcStat.furnaces.find(u => u.furnace_no === fNo) || {};
    list.push({
      ...m,
      t_min: lastPt.t_min,
      temp_c: lastPt.temp_c,
      power_mw: lastPt.power_mw,
      stage: st.name,
      plc_source: unitCfg.effective_source || 'MODEL',
      plc_protocol: unitCfg.protocol || 'OPC UA',
      plc_rx_count: unitCfg.rx_count || 0
    });
  }
  return list;
}

function activeMelt(furnaceNo = 1) {
  const all = activeMelts();
  return all.find(m => m.furnace_no === Number(furnaceNo)) || all[0];
}

function activeProgress(meltId) {
  const r = q('SELECT MAX(t_min) AS m FROM temp_points WHERE melt_id=?', [meltId])[0];
  return r && r.m !== null ? r.m : 0;
}

function pickDistinctGrade(excludeGrades) {
  const available = GRADES.map(g => g.name).filter(name => !excludeGrades.includes(name));
  return available.length ? pick(available) : pick(GRADES).name;
}

function startNextActiveMelt(melt, overrideGrade = null) {
  run("UPDATE melts SET status='completed' WHERE id=?", [melt.id]);
  const otherActiveGrades = activeMelts()
    .filter(x => x.furnace_no !== melt.furnace_no)
    .map(x => x.steel_grade);
  const nextGrade = overrideGrade || pickDistinctGrade(otherActiveGrades);
  const d = new Date();
  const nextNum = `ПЛ-${melt.furnace_no}-` + d.toISOString().slice(5, 10).replace('-', '') + '-' + String(Math.floor(rnd(150, 980))).padStart(3, '0');
  const newMeltId = run(
    'INSERT INTO melts (furnace_no, num, started_at, steel_grade, mass_t, energy_kwh, duration_min, status, operator) VALUES (?,?,?,?,?,?,?,?,?)',
    [melt.furnace_no, nextNum, d.toISOString(), nextGrade, Math.round(rnd(102, 126)), 0, 65, 'active', OPERATORS[(melt.furnace_no - 1) % OPERATORS.length]]
  );
  run('INSERT INTO temp_points (melt_id, t_min, temp_c, power_mw) VALUES (?,?,?,?)',
    [newMeltId, 0.5, Math.round(curveValue(0.5, 'temp')), Math.round(curveValue(0.5, 'power') * 10) / 10]);
  run('INSERT INTO alerts (melt_id, t_min, level, message, created_at) VALUES (?,?,?,?,?)',
    [melt.id, melt.duration_min, 'info', `[ДСП №${melt.furnace_no}] Плавка ${melt.num} (${melt.steel_grade}) завершена. Выпуск в ковш.`, new Date().toISOString()]);
  return newMeltId;
}

// Запись реального пакета телеметрии от внешнего ПЛК / HTTP-шлюза
function applyExternalTelemetry(packet) {
  if (!db) return null;
  const fNo = Number(packet.furnace_no) || 1;
  let melt = activeMelt(fNo);
  if (!melt) return null;

  if (packet.steel_grade && packet.steel_grade !== melt.steel_grade) {
    run('UPDATE melts SET steel_grade=? WHERE id=?', [packet.steel_grade, melt.id]);
    melt.steel_grade = packet.steel_grade;
  }
  if (packet.operator && packet.operator !== melt.operator) {
    run('UPDATE melts SET operator=? WHERE id=?', [packet.operator, melt.id]);
    melt.operator = packet.operator;
  }

  const prevT = activeProgress(melt.id);
  let tRounded = packet.t_min !== undefined ? Number(packet.t_min) : Math.round((prevT + 0.5) * 10) / 10;

  // Если передана стадия без минуты, синхронизируем минуту под выбранную стадию
  if (packet.stage && packet.t_min === undefined) {
    const stObj = STAGES.find(s => s.name.toLowerCase() === String(packet.stage).toLowerCase());
    if (stObj && (tRounded < stObj.from || tRounded >= stObj.to)) {
      tRounded = stObj.from + 1.5;
    }
  }

  // Если внешний ПЛК прислал начало нового цикла (t_min сбросился) или превысил длительность
  if (tRounded >= melt.duration_min) {
    startNextActiveMelt(melt, packet.steel_grade || null);
    persist();
    return { status: 'cycle_completed', furnace_no: fNo };
  }
  if (tRounded < prevT) {
    // При принудительной установке ранней стадии очищаем будущие точки, чтобы график и степпер перешли на заданную минуту
    run('DELETE FROM temp_points WHERE melt_id=? AND t_min >= ?', [melt.id, tRounded]);
  }

  const temp = packet.temp_c !== undefined ? Number(packet.temp_c) : Math.round(curveValue(tRounded, 'temp'));
  const power = packet.power_mw !== undefined ? Number(packet.power_mw) : Math.round(curveValue(tRounded, 'power') * 10) / 10;
  const dt = Math.max(0.2, tRounded - prevT);

  run('INSERT INTO temp_points (melt_id, t_min, temp_c, power_mw) VALUES (?,?,?,?)', [melt.id, tRounded, temp, power]);
  run('UPDATE melts SET energy_kwh=? WHERE id=?', [Math.round(melt.energy_kwh + power * dt * 1000 / 60), melt.id]);

  if (packet.alert && packet.alert.message) {
    run('INSERT INTO alerts (melt_id, t_min, level, message, created_at) VALUES (?,?,?,?,?)',
      [melt.id, Math.round(tRounded), packet.alert.level || 'warn', `[ДСП №${fNo} · ПЛК] ${packet.alert.message}`, new Date().toISOString()]);
  } else if (temp >= 1660) {
    run('INSERT INTO alerts (melt_id, t_min, level, message, created_at) VALUES (?,?,?,?,?)',
      [melt.id, Math.round(tRounded), 'crit', `[ДСП №${fNo} · ПЛК] Превышение температурной уставки (${temp} °C > 1660 °C)`, new Date().toISOString()]);
  }

  persist();
  return { furnace_no: fNo, melt_id: melt.id, t_min: tRounded, temp_c: temp, power_mw: power };
}

function tickLive() {
  // В режиме строгого внешнего ПЛК математическая модель отключена
  if (plcConnector.mode === 'external') {
    return [];
  }

  const currentActives = activeMelts();
  const results = [];

  for (const melt of currentActives) {
    // В гибридном режиме не перезаписываем печь моделью, если на неё идут живые пакеты от ПЛК
    if (plcConnector.mode === 'hybrid' && plcConnector.isFurnaceLiveExternal(melt.furnace_no)) {
      continue;
    }

    let t = activeProgress(melt.id);
    const dt = rnd(0.45, 0.85);
    t += dt;
    const done = t >= melt.duration_min;

    if (done) {
      startNextActiveMelt(melt);
      continue;
    }

    const temp = Math.round(curveValue(t, 'temp'));
    const power = Math.round(curveValue(t, 'power') * 10) / 10;
    const tRounded = Math.round(t * 10) / 10;
    run('INSERT INTO temp_points (melt_id, t_min, temp_c, power_mw) VALUES (?,?,?,?)', [melt.id, tRounded, temp, power]);
    run('UPDATE melts SET energy_kwh=? WHERE id=?', [Math.round(melt.energy_kwh + power * dt * 1000 / 60), melt.id]);

    if (temp >= 1652 && Math.random() < 0.18) {
      run('INSERT INTO alerts (melt_id, t_min, level, message, created_at) VALUES (?,?,?,?,?)',
        [melt.id, Math.round(t), 'crit', `[ДСП №${melt.furnace_no}] Превышение температуры металла (уставка 1660 °C)`, new Date().toISOString()]);
    }
    results.push({ furnace_no: melt.furnace_no, melt, point: { t_min: tRounded, temp_c: temp, power_mw: power } });
  }

  persist();
  return results;
}

// ---------- API для рендерера ----------

function api(method, args = {}) {
  switch (method) {
    case 'summary': {
      const actives = activeMelts();
      const selectedFurnace = args.furnace_no ? Number(args.furnace_no) : 1;
      const active = actives.find(a => a.furnace_no === selectedFurnace) || actives[0];
      const today = q("SELECT COUNT(*) AS n FROM melts WHERE date(started_at)=date('now')")[0].n;
      const avgEnergy = Math.round(q('SELECT AVG(energy_kwh/mass_t) AS v FROM melts WHERE status="completed"')[0].v);
      const avgDur = Math.round(q('SELECT AVG(duration_min) AS v FROM melts WHERE status="completed"')[0].v);
      const month = q("SELECT COUNT(*) AS n FROM melts WHERE started_at >= date('now','-30 day')")[0].n;
      const plc = plcConnector.getStatus();
      return { active, actives, meltsToday: today, avgEnergyPerT: avgEnergy, avgDuration: avgDur, meltsMonth: month, plc };
    }
    case 'melt:list': {
      return q('SELECT id, furnace_no, num, started_at, steel_grade, mass_t, energy_kwh, duration_min, status, operator FROM melts ORDER BY started_at DESC LIMIT 120');
    }
    case 'melt:detail': {
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
    case 'materials:list': {
      return q('SELECT * FROM materials ORDER BY id');
    }
    case 'grades:list': {
      return q('SELECT * FROM grades ORDER BY id');
    }
    case 'live:tick': {
      return tickLive();
    }
    case 'shihta:calc': {
      return calcShihta(args);
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
    case 'plc:inject': {
      return plcConnector.ingestTelemetryPacket(args, 'ARM-OPERATOR');
    }
    case 'plc:stream': {
      return plcConnector.toggleVirtualPlcStream(args.enable, () => activeMelts());
    }
    default:
      throw new Error('Unknown API method: ' + method);
  }
}


// ---------- Расчёт шихты ----------

function calcShihta({ grade, mass, targetC, targetSi, targetMn }) {
  const mats = q('SELECT * FROM materials');
  const byName = n => mats.find(m => m.name.startsWith(n));
  const scrap = byName('Металлолом');
  const pig = byName('Чугун');
  const fesi = byName('Ферросилиций');
  const femn = byName('Ферромарганец');
  const lime = byName('Известь');
  const coke = byName('Кокс');

  const T = Number(mass) || 100;           // т
  const C = Number(targetC);               // %
  const Si = Number(targetSi);             // %
  const Mn = Number(targetMn);             // %

  // Доля чугуна: типовая для ДСП 25–35 %, подбирается под целевой углерод
  let x = (C - scrap.c_pct) / (pig.c_pct - scrap.c_pct);
  x = Math.min(0.35, Math.max(0.20, x));

  const fluxMass = Math.round(T * 0.05 * 10) / 10;   // известь 5 % от массы
  const metalMass = T - fluxMass;
  const pigMass = Math.round(metalMass * x * 10) / 10;
  const scrapMass = Math.round((metalMass - pigMass) * 10) / 10;

  // Базовое содержание элементов в металлошихте, кг (масса_т * % * 10)
  const baseC  = (scrapMass * scrap.c_pct  + pigMass * pig.c_pct)  * 10;
  const baseSi = (scrapMass * scrap.si_pct + pigMass * pig.si_pct) * 10;
  const baseMn = (scrapMass * scrap.mn_pct + pigMass * pig.mn_pct) * 10;

  // Легирование до целевого состава (учёт угара Si и Mn при продувке)
  const retSi = baseSi * 0.50;
  const retMn = baseMn * 0.70;
  const needSi = Math.max(0, Si * T * 10 - retSi);               // кг
  const needMn = Math.max(0, Mn * T * 10 - retMn);
  const fesiKg = Math.round(needSi / (fesi.si_pct / 100) * 10) / 10;
  const femnKg = Math.round(needMn / (femn.mn_pct / 100) * 10) / 10;

  // Баланс углерода: база + углерод ферросплавов против целевого,
  // избыток выжигается кислородом, недостаток компенсируется коксом
  const alloyC = fesiKg * fesi.c_pct / 100 + femnKg * femn.c_pct / 100;
  const targetC_kg = C * T * 10;
  const oxiC = Math.max(0, baseC + alloyC - targetC_kg);         // кг C на окисление
  const o2Kg = Math.round(oxiC * 2.67);                          // O2 + C -> CO2 (32/12)
  const needC  = Math.max(0, targetC_kg - (baseC + alloyC));     // кг (науглероживание)
  const cokeKg = Math.round(needC / (coke.c_pct / 100) * 10) / 10;

  const rows = [
    { name: scrap.name, mass: scrapMass, price: scrap.price_per_t },
    { name: pig.name,   mass: pigMass,   price: pig.price_per_t },
    { name: lime.name,  mass: fluxMass,  price: lime.price_per_t }
  ];
  if (fesiKg > 0) rows.push({ name: fesi.name,  mass: Math.round(fesiKg / 1000 * 1000) / 1000, kg: fesiKg, price: fesi.price_per_t });
  if (femnKg > 0) rows.push({ name: femn.name,  mass: Math.round(femnKg / 1000 * 1000) / 1000, kg: femnKg, price: femn.price_per_t });
  if (cokeKg > 0) rows.push({ name: coke.name,  mass: Math.round(cokeKg / 1000 * 1000) / 1000, kg: cokeKg, price: coke.price_per_t });

  const total = rows.reduce((s, r) => s + r.mass * r.price, 0);
  const finC  = (baseC - oxiC + cokeKg * coke.c_pct / 100 + fesiKg * fesi.c_pct / 100 + femnKg * femn.c_pct / 100) / (T * 1000) * 100;
  const finSi = (retSi + fesiKg * fesi.si_pct / 100) / (T * 1000) * 100;
  const finMn = (retMn + femnKg * femn.mn_pct / 100) / (T * 1000) * 100;

  const g = q('SELECT * FROM grades WHERE name=?', [grade])[0];
  const verdict = g ? {
    c:  finC  >= g.c_min  && finC  <= g.c_max,
    si: finSi >= g.si_min && finSi <= g.si_max,
    mn: finMn >= g.mn_min && finMn <= g.mn_max
  } : null;

  return {
    grade, massT: T,
    rows,
    totalCost: Math.round(total),
    costPerTon: Math.round(total / T),
    o2Kg,
    chemistry: { c: Math.round(finC * 1000) / 1000, si: Math.round(finSi * 1000) / 1000, mn: Math.round(finMn * 1000) / 1000 },
    spec: g,
    verdict
  };
}

module.exports = { init, api };
