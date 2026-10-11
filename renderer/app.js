// Логика клиентской части «Цифровая плавка — БМЗ» (АРМ оператора ДСП-135)
// Управление 3D моделью, дашбордом реального времени, журналом плавок, ПЛК-шлюзом и справочником

const call = (method, args) => window.api.call(method, args);

// Форматирование чисел и времени
const fmtTime = iso => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtNum = n => Number(n).toLocaleString('ru-RU');

const STAGE_NAMES = ['Завалка', 'Плавление', 'Доводка', 'Выпуск'];
function stageName(t, duration = 65) {
  const p = t / duration;
  if (p < 8 / 65) return STAGE_NAMES[0];
  if (p < 38 / 65) return STAGE_NAMES[1];
  if (p < 58 / 65) return STAGE_NAMES[2];
  return STAGE_NAMES[3];
}

let furnace3D = null;
let liveChart = null;
let detailChart = null;

let cachedMelts = [];
let cachedAlerts = [];
let currentAlertFilter = 'all';

// ==========================================================================
// 1. Инициализация 3D модели
// ==========================================================================
function initFurnace() {
  const container = document.getElementById('furnace3dContainer');
  if (!container) return;

  if (window.Furnace3D) {
    furnace3D = new window.Furnace3D(container);
    setup3DControls();
  } else {
    window.addEventListener('furnace3d-ready', () => {
      if (!furnace3D && window.Furnace3D) {
        furnace3D = new window.Furnace3D(container);
        setup3DControls();
      }
    });
  }
}

function setup3DControls() {
  if (!furnace3D) return;

  const btnCut = document.getElementById('btnCutaway');
  const btnShell = document.getElementById('btnShell');
  const btnTherm = document.getElementById('btnThermal');
  const btnWire = document.getElementById('btnWireframe');
  const btnRot = document.getElementById('btnRotate');
  const btnReset = document.getElementById('btnResetCam');

  const setModeActive = (activeBtn, mode) => {
    [btnCut, btnShell, btnTherm, btnWire].forEach(b => b?.classList.remove('active'));
    activeBtn?.classList.add('active');
    furnace3D.setMode(mode);
  };

  btnCut?.addEventListener('click', () => setModeActive(btnCut, 'cutaway'));
  btnShell?.addEventListener('click', () => setModeActive(btnShell, 'shell'));
  btnTherm?.addEventListener('click', () => setModeActive(btnTherm, 'thermal'));
  btnWire?.addEventListener('click', () => setModeActive(btnWire, 'wireframe'));

  btnRot?.addEventListener('click', () => {
    const isRotating = furnace3D.toggleAutoRotate();
    btnRot.classList.toggle('active', isRotating);
  });

  btnReset?.addEventListener('click', () => {
    furnace3D.resetCamera();
  });
}

// ==========================================================================
// 2. Навигация по вкладкам
// ==========================================================================
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const viewName = btn.dataset.view;
    switchView(viewName);
  });
});

document.getElementById('btnGoAlerts')?.addEventListener('click', () => {
  switchView('alerts');
});

document.getElementById('btnGoPlcConnect')?.addEventListener('click', () => {
  switchView('plc');
});

function switchView(viewName) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  const navTarget = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
  if (navTarget) navTarget.classList.add('active');

  const viewTarget = document.getElementById('view-' + viewName);
  if (viewTarget) viewTarget.classList.add('active');

  const titles = {
    dashboard: ['Мониторинг плавки', 'Контроль подключённых агрегатов ДСП-135'],
    melts: ['Журнал плавок', 'Технологические паспорта выплавки стали'],
    alerts: ['Журнал событий', 'Регистрация технологических отклонений и сигнализации'],
    plc: ['Подключение ПЛК', 'Конфигурация каналов связи АСУ ТП и подключение печей к мониторингу'],
    help: ['Справочник', 'Руководство пользователя, регламент ДСП-135 и марочник сталей']
  };

  if (titles[viewName]) {
    document.getElementById('viewTitle').textContent = titles[viewName][0];
    document.getElementById('viewSub').textContent = titles[viewName][1];
  }

  if (viewName === 'dashboard') {
    setTimeout(() => {
      if (furnace3D) furnace3D.resize();
    }, 60);
  } else if (viewName === 'plc') {
    refreshPlcStatusOnly(true);
  }
}

// Часы
setInterval(() => {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('ru-RU');
}, 1000);

// ==========================================================================
// 3. Дашборд реального времени (Monitoring)
// ==========================================================================
let selectedFurnaceNo = 1;
let previewStageOverride = null;
let previewTimeout = null;
let lastActiveIdsSignature = '';

function setDashboardConnectedLayout(hasConnectedFurnaces) {
  const emptyEl = document.getElementById('dashboardEmptyState');
  const activeEl = document.getElementById('dashboardActiveContent');
  if (!emptyEl || !activeEl) return;

  if (!hasConnectedFurnaces) {
    emptyEl.style.display = 'flex';
    activeEl.style.display = 'none';
  } else {
    const wasHidden = activeEl.style.display === 'none';
    emptyEl.style.display = 'none';
    activeEl.style.display = 'flex';
    if (wasHidden) {
      setTimeout(() => {
        if (furnace3D) furnace3D.resize();
      }, 60);
    }
  }
}

async function loadDashboard() {
  const s = await call('summary', { furnace_no: selectedFurnaceNo });
  if (!s) return;

  document.getElementById('kpiToday').textContent = s.meltsToday;
  document.getElementById('kpiMonth').textContent = s.meltsMonth;
  document.getElementById('kpiEnergy').textContent = fmtNum(s.avgEnergyPerT);
  document.getElementById('kpiDuration').textContent = s.avgDuration;

  if (s.plc) {
    syncGlobalPlcBadges(s.plc);
  }

  const actives = s.actives || [];
  const totalFurnaces = s.plc?.totalFurnaces || (s.plc?.furnaces || []).length || 4;
  setDashboardConnectedLayout(actives.length > 0);

  if (actives.length > 0) {
    if (!actives.some(a => a.furnace_no === selectedFurnaceNo)) {
      selectedFurnaceNo = actives[0].furnace_no;
    }
    renderFurnaceFleet(actives, totalFurnaces);
    if (s.active) {
      updateMeltTitles(s.active);
    }
  }
  await tickLive(false);
}

