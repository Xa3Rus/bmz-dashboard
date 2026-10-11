// Логика клиентской части «Цифровая плавка — БМЗ» (АРМ оператора ДСП-135)
// Управление 3D моделью, дашбордом реального времени, журналом плавок, расчётом шихты и справочниками

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
let shPieChart = null;

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

  // Переключение режимов 3D / График / Сплит
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      const viewport = document.getElementById('visViewport');
      viewport.className = `vis-viewport mode-${mode}`;

      setTimeout(() => {
        if (furnace3D) furnace3D.resize();
        if (liveChart) liveChart.resize();
      }, 50);
    });
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

function switchView(viewName) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  const navTarget = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
  if (navTarget) navTarget.classList.add('active');

  const viewTarget = document.getElementById('view-' + viewName);
  if (viewTarget) viewTarget.classList.add('active');

  const titles = {
    dashboard: ['Мониторинг плавки', 'Оперативная телеметрия параметров электродуговой печи в реальном времени'],
    melts: ['Журнал плавок', 'База технологических паспортов выплавки стали на агрегате ДСП-135'],
    alerts: ['Журнал событий', 'Автоматическая регистрация сигналов предупредительной и аварийной сигнализации'],
    shihta: ['Расчёт металлошихты', 'Оптимизация дозировки сырья, баланс углерода и расчёт потребности в кислороде'],
    materials: ['Справочники', 'Технологический состав сырья, заводские цены и требования марок стали'],
    help: ['Документация', 'Технологический регламент ДСП-135, глоссарий и архитектура системы']
  };

  if (titles[viewName]) {
    document.getElementById('viewTitle').textContent = titles[viewName][0];
    document.getElementById('viewSub').textContent = titles[viewName][1];
  }

  if (viewName === 'dashboard') {
    setTimeout(() => {
      if (furnace3D) furnace3D.resize();
      if (liveChart) liveChart.resize();
    }, 60);
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

async function loadDashboard() {
  const s = await call('summary', { furnace_no: selectedFurnaceNo });
  if (!s) return;

  document.getElementById('kpiToday').textContent = s.meltsToday;
  document.getElementById('kpiMonth').textContent = s.meltsMonth;
  document.getElementById('kpiEnergy').textContent = fmtNum(s.avgEnergyPerT);
  document.getElementById('kpiDuration').textContent = s.avgDuration;

  if (s.actives) {
    renderFurnaceFleet(s.actives);
  }
  if (s.active) {
    updateMeltTitles(s.active);
  }
  await tickLive(false);
}

function renderFurnaceFleet(actives) {
  const bar = document.getElementById('furnaceFleetBar');
  if (!bar || !Array.isArray(actives)) return;

  bar.innerHTML = actives.map(m => {
    const fNo = m.furnace_no || 1;
    const isSel = fNo === selectedFurnaceNo;
    const pct = Math.min(100, Math.max(0, ((m.t_min || 0) / (m.duration_min || 65)) * 100));
    const stName = (m.stage || stageName(m.t_min || 0, m.duration_min || 65)).toUpperCase();

    return `
      <div class="fleet-card ${isSel ? 'active' : ''}" data-furnace="${fNo}" title="Переключить 3D-двойник и телеметрию на ДСП-135 №${fNo}">
        <div class="fleet-top">
          <span class="fleet-unit-name">
            <span class="fleet-dot"></span>
            ДСП-135 №${fNo}
          </span>
          <span class="fleet-grade">${m.steel_grade}</span>
        </div>
        <div class="fleet-mid">
          <span class="fleet-melt-num">${m.num}</span>
          <span class="fleet-stage-tag">${stName} · ${pct.toFixed(0)}%</span>
        </div>
        <div class="fleet-metrics">
          <span>Т ванны: <b>${m.temp_c ?? 25} °C</b></span>
          <span>Дуга: <b>${m.power_mw ?? 0} МВт</b></span>
          <span><b>${(m.t_min || 0).toFixed(1)}</b>/${m.duration_min}м</span>
        </div>
        <div class="fleet-bar-track">
          <div class="fleet-bar-fill" style="width: ${pct.toFixed(1)}%"></div>
        </div>
      </div>
    `;
  }).join('');

  bar.querySelectorAll('.fleet-card').forEach(card => {
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
}

function updateMeltTitles(melt) {
  const fNo = melt.furnace_no || selectedFurnaceNo;
  document.getElementById('liveMeltNum').textContent = `ДСП №${fNo} · ПЛАВКА ${melt.num}`;
  document.getElementById('stepperMeltNum').textContent = melt.num;
  const stepperTitle = document.getElementById('stepperFurnaceTitle');
  if (stepperTitle) {
    stepperTitle.textContent = `ТЕХНОЛОГИЧЕСКИЙ ЦИКЛ ПЛАВКИ · ДСП-135 №${fNo} (${melt.steel_grade})`;
  }
  document.getElementById('topbarHeatText').textContent = `ЦЕХ ЭСПЦ · В РАБОТЕ 4 ПЕЧИ (АКТИВНА ДСП №${fNo} · ${melt.steel_grade})`;
  document.getElementById('liveMeltInfo').textContent =
    `Агрегат ДСП-135 №${fNo} · Марка ${melt.steel_grade} · Масса ${melt.mass_t} т · Сталевар ${melt.operator}`;
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
      document.getElementById('liveStage').textContent = `${st.toUpperCase()} (ОСМОТР)`;

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
  if (!sum || !sum.active) return;

  // Обновляем сводную панель всех 4 параллельных печей
  if (sum.actives) {
    renderFurnaceFleet(sum.actives);
  }

  // Обновляем KPI плашки в реальном времени
  document.getElementById('kpiToday').textContent = sum.meltsToday;
  document.getElementById('kpiMonth').textContent = sum.meltsMonth;
  document.getElementById('kpiEnergy').textContent = fmtNum(sum.avgEnergyPerT);
  document.getElementById('kpiDuration').textContent = sum.avgDuration;

  // Если на любой из 4 печей завершилась плавка и открылась новая — обновляем журналы
  const sig = (sum.actives || []).map(a => a.id).join(',');
  if (lastActiveIdsSignature && lastActiveIdsSignature !== sig) {
    loadMelts();
    loadAlerts();
  }
  lastActiveIdsSignature = sig;

  const detail = await call('melt:detail', { id: sum.active.id });
  if (!detail) return;

  const { melt, points } = detail;
  updateMeltTitles(melt);

  const last = points[points.length - 1] || { t_min: 0, temp_c: 25, power_mw: 0 };

  const currentStage = stageName(last.t_min, melt.duration_min);
  if (!previewStageOverride) {
    document.getElementById('liveStage').textContent = currentStage.toUpperCase();
  }

  const progressPct = Math.min(100, Math.max(0, (last.t_min / melt.duration_min) * 100));

  // 1. Степпер
  updateStageStepper(last.t_min, melt.duration_min, currentStage, progressPct);

  // 2. Датчики
  document.getElementById('paramTemp').textContent = `${last.temp_c} °C`;
  document.getElementById('meterTempFill').style.width = `${Math.min(100, (last.temp_c / 1800) * 100)}%`;

  document.getElementById('paramPower').textContent = `${last.power_mw} МВт`;
  document.getElementById('meterPowerFill').style.width = `${Math.min(100, (last.power_mw / 55) * 100)}%`;

  document.getElementById('paramTime').textContent = `${last.t_min.toFixed(1)} / ${melt.duration_min} мин`;
  document.getElementById('paramEnergy').textContent = `${fmtNum(melt.energy_kwh)} кВт·ч`;
  document.getElementById('paramMass').textContent = `${melt.mass_t} т`;
  document.getElementById('paramGrade').textContent = melt.steel_grade;
  document.getElementById('paramOperator').textContent = melt.operator;

  // 3. HUD над 3D
  document.getElementById('hudTemp').textContent = `${last.temp_c} °C`;
  document.getElementById('hudPower').textContent = `${last.power_mw} МВт`;

  const effectiveStage = previewStageOverride || currentStage;
  const arcBadge = document.getElementById('hudArcBadge');
  const arcText = document.getElementById('hudArcText');
  const isArcOn = previewStageOverride
    ? (effectiveStage === 'Плавление' || effectiveStage === 'Доводка')
    : (last.power_mw > 1 && (currentStage === 'Плавление' || currentStage === 'Доводка'));

  if (isArcOn) {
    arcBadge.classList.add('active');
    arcText.textContent = previewStageOverride ? `ДУГА: АКТИВНА` : `ДУГА: ${last.power_mw} МВт`;
  } else {
    arcBadge.classList.remove('active');
    arcText.textContent = 'ДУГА: ВЫКЛ';
  }

  // 4. Синхронизация 3D (если пользователь не включил ручной осмотр стадии)
  if (furnace3D && !previewStageOverride) {
    furnace3D.update({
      temp_c: last.temp_c,
      power_mw: last.power_mw,
      stage: currentStage,
      t_min: last.t_min,
      duration_min: melt.duration_min
    });
  }

  // 5. График
  updateLiveChart(points);

  // 6. Последние события выбранной печи
  const alerts = detail.alerts.slice(-5).reverse();
  document.getElementById('liveAlerts').innerHTML = alerts.length
    ? alerts.map(a => `<div class="mini-alert ${a.level}">
        <b>${a.message}</b>
        <span class="when">на ${a.t_min ?? '—'} мин плавки</span>
      </div>`).join('')
    : `<div class="mini-alert info">ДСП-135 №${melt.furnace_no || selectedFurnaceNo}: отклонений не зафиксировано · Режим штатный</div>`;
}

function updateStageStepper(t_min, duration_min, currentStage, progressPct) {
  document.getElementById('stepperFill').style.width = `${progressPct.toFixed(1)}%`;
  document.getElementById('stepperTime').textContent = `${t_min.toFixed(1)} / ${duration_min} мин`;
  document.getElementById('stepperPercent').textContent = `${progressPct.toFixed(0)}%`;

  // Нормативные границы стадий в долях от длительности цикла (0..8..38..58..65)
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
      if (stateEl) stateEl.textContent = 'ВЫПОЛНЕНО';
    } else if (idx === curIdx) {
      el.classList.add('active');
      if (barEl) barEl.style.width = `${stagePct.toFixed(0)}%`;
      if (stateEl) stateEl.textContent = `В РАБОТЕ · ${stagePct.toFixed(0)}%`;
    } else {
      if (barEl) barEl.style.width = '0%';
      if (stateEl) stateEl.textContent = 'ОЖИДАНИЕ';
    }
  });
}