function renderFurnaceFleet(actives, totalFurnaces = 4) {
  const bar = document.getElementById('furnaceFleetBar');
  if (!bar || !Array.isArray(actives)) return;

  const cardsHtml = actives.map(m => {
    const fNo = m.furnace_no || 1;
    const fTitle = m.furnace_name || `ДСП-135 №${fNo}`;
    const isSel = fNo === selectedFurnaceNo;
    const pct = Math.min(100, Math.max(0, ((m.t_min || 0) / (m.duration_min || 65)) * 100));
    const stName = m.stage || stageName(m.t_min || 0, m.duration_min || 65);
    const plcBadge = m.plc_source === 'PLC_LIVE'
      ? `<span class="fleet-src-badge plc-live">ПЛК</span>`
      : `<span class="fleet-src-badge model">ПОДКЛ.</span>`;

    return `
      <div class="fleet-card ${isSel ? 'active' : ''}" data-furnace="${fNo}">
        <div class="fleet-top">
          <span class="fleet-unit-name">
            <span class="fleet-dot"></span>
            ${fTitle}
          </span>
          <span class="fleet-tags-right">
            ${plcBadge}
            <span class="fleet-grade">${m.steel_grade}</span>
          </span>
        </div>
        <div class="fleet-metrics">
          <span class="fleet-stage-tag">${stName}</span>
          <span><b>${m.temp_c ?? 25} °C</b> · <b>${m.power_mw ?? 0} МВт</b></span>
        </div>
        <div class="fleet-bar-track">
          <div class="fleet-bar-fill" style="width: ${pct.toFixed(1)}%"></div>
        </div>
      </div>
    `;
  }).join('');

  const addMoreCard = actives.length < totalFurnaces
    ? `
      <div class="fleet-card fleet-add-card" id="fleetAddFurnaceBtn" title="Подключить или добавить печь в Центре ПЛК">
        <div class="fleet-add-title">+ ПОДКЛЮЧИТЬ ПЕЧЬ</div>
        <div class="fleet-add-sub">Активно агрегатов: ${actives.length} из ${totalFurnaces}</div>
      </div>
    `
    : `
      <div class="fleet-card fleet-add-card" id="fleetAddFurnaceBtn" title="Добавить новую печь (ПЛК) в систему">
        <div class="fleet-add-title">+ ДОБАВИТЬ ПЕЧЬ (ПЛК)</div>
        <div class="fleet-add-sub">В работе все ${totalFurnaces} из ${totalFurnaces} печей</div>
      </div>
    `;

  bar.innerHTML = cardsHtml + addMoreCard;

  bar.querySelectorAll('.fleet-card[data-furnace]').forEach(card => {
    card.addEventListener('click', () => {
      const fNo = Number(card.dataset.furnace);
      if (fNo && fNo !== selectedFurnaceNo) {
        selectedFurnaceNo = fNo;
        previewStageOverride = null;
        document.querySelectorAll('.step-node').forEach(n => n.classList.remove('preview-selected'));
        tickLive(false);
      }
    });
  });

  document.getElementById('fleetAddFurnaceBtn')?.addEventListener('click', () => {
    switchView('plc');
  });
}

function updateMeltTitles(melt) {
  const fNo = melt.furnace_no || selectedFurnaceNo;
  const fTitle = melt.furnace_name || `ДСП-135 №${fNo}`;
  document.getElementById('liveMeltNum').textContent = fTitle;
  document.getElementById('stepperMeltNum').textContent = melt.num;
  const stepperTitle = document.getElementById('stepperFurnaceTitle');
  if (stepperTitle) {
    stepperTitle.textContent = `Цикл плавки · ${fTitle} (${melt.steel_grade})`;
  }
  const infoEl = document.getElementById('liveMeltInfo');
  if (infoEl) {
    infoEl.textContent = `Плавка ${melt.num} · ${melt.steel_grade} · ${melt.mass_t} т`;
  }
}

function setupStagePreviewClicks() {
  const stagePresets = {
    'Завалка':   { temp_c: 520,  power_mw: 0.0,  stage: 'Завалка' },
    'Плавление': { temp_c: 1540, power_mw: 43.5, stage: 'Плавление' },
    'Доводка':   { temp_c: 1635, power_mw: 31.0, stage: 'Доводка' },
    'Выпуск':    { temp_c: 1625, power_mw: 0.0,  stage: 'Выпуск' }
  };

  document.querySelectorAll('.step-node').forEach(node => {
    node.addEventListener('click', () => {
      const st = node.dataset.stage;
      if (!st || !stagePresets[st]) return;

      document.querySelectorAll('.step-node').forEach(n => n.classList.remove('preview-selected'));

      if (previewStageOverride === st) {
        previewStageOverride = null;
        if (previewTimeout) clearTimeout(previewTimeout);
        return;
      }

      previewStageOverride = st;
      node.classList.add('preview-selected');

      const preset = stagePresets[st];
      if (furnace3D) {
        furnace3D.update(preset);
      }
      document.getElementById('liveStage').textContent = `${st} (осмотр)`;

      if (previewTimeout) clearTimeout(previewTimeout);
      previewTimeout = setTimeout(() => {
        previewStageOverride = null;
        document.querySelectorAll('.step-node').forEach(n => n.classList.remove('preview-selected'));
      }, 9000);
    });
  });
}

async function tickLive(advanceSimulation = true) {
  if (advanceSimulation) {
    await call('live:tick');
  }
  const sum = await call('summary', { furnace_no: selectedFurnaceNo });
  if (!sum) return;

  if (sum.plc) {
    syncGlobalPlcBadges(sum.plc);
  }

  document.getElementById('kpiToday').textContent = sum.meltsToday;
  document.getElementById('kpiMonth').textContent = sum.meltsMonth;
  document.getElementById('kpiEnergy').textContent = fmtNum(sum.avgEnergyPerT);
  document.getElementById('kpiDuration').textContent = sum.avgDuration;

  const actives = sum.actives || [];
  const totalFurnaces = sum.plc?.totalFurnaces || (sum.plc?.furnaces || []).length || 4;
  setDashboardConnectedLayout(actives.length > 0);
  if (!actives.length || !sum.active) {
    return;
  }

  if (!actives.some(a => a.furnace_no === selectedFurnaceNo)) {
    selectedFurnaceNo = actives[0].furnace_no;
  }

  renderFurnaceFleet(actives, totalFurnaces);

  const sig = actives.map(a => a.id).join(',');
  if (lastActiveIdsSignature && lastActiveIdsSignature !== sig) {
    loadMelts();
    loadAlerts();
  }
  lastActiveIdsSignature = sig;

  const targetActive = actives.find(a => a.furnace_no === selectedFurnaceNo) || sum.active;
  const detail = await call('melt:detail', { id: targetActive.id });
  if (!detail) return;

  const { melt, points } = detail;
  updateMeltTitles(melt);

  const last = points[points.length - 1] || { t_min: 0, temp_c: 25, power_mw: 0 };

  const currentStage = stageName(last.t_min, melt.duration_min);
  if (!previewStageOverride) {
    document.getElementById('liveStage').textContent = currentStage;
  }

  const progressPct = Math.min(100, Math.max(0, (last.t_min / melt.duration_min) * 100));

  // 1. Степпер
  updateStageStepper(last.t_min, melt.duration_min, currentStage, progressPct);

  // 2. Параметры печи
  document.getElementById('paramTemp').textContent = `${last.temp_c} °C`;
  document.getElementById('meterTempFill').style.width = `${Math.min(100, (last.temp_c / 1800) * 100)}%`;

  document.getElementById('paramPower').textContent = `${last.power_mw} МВт`;
  document.getElementById('meterPowerFill').style.width = `${Math.min(100, (last.power_mw / 55) * 100)}%`;

  document.getElementById('paramTime').textContent = `${last.t_min.toFixed(1)} / ${melt.duration_min} мин`;
  document.getElementById('paramEnergy').textContent = `${fmtNum(melt.energy_kwh)} кВт·ч`;
  document.getElementById('paramMass').textContent = `${melt.mass_t} т`;
  document.getElementById('paramGrade').textContent = melt.steel_grade;
  document.getElementById('paramOperator').textContent = melt.operator;

  // 3. Синхронизация 3D
  if (furnace3D && !previewStageOverride) {
    furnace3D.update({
      temp_c: last.temp_c,
      power_mw: last.power_mw,
      stage: currentStage,
      t_min: last.t_min,
      duration_min: melt.duration_min
    });
  }

  // 4. Последние события выбранной печи
  const alerts = detail.alerts.slice(-3).reverse();
  document.getElementById('liveAlerts').innerHTML = alerts.length
    ? alerts.map(a => `<div class="mini-alert ${a.level}">
        <b>${a.message}</b>
        <span class="when">${a.t_min ?? '—'} мин</span>
      </div>`).join('')
    : `<div class="mini-alert info">ДСП-135 №${melt.furnace_no || selectedFurnaceNo}: режим штатный</div>`;
}

function updateStageStepper(t_min, duration_min, currentStage, progressPct) {
  const fillEl = document.getElementById('stepperFill');
  if (fillEl) fillEl.style.width = `${progressPct.toFixed(1)}%`;
  document.getElementById('stepperTime').textContent = `${t_min.toFixed(1)} / ${duration_min} мин`;
  document.getElementById('stepperPercent').textContent = `${progressPct.toFixed(0)}%`;

  const bounds = [0, 8 / 65, 38 / 65, 58 / 65, 1.0];
  const normProgress = Math.min(1, Math.max(0, t_min / (duration_min || 65)));

  const stageOrder = ['Завалка', 'Плавление', 'Доводка', 'Выпуск'];
  const curIdx = stageOrder.indexOf(currentStage);

  stageOrder.forEach((st, idx) => {
    const el = document.getElementById('step-' + idx);
    const barEl = document.getElementById('stepBar-' + idx);
    const stateEl = document.getElementById('stepState-' + idx);
    if (!el) return;

    const startP = bounds[idx];
    const endP = bounds[idx + 1];
    const stagePct = Math.min(100, Math.max(0, ((normProgress - startP) / (endP - startP)) * 100));

    el.classList.remove('completed', 'active');
    if (idx < curIdx) {
      el.classList.add('completed');
      if (barEl) barEl.style.width = '100%';
      if (stateEl) stateEl.textContent = 'Готово';
    } else if (idx === curIdx) {
      el.classList.add('active');
      if (barEl) barEl.style.width = `${stagePct.toFixed(0)}%`;
      if (stateEl) stateEl.textContent = `${stagePct.toFixed(0)}%`;
    } else {
      if (barEl) barEl.style.width = '0%';
      if (stateEl) stateEl.textContent = '—';
    }
  });
}

// ==========================================================================
// 4. Журнал плавок (Melts)
// ==========================================================================
let meltsListenersBound = false;

async function loadMelts() {
  cachedMelts = await call('melt:list');
  const allAlerts = await call('alerts:list');

  const alertsByMelt = {};
  allAlerts.forEach(a => {
    if (a.melt_num) {
      alertsByMelt[a.melt_num] = (alertsByMelt[a.melt_num] || 0) + 1;
    }
  });

  cachedMelts.forEach(m => {
    m.alertCount = alertsByMelt[m.num] || 0;
  });

  updateMeltsSummary();

  const grades = [...new Set(cachedMelts.map(r => r.steel_grade))];
  const sel = document.getElementById('gradeFilter');
  const prevGrade = sel.value;
  sel.innerHTML = '<option value="">Все марки стали</option>' + grades.map(g => `<option value="${g}">${g}</option>`).join('');
  sel.value = prevGrade;

  applyMeltsFilter();

  if (!meltsListenersBound) {
    meltsListenersBound = true;
    document.getElementById('meltsSearchInput').addEventListener('input', applyMeltsFilter);
    document.getElementById('furnaceFilter')?.addEventListener('change', applyMeltsFilter);
    document.getElementById('gradeFilter').addEventListener('change', applyMeltsFilter);
    document.getElementById('statusFilter').addEventListener('change', applyMeltsFilter);

    document.getElementById('detailClose').addEventListener('click', () => {
      document.getElementById('meltDetail').style.display = 'none';
    });
  }
}

function updateMeltsSummary() {
  const total = cachedMelts.length;
  const activeCount = cachedMelts.filter(m => m.status === 'active').length;
  const completed = cachedMelts.filter(m => m.status === 'completed').length;
  const warned = cachedMelts.filter(m => m.alertCount > 0).length;

  document.getElementById('navMeltsCount').textContent = total;
  document.getElementById('totalMeltsCount').textContent = total;
  const activeEl = document.getElementById('activeMeltsCount');
  if (activeEl) activeEl.textContent = activeCount;
  document.getElementById('completedMeltsCount').textContent = completed;
  document.getElementById('warnMeltsCount').textContent = warned;
}