function updateLiveChart(points) {
  const labels = points.map(p => p.t_min);
  const tempData = points.map(p => p.temp_c);
  const powerData = points.map(p => p.power_mw);

  if (!liveChart) {
    const ctx = document.getElementById('liveChart').getContext('2d');
    liveChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Температура расплава, °C',
            data: tempData,
            borderColor: '#ea580c',
            backgroundColor: 'rgba(234, 88, 12, 0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            yAxisID: 'y'
          },
          {
            label: 'Мощность дуги, МВт',
            data: powerData,
            borderColor: '#0284c7',
            tension: 0.35,
            pointRadius: 0,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#7c8d9f', font: { size: 11, weight: '600' } }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Минуты плавки', color: '#7c8d9f', font: { size: 10 } },
            ticks: { color: '#7c8d9f', font: { size: 10 } },
            grid: { color: '#1e2938' }
          },
          y: {
            title: { display: true, text: 'Температура, °C', color: '#ea580c', font: { size: 10 } },
            ticks: { color: '#ea580c', font: { size: 10 } },
            grid: { color: '#1e2938' }
          },
          y1: {
            position: 'right',
            title: { display: true, text: 'Мощность, МВт', color: '#0284c7', font: { size: 10 } },
            ticks: { color: '#0284c7', font: { size: 10 } },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  } else {
    liveChart.data.labels = labels;
    liveChart.data.datasets[0].data = tempData;
    liveChart.data.datasets[1].data = powerData;
    liveChart.update('none');
  }
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
          borderColor: '#ea580c',
          backgroundColor: 'rgba(234, 88, 12, 0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          yAxisID: 'y'
        },
        {
          label: 'Мощность, МВт',
          data: points.map(p => p.power_mw),
          borderColor: '#0284c7',
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
        legend: { labels: { color: '#7c8d9f', font: { size: 11, weight: '600' } } }
      },
      scales: {
        x: {
          title: { display: true, text: 'мин от завалки', color: '#7c8d9f' },
          ticks: { color: '#7c8d9f' },
          grid: { color: '#1e2938' }
        },
        y: {
          ticks: { color: '#ea580c' },
          grid: { color: '#1e2938' }
        },
        y1: {
          position: 'right',
          ticks: { color: '#0284c7' },
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
// 6. Расчёт металлошихты (Shihta)
// ==========================================================================
async function initShihta() {
  const grades = await call('grades:list');
  const sel = document.getElementById('shGrade');
  sel.innerHTML = grades.map(g => `<option value="${g.name}">${g.name}</option>`).join('');

  sel.addEventListener('change', () => {
    fillTargets(grades);
    calcShihta();
  });
  fillTargets(grades);

  document.getElementById('shCalcBtn').addEventListener('click', calcShihta);
  await calcShihta();
}

function fillTargets(grades) {
  const g = grades.find(x => x.name === document.getElementById('shGrade').value);
  if (!g) return;

  document.getElementById('shC').value = ((g.c_min + g.c_max) / 2).toFixed(2);
  document.getElementById('shSi').value = ((g.si_min + g.si_max) / 2).toFixed(2);
  document.getElementById('shMn').value = ((g.mn_min + g.mn_max) / 2).toFixed(2);

  document.getElementById('hintC').textContent = `ГОСТ: ${g.c_min}–${g.c_max} %`;
  document.getElementById('hintSi').textContent = `ГОСТ: ${g.si_min}–${g.si_max} %`;
  document.getElementById('hintMn').textContent = `ГОСТ: ${g.mn_min}–${g.mn_max} %`;
}

async function calcShihta() {
  const r = await call('shihta:calc', {
    grade: document.getElementById('shGrade').value,
    mass: document.getElementById('shMass').value,
    targetC: document.getElementById('shC').value,
    targetSi: document.getElementById('shSi').value,
    targetMn: document.getElementById('shMn').value
  });

  const panel = document.getElementById('shResult');
  panel.style.visibility = 'visible';

  document.getElementById('shTotalCost').textContent = `${fmtNum(r.totalCost)} BYN`;
  document.getElementById('shCostPerTon').textContent = `${fmtNum(r.costPerTon)} BYN`;
  document.getElementById('shO2Kg').textContent = `${fmtNum(r.o2Kg)} кг`;

  document.querySelector('#shTable tbody').innerHTML = r.rows.map(row => `
    <tr>
      <td><b>${row.name}</b></td>
      <td>${row.kg !== undefined ? row.kg + ' кг' : row.mass + ' т'}</td>
      <td>${fmtNum(row.price)}</td>
      <td><b>${fmtNum(Math.round(row.mass * row.price))}</b></td>
    </tr>`).join('');

  renderShihtaChart(r.rows);
  renderChemGauges(r);
  generateShihtaExplanation(r);
}

function renderShihtaChart(rows) {
  const ctx = document.getElementById('shPieChart').getContext('2d');
  const labels = rows.map(r => r.name);
  const data = rows.map(r => r.mass);

  const colors = [
    '#0284c7', // Металлолом
    '#ea580c', // Чугун
    '#64748b', // Известь
    '#7c3aed', // ФС45
    '#db2777', // ФМн78
    '#d97706'  // Кокс
  ];

  if (shPieChart) shPieChart.destroy();

  shPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, rows.length),
        borderWidth: 1,
        borderColor: '#111722'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#7c8d9f', boxWidth: 10, font: { size: 10, weight: '600' } }
        }
      },
      cutout: '60%'
    }
  });
}