function applyMeltsFilter() {
  const query = document.getElementById('meltsSearchInput').value.trim().toLowerCase();
  const furnace = document.getElementById('furnaceFilter')?.value || '';
  const grade = document.getElementById('gradeFilter').value;
  const status = document.getElementById('statusFilter').value;

  const filtered = cachedMelts.filter(m => {
    const matchQuery = !query || m.num.toLowerCase().includes(query) || m.operator.toLowerCase().includes(query);
    const matchFurnace = !furnace || String(m.furnace_no || 1) === furnace;
    const matchGrade = !grade || m.steel_grade === grade;
    const matchStatus = !status || m.status === status;
    return matchQuery && matchFurnace && matchGrade && matchStatus;
  });

  renderMeltsTable(filtered);
}

function renderMeltsTable(rows) {
  const tbody = document.querySelector('#meltsTable tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 24px; color: var(--text-muted)">Записей по заданным критериям не найдено</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const fNo = r.furnace_no || 1;
    const specEnergy = r.mass_t > 0 ? Math.round(r.energy_kwh / r.mass_t) : 0;
    const alertBadge = r.alertCount > 0
      ? `<span class="warn-count-badge">ЗАМЕЧАНИЙ: ${r.alertCount}</span>`
      : `<span class="ok-badge">НОРМА</span>`;

    return `
      <tr data-id="${r.id}" class="${r.status === 'active' ? 'active-melt' : ''}">
        <td><span class="tag-furnace">ДСП №${fNo}</span></td>
        <td><b>${r.num}</b></td>
        <td>${fmtTime(r.started_at)}</td>
        <td><span class="tag-grade">${r.steel_grade}</span></td>
        <td>${r.mass_t}</td>
        <td>${fmtNum(r.energy_kwh)}</td>
        <td><b>${specEnergy}</b> кВт·ч/т</td>
        <td>${r.duration_min}</td>
        <td><span class="status ${r.status}">${r.status === 'active' ? 'В РАБОТЕ' : 'ЗАВЕРШЕНА'}</span></td>
        <td>${r.operator}</td>
        <td>${alertBadge}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => showMeltDetail(Number(tr.dataset.id)));
  });
}

async function showMeltDetail(id) {
  const d = await call('melt:detail', { id });
  if (!d) return;

  const { melt, points, alerts } = d;
  const fNo = melt.furnace_no || 1;
  const panel = document.getElementById('meltDetail');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  document.getElementById('detailTitle').textContent = `ТЕХНОЛОГИЧЕСКИЙ ПАСПОРТ: ДСП-135 №${fNo} · ПЛАВКА ${melt.num}`;
  document.getElementById('detailSub').textContent =
    `Агрегат ДСП №${fNo} · Марка ${melt.steel_grade} · Масса ${melt.mass_t} т · Начало: ${fmtTime(melt.started_at)} · Сталевар: ${melt.operator}`;

  const specEnergy = melt.mass_t > 0 ? Math.round(melt.energy_kwh / melt.mass_t) : 0;

  document.getElementById('detailKpis').innerHTML = `
    <div class="detail-kpi-box">
      <span class="detail-kpi-lbl">МАССА МЕТАЛЛА</span>
      <div class="detail-kpi-val">${melt.mass_t} т</div>
    </div>
    <div class="detail-kpi-box">
      <span class="detail-kpi-lbl">РАСХОД ЭНЕРГИИ</span>
      <div class="detail-kpi-val">${fmtNum(melt.energy_kwh)} кВт·ч</div>
    </div>
    <div class="detail-kpi-box">
      <span class="detail-kpi-lbl">УДЕЛЬНЫЙ РАСХОД</span>
      <div class="detail-kpi-val" style="color:var(--accent)">${specEnergy} кВт·ч/т</div>
    </div>
    <div class="detail-kpi-box">
      <span class="detail-kpi-lbl">ДЛИТЕЛЬНОСТЬ</span>
      <div class="detail-kpi-val">${melt.duration_min} мин</div>
    </div>
    <div class="detail-kpi-box">
      <span class="detail-kpi-lbl">ЗАФИКСИРОВАНО СОБЫТИЙ</span>
      <div class="detail-kpi-val" style="color:${alerts.length ? 'var(--warn)' : 'var(--ok)'}">${alerts.length}</div>
    </div>`;

  const ctx = document.getElementById('detailChart').getContext('2d');
  const labels = points.map(p => p.t_min);
  if (detailChart) detailChart.destroy();

  detailChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Температура металла, °C',
          data: points.map(p => p.temp_c),
          borderColor: '#c87a28',
          backgroundColor: 'rgba(200, 122, 40, 0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          yAxisID: 'y'
        },
        {
          label: 'Мощность, МВт',
          data: points.map(p => p.power_mw),
          borderColor: '#6b8ba8',
          tension: 0.35,
          pointRadius: 0,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94989e', font: { size: 11, weight: '600' } } }
      },
      scales: {
        x: {
          title: { display: true, text: 'мин от завалки', color: '#94989e' },
          ticks: { color: '#94989e' },
          grid: { color: '#2c2f35' }
        },
        y: {
          ticks: { color: '#c87a28' },
          grid: { color: '#2c2f35' }
        },
        y1: {
          position: 'right',
          ticks: { color: '#6b8ba8' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });

  document.getElementById('detailAlerts').innerHTML = alerts.length
    ? '<div class="panel-title" style="margin-top:16px">ХРОНОЛОГИЯ СОБЫТИЙ ПЛАВКИ</div><div class="mini-alerts" style="margin-top:8px">' +
      alerts.map(a => `<div class="mini-alert ${a.level}">
        <b>${a.message}</b>
        <span class="when">Минута: ${a.t_min ?? '—'} · Фиксация: ${fmtTime(a.created_at)}</span>
      </div>`).join('') + '</div>'
    : '<div class="mini-alert info" style="margin-top:12px">Плавка выполнена в строгом соответствии с технологической картой</div>';
}

// ==========================================================================
// 5. Аварийные события (Alerts)
// ==========================================================================
let alertsListenersBound = false;

async function loadAlerts() {
  cachedAlerts = await call('alerts:list');
  document.getElementById('navAlertsCount').textContent = cachedAlerts.length;

  if (!alertsListenersBound) {
    alertsListenersBound = true;
    document.querySelectorAll('.alert-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.alert-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentAlertFilter = btn.dataset.filter;
        renderAlertsTable();
      });
    });
  }

  renderAlertsTable();
}

function renderAlertsTable() {
  const rows = currentAlertFilter === 'all'
    ? cachedAlerts
    : cachedAlerts.filter(a => a.level === currentAlertFilter);

  const lvlName = { warn: 'ПРЕДУПРЕЖДЕНИЕ', crit: 'АВАРИЯ', info: 'ИНФОРМАЦИЯ' };
  const tbody = document.querySelector('#alertsTable tbody');

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--text-muted)">Событий выбранной категории не обнаружено</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${fmtTime(r.created_at)}</td>
      <td><span class="tag-furnace">ДСП №${r.furnace_no || 1}</span></td>
      <td><b>${r.melt_num ?? '—'}</b></td>
      <td>${r.t_min !== null && r.t_min !== undefined ? r.t_min + ' мин' : '—'}</td>
      <td><span class="lvl ${r.level}">${lvlName[r.level]}</span></td>
      <td><b>${r.message}</b></td>
    </tr>`).join('');
}

// ==========================================================================
// 6. Марочник сталей в разделе «Справочник»
// ==========================================================================
async function loadGradesReference() {
  const grades = await call('grades:list');
  const tbody = document.querySelector('#gradesTable tbody');
  if (!tbody || !Array.isArray(grades)) return;

  const gradeApps = {
    'Ст3сп': 'ДСП-135 №1 · Рядовой строительный прокат, уголки, швеллеры, арматурный прокат',
    '09Г2С': 'ДСП-135 №2 · Низколегированная мостовая и трубная сталь для эксплуатации при t до -70 °C',
    '40Х':   'ДСП-135 №3 · Машиностроение: валы, оси, зубчатые венцы повышенной прочности',
    '65Г':   'ДСП-135 №4 · Рессорно-пружинная сталь с высокой упругостью и стойкостью к истиранию'
  };

  tbody.innerHTML = grades.map(g => `
    <tr>
      <td><b><span class="tag-grade">${g.name}</span></b></td>
      <td>${g.c_min}–${g.c_max} %</td>
      <td>${g.si_min}–${g.si_max} %</td>
      <td>${g.mn_min}–${g.mn_max} %</td>
      <td style="color:var(--text-muted)">${gradeApps[g.name] || 'Конструкционная сталь'}</td>
    </tr>`).join('');
}

// ==========================================================================
// 8. Шлюз АСУ ТП и подключение реальных ПЛК (OPC UA / Modbus TCP / MQTT / HTTP)
// ==========================================================================
let plcUnitsRenderedOnce = false;
let lastFurnaceListSig = '';

function syncGlobalPlcBadges(plc) {
  if (!plc) return;
  const furnaces = plc.furnaces || [];
  const totalCount = plc.totalFurnaces ?? (furnaces.length || 4);
  const connCount = plc.connectedCount ?? furnaces.filter(u => u.connected).length;

  const navBadge = document.getElementById('navPlcBadge');
  if (navBadge) {
    navBadge.textContent = `${connCount}/${totalCount}`;
    navBadge.classList.toggle('live-chip', connCount > 0);
  }

  const connState = document.getElementById('connState');
  if (connState) {
    connState.textContent = plc.gatewayRunning
      ? `ПЕЧЕЙ: ${connCount}/${totalCount} · ШЛЮЗ :${plc.gatewayPort}`
      : 'БД: SQLite CONNECTED';
  }

  // Синхронизируем слоты на стартовом пустом экране и селекты печей при изменении состава цеха
  const listSig = furnaces.map(f => `${f.furnace_no}:${f.name}:${f.controller}:${f.connected ? 1 : 0}`).join('|');
  if (listSig !== lastFurnaceListSig) {
    lastFurnaceListSig = listSig;

    const emptySlotsEl = document.getElementById('dashEmptySlots');
    if (emptySlotsEl && furnaces.length) {
      emptySlotsEl.innerHTML = furnaces.map(f => {
        const title = f.name || `ДСП-135 №${f.furnace_no}`;
        return `<div class="dash-slot-chip">${title} · <span>${f.connected ? 'ПОДКЛЮЧЕНА' : 'ОТКЛЮЧЕНА'}</span></div>`;
      }).join('');
    }

    const injSel = document.getElementById('injFurnace');
    if (injSel && furnaces.length) {
      const prevVal = injSel.value;
      injSel.innerHTML = furnaces.map(f => {
        const title = f.name || `ДСП-135 №${f.furnace_no}`;
        return `<option value="${f.furnace_no}">${title} (${f.controller})</option>`;
      }).join('');
      if (furnaces.some(f => String(f.furnace_no) === prevVal)) {
        injSel.value = prevVal;
      }
    }

    const filterSel = document.getElementById('furnaceFilter');
    if (filterSel && furnaces.length) {
      const prevFilter = filterSel.value;
      filterSel.innerHTML = `<option value="">Все печи (${furnaces.length} агр.)</option>` +
        furnaces.map(f => `<option value="${f.furnace_no}">${f.name || ('ДСП-135 №' + f.furnace_no)}</option>`).join('');
      filterSel.value = prevFilter;
    }
  }

  // Если открыта вкладка ПЛК, обновляем счётчики и лог кадров без сброса фокуса в инпутах
  const plcView = document.getElementById('view-plc');
  if (plcView && plcView.classList.contains('active')) {
    updatePlcRuntimeWidgets(plc);
  }
}

function suggestNextFurnaceDefaults(plc) {
  const nums = (plc?.furnaces || []).map(f => Number(f.furnace_no)).filter(Boolean);
  let nextNo = 1;
  while (nums.includes(nextNo)) nextNo++;
  const noInput = document.getElementById('newFurnaceNo');
  const nameInput = document.getElementById('newFurnaceName');
  if (noInput) noInput.value = nextNo;
  if (nameInput) nameInput.value = `ДСП-135 №${nextNo}`;
}