function renderChemGauges(r) {
  const container = document.getElementById('shChemGauges');
  const { chemistry, spec, verdict } = r;

  const renderGauge = (title, val, min, max, isOk) => {
    const padMin = min * 0.7;
    const padMax = max * 1.3;
    const totalSpan = padMax - padMin;

    const zoneLeft = ((min - padMin) / totalSpan) * 100;
    const zoneWidth = ((max - min) / totalSpan) * 100;
    const needleLeft = Math.min(98, Math.max(2, ((val - padMin) / totalSpan) * 100));

    return `
      <div class="chem-gauge-card">
        <div class="chem-gauge-head">
          <span class="chem-el-title">${title}</span>
          <span class="chem-el-val">${val} %</span>
          <span class="chem-verdict ${isOk ? 'ok' : 'bad'}">
            ${isOk ? 'НОРМА (ГОСТ)' : 'ОТКЛОНЕНИЕ'}
          </span>
        </div>
        <div class="chem-meter-track">
          <div class="chem-meter-zone" style="left: ${zoneLeft}%; width: ${zoneWidth}%;"></div>
          <div class="chem-meter-needle" style="left: ${needleLeft}%;"></div>
        </div>
        <div class="chem-meter-footer">
          <span>Мин: ${min} %</span>
          <span>Допуск ГОСТ</span>
          <span>Макс: ${max} %</span>
        </div>
      </div>`;
  };

  container.innerHTML =
    renderGauge('Углерод [C]', chemistry.c, spec.c_min, spec.c_max, verdict.c) +
    renderGauge('Кремний [Si]', chemistry.si, spec.si_min, spec.si_max, verdict.si) +
    renderGauge('Марганец [Mn]', chemistry.mn, spec.mn_min, spec.mn_max, verdict.mn);
}