function openAddFurnacePanel(plc) {
  const panel = document.getElementById('addFurnacePanel');
  if (!panel) return;
  if (plc) suggestNextFurnaceDefaults(plc);
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function initPlcView() {
  const plc = await call('plc:status');
  if (!plc) return;

  syncGlobalPlcBadges(plc);
  renderPlcUnitsCards(plc);
  updatePlcRuntimeWidgets(plc);
  suggestNextFurnaceDefaults(plc);

  // Открытие / закрытие панели регистрации новой печи
  document.getElementById('btnOpenAddFurnace')?.addEventListener('click', async () => {
    const cur = await call('plc:status');
    openAddFurnacePanel(cur);
  });

  document.getElementById('btnCloseAddFurnace')?.addEventListener('click', () => {
    const panel = document.getElementById('addFurnacePanel');
    if (panel) panel.style.display = 'none';
  });

  document.getElementById('newFurnaceNo')?.addEventListener('input', e => {
    const n = Number(e.target.value) || 1;
    const nameInput = document.getElementById('newFurnaceName');
    if (nameInput && (!nameInput.value || /^ДСП-135 №\d+$/i.test(nameInput.value.trim()))) {
      nameInput.value = `ДСП-135 №${n}`;
    }
  });

  // Подтверждение добавления новой печи (ПЛК)
  document.getElementById('btnConfirmAddFurnace')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnConfirmAddFurnace');
    const furnace_no = Number(document.getElementById('newFurnaceNo')?.value) || undefined;
    const name = document.getElementById('newFurnaceName')?.value.trim();
    const steel_grade = document.getElementById('newFurnaceGrade')?.value || 'Ст3сп';
    const controller = document.getElementById('newFurnaceController')?.value.trim() || 'Siemens SIMATIC S7-1518F';
    const protocol = document.getElementById('newFurnaceProtocol')?.value || 'OPC UA';
    const host = document.getElementById('newFurnaceHost')?.value.trim() || '127.0.0.1';
    const port = Number(document.getElementById('newFurnacePort')?.value) || 4580;
    const autoConnect = Boolean(document.getElementById('newFurnaceAutoConnect')?.checked);

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'РЕГИСТРАЦИЯ И ПРОВЕРКА...';
    }

    const res = await call('plc:add', {
      furnace_no,
      name,
      steel_grade,
      controller,
      protocol,
      host,
      port,
      autoConnect
    });

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'СОЗДАТЬ И ДОБАВИТЬ ПЕЧЬ';
    }

    if (res && res.ok) {
      if (autoConnect && res.furnace_no) {
        selectedFurnaceNo = res.furnace_no;
      }
      const panel = document.getElementById('addFurnacePanel');
      if (panel) panel.style.display = 'none';

      const updated = await call('plc:status');
      syncGlobalPlcBadges(updated);
      renderPlcUnitsCards(updated);
      updatePlcRuntimeWidgets(updated);
      suggestNextFurnaceDefaults(updated);
      await tickLive(false);
      await loadMelts();
    }
  });

  // Переключение режима источника телеметрии
  document.querySelectorAll('#plcModeSelector .plc-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.plcmode;
      const updated = await call('plc:config', { mode });
      updatePlcRuntimeWidgets(updated);
      tickLive(false);
    });
  });

  // Сохранение настроек IP / портов / узлов всех печей
  document.getElementById('btnSavePlcConfig')?.addEventListener('click', async () => {
    const furnaces = collectPlcCardsConfig();
    const updated = await call('plc:config', { furnaces });
    syncGlobalPlcBadges(updated);
    renderPlcUnitsCards(updated);
    updatePlcRuntimeWidgets(updated);
    const btn = document.getElementById('btnSavePlcConfig');
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = 'КОНФИГУРАЦИЯ СОХРАНЕНА';
      setTimeout(() => { btn.textContent = prev; }, 1600);
    }
  });

  // Запуск / остановка потокового эмулятора внешних ПЛК по HTTP
  document.getElementById('btnTogglePlcStream')?.addEventListener('click', async () => {
    const cur = await call('plc:status');
    await call('plc:stream', { enable: !cur.virtualPlcActive });
    setTimeout(() => refreshPlcStatusOnly(false), 350);
  });

  // Синхронизация полей стенда инжекции со стадиями
  const stageDefaults = {
    'Завалка':   { t: 4.5,  temp: 560,  power: 14.0 },
    'Плавление': { t: 26.0, temp: 1545, power: 43.8 },
    'Доводка':   { t: 46.5, temp: 1635, power: 24.5 },
    'Выпуск':    { t: 60.5, temp: 1625, power: 0.0 }
  };

  document.getElementById('injStage')?.addEventListener('change', e => {
    const st = e.target.value;
    if (stageDefaults[st]) {
      document.getElementById('injTime').value = stageDefaults[st].t;
      document.getElementById('injTemp').value = stageDefaults[st].temp;
      document.getElementById('injPower').value = stageDefaults[st].power;
      updateCurlSample();
    }
  });

  ['injFurnace', 'injStage', 'injTemp', 'injPower', 'injTime', 'injGrade', 'injAlert'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateCurlSample);
    document.getElementById(id)?.addEventListener('change', updateCurlSample);
  });

  // Отправка реального пакета телеметрии в выбранную печь
  document.getElementById('btnSendPlcPacket')?.addEventListener('click', async () => {
    const fNo = Number(document.getElementById('injFurnace').value) || 1;
    const stage = document.getElementById('injStage').value;
    const temp_c = Number(document.getElementById('injTemp').value);
    const power_mw = Number(document.getElementById('injPower').value);
    const t_min = Number(document.getElementById('injTime').value);
    const steel_grade = document.getElementById('injGrade').value || undefined;
    const alertMsg = document.getElementById('injAlert').value.trim();

    const packet = {
      furnace_no: fNo,
      stage,
      temp_c,
      power_mw,
      t_min,
      steel_grade,
      alert: alertMsg ? { level: 'warn', message: alertMsg } : undefined
    };

    const res = await call('plc:inject', packet);
    const sendBtn = document.getElementById('btnSendPlcPacket');
    if (res && res.ok === false && sendBtn) {
      const prev = sendBtn.textContent;
      sendBtn.textContent = `ОШИБКА: ПЕЧЬ №${fNo} НЕ ПОДКЛЮЧЕНА`;
      setTimeout(() => { sendBtn.textContent = prev; }, 2200);
    } else {
      selectedFurnaceNo = fNo;
    }
    await refreshPlcStatusOnly(false);
    await tickLive(false);
    if (alertMsg && (!res || res.ok !== false)) {
      loadAlerts();
      document.getElementById('injAlert').value = '';
    }
  });

  updateCurlSample();
}

function updateCurlSample() {
  const pre = document.getElementById('plcCurlSample');
  if (!pre) return;
  const payload = {
    furnace_no: Number(document.getElementById('injFurnace')?.value || 1),
    temp_c: Number(document.getElementById('injTemp')?.value || 1615),
    power_mw: Number(document.getElementById('injPower')?.value || 43.8),
    t_min: Number(document.getElementById('injTime')?.value || 28.5),
    stage: document.getElementById('injStage')?.value || 'Плавление'
  };
  const grade = document.getElementById('injGrade')?.value;
  if (grade) payload.steel_grade = grade;
  const jsonStr = JSON.stringify(payload).replace(/"/g, '\\"');
  pre.textContent = `curl -X POST http://127.0.0.1:4580/api/v1/telemetry -H "Content-Type: application/json" -d "${jsonStr}"`;
}

async function refreshPlcStatusOnly(rebuildCards = false) {
  const plc = await call('plc:status');
  if (!plc) return;
  syncGlobalPlcBadges(plc);
  if (rebuildCards || !plcUnitsRenderedOnce) {
    renderPlcUnitsCards(plc);
  }
  updatePlcRuntimeWidgets(plc);
}

function getFurnaceStatePresentation(f) {
  if (!f.connected) {
    return {
      cardClass: 'offline',
      badgeClass: 'offline',
      badgeLabel: 'ОТКЛЮЧЕНА'
    };
  }
  if (f.effective_source === 'PLC_LIVE') {
    return {
      cardClass: 'online',
      badgeClass: 'plc-live',
      badgeLabel: 'ПОДКЛЮЧЕНА · ПЛК'
    };
  }
  if (f.effective_source === 'WAITING_PLC') {
    return {
      cardClass: 'standby',
      badgeClass: 'waiting',
      badgeLabel: 'ПОДКЛЮЧЕНА · ОЖИДАНИЕ'
    };
  }
  return {
    cardClass: 'online',
    badgeClass: 'model',
    badgeLabel: 'ПОДКЛЮЧЕНА · МОДЕЛЬ'
  };
}

function renderPlcUnitsCards(plc) {
  const grid = document.getElementById('plcUnitsGrid');
  if (!grid || !plc || !Array.isArray(plc.furnaces)) return;
  plcUnitsRenderedOnce = true;

  const protocols = ['OPC UA', 'Modbus TCP', 'MQTT / HTTP', 'Siemens S7comm'];
  const canDelete = plc.furnaces.length > 1;

  const cardsHtml = plc.furnaces.map(f => {
    const fNo = f.furnace_no;
    const fTitle = f.name || `ДСП-135 №${fNo}`;
    const pres = getFurnaceStatePresentation(f);
    const isConn = Boolean(f.connected);

    return `
      <div class="plc-unit-card ${pres.cardClass}" id="plcCard-${fNo}" data-furnace="${fNo}">
        <div class="plc-unit-head">
          <span class="plc-unit-title">${fTitle}</span>
          <div class="plc-unit-head-right">
            <span class="fleet-src-badge ${pres.badgeClass}" id="plcUnitState-${fNo}">
              ${pres.badgeLabel}
            </span>
            ${canDelete ? `<button class="plc-del-btn" data-del-furnace="${fNo}" title="Удалить узел печи №${fNo}">✕</button>` : ''}
          </div>
        </div>
        <div class="plc-unit-sub">${f.controller} · Марка: <b>${f.steel_grade || 'Ст3сп'}</b></div>

        <label>Промышленный протокол
          <select class="plc-inp-proto" data-fno="${fNo}">
            ${protocols.map(p => `<option value="${p}" ${f.protocol === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </label>

        <div class="plc-field-grid">
          <label>IP-адрес ПЛК / Шлюза
            <input type="text" class="plc-inp-host" data-fno="${fNo}" value="${f.host}">
          </label>
          <label>Порт TCP
            <input type="number" class="plc-inp-port" data-fno="${fNo}" value="${f.port}">
          </label>
        </div>

        <label>Узел OPC UA / Регистры / Топик
          <input type="text" class="plc-inp-endpoint" data-fno="${fNo}" value="${(f.endpoint || '').replace(/"/g, '&quot;')}">
        </label>

        <div class="plc-unit-meta">
          <span>Пакеты: <b id="plcUnitRx-${fNo}">${f.rx_count || 0}</b></span>
          <span>Задержка: <b id="plcUnitPing-${fNo}">${f.ping_ms !== null ? f.ping_ms + ' мс' : '—'}</b></span>
        </div>

        <div class="plc-unit-actions">
          <button
            class="plc-connect-btn ${isConn ? 'disconnect' : 'connect'}"
            id="plcConnBtn-${fNo}"
            data-connect-furnace="${fNo}"
            data-connected="${isConn ? 'true' : 'false'}"
          >
            ${isConn ? `ОТКЛЮЧИТЬ ПЕЧЬ №${fNo}` : `ПОДКЛЮЧИТЬ ПЕЧЬ №${fNo}`}
          </button>
          <button class="plc-test-btn" data-test-furnace="${fNo}" title="Проверить доступность узла по TCP">
            ТЕСТ КАНАЛА
          </button>
        </div>
      </div>
    `;
  }).join('');

  const addUnitCardHtml = `
    <div class="plc-unit-card plc-add-unit-card" id="plcCardAddBtn">
      <div class="plc-add-unit-inner">
        <div class="plc-add-unit-plus">+</div>
        <div class="plc-add-unit-title">ДОБАВИТЬ ПЕЧЬ (ПЛК)</div>
        <div class="plc-add-unit-desc">Регистрация нового агрегата ДСП / ДСП-135 в системе мониторинга цеха (всего в списке: ${plc.furnaces.length})</div>
      </div>
    </div>
  `;

  grid.innerHTML = cardsHtml + addUnitCardHtml;

  document.getElementById('plcCardAddBtn')?.addEventListener('click', () => {
    openAddFurnacePanel(plc);
  });

  grid.querySelectorAll('.plc-del-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const fNo = Number(btn.dataset.delFurnace);
      const res = await call('plc:remove', { furnace_no: fNo });
      if (res && res.ok) {
        await refreshPlcStatusOnly(true);
        await tickLive(false);
      }
    });
  });

  grid.querySelectorAll('.plc-connect-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fNo = Number(btn.dataset.connectFurnace);
      const currentlyConnected = btn.dataset.connected === 'true';

      const furnaces = collectPlcCardsConfig();
      await call('plc:config', { furnaces });

      if (!currentlyConnected) {
        btn.disabled = true;
        btn.textContent = 'ПРОВЕРКА КАНАЛА...';
        const res = await call('plc:connect', { furnace_no: fNo, connect: true });
        btn.disabled = false;
        if (!res.ok) {
          btn.textContent = 'ОШИБКА КАНАЛА ПЛК';
          await refreshPlcStatusOnly(false);
          setTimeout(() => {
            btn.textContent = `ПОДКЛЮЧИТЬ ПЕЧЬ №${fNo}`;
          }, 2200);
          return;
        }
        selectedFurnaceNo = fNo;
      } else {
        await call('plc:connect', { furnace_no: fNo, connect: false });
      }

      await refreshPlcStatusOnly(false);
      await tickLive(false);
    });
  });

  grid.querySelectorAll('.plc-test-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fNo = Number(btn.dataset.testFurnace);
      const furnaces = collectPlcCardsConfig();
      await call('plc:config', { furnaces });
      btn.textContent = 'ТЕСТ TCP...';
      const res = await call('plc:test', { furnace_no: fNo });
      btn.textContent = res.ok ? `OK (${res.ping_ms} МС)` : 'НЕТ ОТВЕТА';
      await refreshPlcStatusOnly(false);
      setTimeout(() => {
        btn.textContent = 'ТЕСТ КАНАЛА';
      }, 2200);
    });
  });
}

function collectPlcCardsConfig() {
  const furnaces = {};
  document.querySelectorAll('#plcUnitsGrid .plc-unit-card[data-furnace]').forEach(card => {
    const fNo = Number(card.dataset.furnace);
    if (!fNo) return;
    const protoEl = card.querySelector(`.plc-inp-proto[data-fno="${fNo}"]`);
    const hostEl = card.querySelector(`.plc-inp-host[data-fno="${fNo}"]`);
    const portEl = card.querySelector(`.plc-inp-port[data-fno="${fNo}"]`);
    const epEl = card.querySelector(`.plc-inp-endpoint[data-fno="${fNo}"]`);
    if (protoEl && hostEl && portEl && epEl) {
      furnaces[fNo] = {
        protocol: protoEl.value,
        host: hostEl.value,
        port: Number(portEl.value) || 4580,
        endpoint: epEl.value
      };
    }
  });
  return furnaces;
}

function updatePlcRuntimeWidgets(plc) {
  if (!plc) return;

  document.querySelectorAll('#plcModeSelector .plc-mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.plcmode === plc.mode);
  });

  const rxEl = document.getElementById('plcTotalRx');
  if (rxEl) rxEl.textContent = fmtNum(plc.totalRxPackets || 0);

  const urlEl = document.getElementById('plcGatewayUrl');
  if (urlEl) urlEl.textContent = `POST ${plc.gatewayUrl}`;

  const streamBtn = document.getElementById('btnTogglePlcStream');
  if (streamBtn) {
    streamBtn.classList.toggle('stream-on', Boolean(plc.virtualPlcActive));
    streamBtn.textContent = plc.virtualPlcActive
      ? 'ЭМУЛЯТОР ПЛК: АКТИВЕН (ОСТАНОВИТЬ)'
      : 'ЗАПУСТИТЬ ЭМУЛЯТОР ПЛК (HTTP ПОТОК)';
  }

  // Обновляем метаданные и кнопки подключения карточек контроллеров без перерисовки инпутов
  (plc.furnaces || []).forEach(f => {
    const fNo = f.furnace_no;
    const rxNode = document.getElementById(`plcUnitRx-${fNo}`);
    if (rxNode) rxNode.textContent = f.rx_count || 0;
    const pingNode = document.getElementById(`plcUnitPing-${fNo}`);
    if (pingNode) pingNode.textContent = f.ping_ms !== null ? `${f.ping_ms} мс` : '—';

    const pres = getFurnaceStatePresentation(f);
    const stNode = document.getElementById(`plcUnitState-${fNo}`);
    if (stNode) {
      stNode.className = `fleet-src-badge ${pres.badgeClass}`;
      stNode.textContent = pres.badgeLabel;
    }

    const cardNode = document.getElementById(`plcCard-${fNo}`);
    if (cardNode) {
      cardNode.className = `plc-unit-card ${pres.cardClass}`;
    }

    const connBtn = document.getElementById(`plcConnBtn-${fNo}`);
    if (connBtn && !connBtn.disabled) {
      const isConn = Boolean(f.connected);
      connBtn.dataset.connected = isConn ? 'true' : 'false';
      connBtn.className = `plc-connect-btn ${isConn ? 'disconnect' : 'connect'}`;
      connBtn.textContent = isConn ? `ОТКЛЮЧИТЬ ПЕЧЬ №${fNo}` : `ПОДКЛЮЧИТЬ ПЕЧЬ №${fNo}`;
    }
  });

  // Рендерим терминал кадров обмена
  const logEl = document.getElementById('plcPacketLog');
  if (logEl && Array.isArray(plc.packetLog)) {
    if (!plc.packetLog.length) {
      logEl.innerHTML = `<div class="plc-log-line info">Ожидание пакетов телеметрии на порту ${plc.gatewayPort}...</div>`;
    } else {
      logEl.innerHTML = plc.packetLog.map(item => {
        const timeStr = new Date(item.ts).toLocaleTimeString('ru-RU');
        return `
          <div class="plc-log-line ${item.dir}">
            <span class="plc-log-ts">[${timeStr}]</span>
            <span class="plc-log-proto">[${item.protocol}]</span>
            <span class="plc-log-msg">${item.summary}</span>
          </div>
        `;
      }).join('');
    }
  }
}

// ==========================================================================
// 9. Поиск по словарю
// ==========================================================================
function setupGlossarySearch() {
  const searchInput = document.getElementById('glossarySearch');
  if (!searchInput) return;

  searchInput.addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#glossaryList .g-item').forEach(item => {
      const term = item.querySelector('b').textContent.toLowerCase();
      const desc = item.querySelector('span').textContent.toLowerCase();
      if (!q || term.includes(q) || desc.includes(q)) {
        item.classList.remove('hidden');
      } else {
        item.classList.add('hidden');
      }
    });
  });
}

// ==========================================================================
// 10. Старт приложения
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const clockEl = document.getElementById('clock');
  if (clockEl) clockEl.textContent = now.toLocaleTimeString('ru-RU');

  initFurnace();
  setupStagePreviewClicks();
  initPlcView();
  loadDashboard().then(() => {
    window.liveTimerId = setInterval(tickLive, 1500);
  });
  loadMelts();
  loadAlerts();
  loadGradesReference();
  setupGlossarySearch();
});