function generateShihtaExplanation(r) {
  const textEl = document.getElementById('shExpText');
  let exp = `Для выплавки стали марки ${r.grade} объёмом ${r.massT} т рассчитана шихтовка. `;

  if (r.o2Kg > 0) {
    exp += `За счёт ввода передельного чугуна обеспечен базовый углерод. Избыток углерода окисляется продувкой кислородом (расход: ${fmtNum(r.o2Kg)} кг O₂ по реакции C + O₂ → CO₂). `;
  }

  exp += `Для раскисления и доведения кремния и марганца введены ферросплавы с учётом нормативного угара (Si — 50%, Mn — 30%). Известь обеспечивает основность шлака для защиты футеровки печи.`;

  textEl.innerHTML = exp;
}

// ==========================================================================
// 7. Справочники (Materials & Grades)
// ==========================================================================
async function loadMaterials() {
  const mats = await call('materials:list');
  const grades = await call('grades:list');

  const roleStyles = {
    'основа': 'tag-grade',
    'легирующее': 'badge-accent',
    'флюс': 'status-tag ok',
    'добавка': 'warn-count-badge'
  };

  const renderMats = items => {
    document.querySelector('#materialsTable tbody').innerHTML = items.map(m => `
      <tr>
        <td><b>${m.name}</b></td>
        <td><span class="${roleStyles[m.role] || 'status-tag'}">${m.role.toUpperCase()}</span></td>
        <td>${m.c_pct !== null ? m.c_pct + ' %' : '—'}</td>
        <td>${m.si_pct !== null ? m.si_pct + ' %' : '—'}</td>
        <td>${m.mn_pct !== null ? m.mn_pct + ' %' : '—'}</td>
        <td><b>${fmtNum(m.price_per_t)} BYN</b></td>
      </tr>`).join('');
  };

  renderMats(mats);

  document.getElementById('materialsSearch')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    renderMats(mats.filter(m => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)));
  });

  const gradeApps = {
    'Ст3сп': 'Рядовой строительный прокат, уголки, швеллеры, арматурный прокат',
    '09Г2С': 'Низколегированная мостовая и трубная сталь для эксплуатации при t до -70 °C',
    '40Х': 'Машиностроение: валы, оси, зубчатые венцы повышенной прочности',
    '65Г': 'Рессорно-пружинная сталь с высокой упругостью и стойкостью к истиранию'
  };

  document.querySelector('#gradesTable tbody').innerHTML = grades.map(g => `
    <tr>
      <td><b><span class="tag-grade">${g.name}</span></b></td>
      <td>${g.c_min}–${g.c_max} %</td>
      <td>${g.si_min}–${g.si_max} %</td>
      <td>${g.mn_min}–${g.mn_max} %</td>
      <td style="color:var(--text-muted)">${gradeApps[g.name] || 'Конструкционная сталь'}</td>
    </tr>`).join('');
}

// ==========================================================================
// 8. Поиск по словарю
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
// 9. Старт приложения
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const clockEl = document.getElementById('clock');
  if (clockEl) clockEl.textContent = now.toLocaleTimeString('ru-RU');

  initFurnace();
  setupStagePreviewClicks();
  loadDashboard().then(() => {
    window.liveTimerId = setInterval(tickLive, 1500);
  });
  loadMelts();
  loadAlerts();
  initShihta();
  loadMaterials();
  setupGlossarySearch();
});
