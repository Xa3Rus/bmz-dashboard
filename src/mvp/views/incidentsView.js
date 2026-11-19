/**
 * ============================================================================
 * [V] MVP VIEW MODULE 4: src/mvp/views/incidentsView.js
 * Назначение: Пассивное представление тревожной плашки «АВАРИЯ» с инструкцией
 *             по устранению (СОП) и системы суточного учёта аварий по дням (24/7)
 * ============================================================================
 * Роль в паттерне MVP:
 * 1. Высвечивает плашку «АВАРИЯ» с интерактивным чек-листом из 5 шагов СОП
 *    и секундомером времени реакции оператора.
 * 2. Отрисовывает 7-дневную гистограмму аварий по дням на главном экране
 *    и таблицу суточного реестра аварий с фильтрами по дате, смене и печи.
 */

export class IncidentsView {
  constructor() {
    this.dom = {
      btnShowSopOverlay: document.getElementById('btnShowSopOverlay'),
      alarmInstructionOverlay: document.getElementById('alarmInstructionOverlay'),
      sopAlarmTitle: document.getElementById('sopAlarmTitle'),
      sopAlarmSubtitle: document.getElementById('sopAlarmSubtitle'),
      sopMetricLabel: document.getElementById('sopMetricLabel'),
      sopLiveTemp: document.getElementById('sopLiveTemp'),
      sopReactionTimer: document.getElementById('sopReactionTimer'),
      sopCauseText: document.getElementById('sopCauseText'),
      sopDangerText: document.getElementById('sopDangerText'),
      sopProgressCounter: document.getElementById('sopProgressCounter'),
      sopProgressFill: document.getElementById('sopProgressFill'),
      sopStepsList: document.getElementById('sopStepsList'),
      btnMinimizeSopOverlay: document.getElementById('btnMinimizeSopOverlay'),
      btnExecuteSopCooling: document.getElementById('btnExecuteSopCooling'),

      emergencyPickerModal: document.getElementById('emergencyPickerModal'),
      btnCloseEmergencyPicker: document.getElementById('btnCloseEmergencyPicker'),
      emergencyScenariosGrid: document.getElementById('emergencyScenariosGrid'),

      dailyTodayCount: document.getElementById('dailyTodayCount'),
      dailyWeekCount: document.getElementById('dailyWeekCount'),
      dailyBarsStrip: document.getElementById('dailyBarsStrip'),
      btnOpenDailyRegistry: document.getElementById('btnOpenDailyRegistry'),
      btnOpenIncidentsModal: document.getElementById('btnOpenIncidentsModal'),

      incidentsModal: document.getElementById('incidentsModal'),
      btnCloseIncidentsModal: document.getElementById('btnCloseIncidentsModal'),
      modalKpiToday: document.getElementById('modalKpiToday'),
      modalKpiWeek: document.getElementById('modalKpiWeek'),
      modalKpiActive: document.getElementById('modalKpiActive'),
      modalKpiTopFurnace: document.getElementById('modalKpiTopFurnace'),
      modalDailyBars: document.getElementById('modalDailyBars'),
      btnResetDayFilter: document.getElementById('btnResetDayFilter'),
      filterIncidentDate: document.getElementById('filterIncidentDate'),
      filterIncidentShift: document.getElementById('filterIncidentShift'),
      filterIncidentFurnace: document.getElementById('filterIncidentFurnace'),
      incidentsTableTbody: document.getElementById('incidentsTableTbody')
    };

    this.sopTimerInterval = null;
    this.sopStartedAt = 0;

    this._initSopOverlayEvents();
  }

  _initSopOverlayEvents() {
    this.dom.btnMinimizeSopOverlay?.addEventListener('click', () => {
      this.dom.alarmInstructionOverlay?.classList.add('hidden');
    });

    this.dom.btnShowSopOverlay?.addEventListener('click', () => {
      this.dom.alarmInstructionOverlay?.classList.remove('hidden');
    });

    this.dom.btnCloseEmergencyPicker?.addEventListener('click', () => {
      this.closeEmergencyPicker();
    });

    this.dom.emergencyPickerModal?.addEventListener('click', e => {
      if (e.target === this.dom.emergencyPickerModal) this.closeEmergencyPicker();
    });
  }

  openEmergencyPicker(scenarios, onSelectCode) {
    if (!this.dom.emergencyPickerModal || !this.dom.emergencyScenariosGrid) return;

    const rowsMeta = [
      { key: 'temperature', name: 'Температура расплава', norm: '1540–1630 °C' },
      { key: 'current',     name: 'Ток электродов (3Ф)',  norm: '42–58 кА' },
      { key: 'pressure',    name: 'Давление под сводом',  norm: '35–56 Па' },
      { key: 'energy',      name: 'Расход электроэнергии', norm: '≤ 72 МВт·ч' },
      { key: 'oxygen',      name: 'Расход кислорода (O₂)', norm: '1800–3900 м³/ч' }
    ];

    const shortLabels = {
      'АВ-01': { label: 'Перегрев ванны',          limit: '> 1650 °C' },
      'АВ-02': { label: 'Переохлаждение ванны',    limit: '< 1525 °C' },
      'АВ-03': { label: 'Перегрузка тока (КЗ)',    limit: '> 63 кА' },
      'АВ-04': { label: 'Обрыв дуги / падение тока', limit: '< 34 кА' },
      'АВ-05': { label: 'Избыточное давление',     limit: '> 65 Па' },
      'АВ-06': { label: 'Критическое разрежение',  limit: '< 25 Па' },
      'АВ-07': { label: 'Перерасход за плавку',    limit: '> 82 МВт·ч' },
      'АВ-08': { label: 'Падение подачи O₂',       limit: '< 1000 м³/ч' },
      'АВ-09': { label: 'Избыток подачи O₂',       limit: '> 4300 м³/ч' }
    };

    const renderBtn = (sc, dirClass) => {
      if (!sc) return '<span class="picker-empty-slot">—</span>';
      const meta = shortLabels[sc.code] || { label: sc.title, limit: sc.code };
      return `
        <button type="button" class="picker-action-btn ${dirClass}" data-scenario-code="${sc.code}">
          <span class="picker-action-title">${meta.label}</span>
          <span class="picker-action-meta">${sc.code} · ${meta.limit}</span>
        </button>
      `;
    };

    this.dom.emergencyScenariosGrid.innerHTML = rowsMeta.map(row => {
      const lowSc = scenarios.find(s => s.sensorKey === row.key && s.direction === 'low');
      const highSc = scenarios.find(s => s.sensorKey === row.key && s.direction === 'high');
      return `
        <div class="picker-row">
          <div class="picker-param-info">
            <span class="picker-param-name">${row.name}</span>
            <span class="picker-param-norm">Норма: ${row.norm}</span>
          </div>
          <div>${renderBtn(lowSc, 'is-low')}</div>
          <div>${renderBtn(highSc, 'is-high')}</div>
        </div>
      `;
    }).join('');

    this.dom.emergencyScenariosGrid.querySelectorAll('[data-scenario-code]').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.scenarioCode;
        this.closeEmergencyPicker();
        if (onSelectCode) onSelectCode(code);
      });
    });

    this.dom.emergencyPickerModal.classList.remove('hidden');
  }

  closeEmergencyPicker() {
    this.dom.emergencyPickerModal?.classList.add('hidden');
  }

  bindExecuteSopCooling(handler) {
    this.dom.btnExecuteSopCooling?.addEventListener('click', () => handler());
  }

  bindIncidentsModalEvents({ onOpenIncidents, onFilterChange }) {
    this.onIncidentFilterChange = onFilterChange;

    const openHandler = () => {
      this.openIncidentsModal();
      if (onOpenIncidents) onOpenIncidents();
    };

    this.dom.btnOpenIncidentsModal?.addEventListener('click', openHandler);
    this.dom.btnOpenDailyRegistry?.addEventListener('click', openHandler);
    this.dom.btnCloseIncidentsModal?.addEventListener('click', () => this.closeIncidentsModal());

    this.dom.incidentsModal?.addEventListener('click', e => {
      if (e.target === this.dom.incidentsModal) this.closeIncidentsModal();
    });

    const triggerFilter = () => {
      if (this.onIncidentFilterChange) {
        this.onIncidentFilterChange(this.getIncidentFilterValues());
      }
    };

    this.dom.filterIncidentDate?.addEventListener('change', triggerFilter);
    this.dom.filterIncidentShift?.addEventListener('change', triggerFilter);
    this.dom.filterIncidentFurnace?.addEventListener('change', triggerFilter);

    this.dom.btnResetDayFilter?.addEventListener('click', () => {
      if (this.dom.filterIncidentDate) this.dom.filterIncidentDate.value = 'ALL';
      if (this.dom.filterIncidentShift) this.dom.filterIncidentShift.value = 'ALL';
      if (this.dom.filterIncidentFurnace) this.dom.filterIncidentFurnace.value = 'ALL';
      triggerFilter();
    });
  }

  showAlarmInstructionOverlay({ furnaceName, metricLabel, metricValueText, responsibleName, responsibleBadge, shiftName, instruction }) {
    if (!this.dom.alarmInstructionOverlay || !instruction) return;

    if (this.dom.sopAlarmTitle) {
      this.dom.sopAlarmTitle.textContent = `АВАРИЯ НА ПЕЧИ ${furnaceName}: ${instruction.title}`;
    }
    if (this.dom.sopAlarmSubtitle) {
      this.dom.sopAlarmSubtitle.textContent = `Код: ${instruction.code} · ${shiftName} · Ответственный сталевар: ${responsibleName} (Таб. №${responsibleBadge})`;
    }
    if (this.dom.sopMetricLabel) {
      this.dom.sopMetricLabel.textContent = metricLabel || instruction.metricLabel || 'ПОКАЗАТЕЛЬ';
    }
    if (this.dom.sopLiveTemp) {
      this.dom.sopLiveTemp.textContent = metricValueText || '—';
    }
    if (this.dom.sopCauseText) {
      this.dom.sopCauseText.textContent = instruction.cause;
    }
    if (this.dom.sopDangerText) {
      this.dom.sopDangerText.textContent = instruction.danger;
    }

    const steps = instruction.steps || [];
    if (this.dom.sopProgressCounter) {
      this.dom.sopProgressCounter.textContent = `0 / ${steps.length} шагов`;
    }
    if (this.dom.sopProgressFill) {
      this.dom.sopProgressFill.style.width = '0%';
    }

    if (this.dom.sopStepsList) {
      this.dom.sopStepsList.innerHTML = steps.map((stepText, idx) => `
        <div class="sop-step-row" data-step-idx="${idx}">
          <span class="sop-step-num">${idx + 1}</span>
          <span>${stepText}</span>
        </div>
      `).join('');

      this.dom.sopStepsList.querySelectorAll('.sop-step-row').forEach(row => {
        row.addEventListener('click', () => {
          row.classList.toggle('checked');
          const total = steps.length;
          const done = this.dom.sopStepsList.querySelectorAll('.sop-step-row.checked').length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          if (this.dom.sopProgressCounter) {
            this.dom.sopProgressCounter.textContent = `${done} / ${total} шагов`;
          }
          if (this.dom.sopProgressFill) {
            this.dom.sopProgressFill.style.width = `${pct}%`;
          }
        });
      });
    }

    this.sopStartedAt = Date.now();
    if (this.sopTimerInterval) clearInterval(this.sopTimerInterval);
    const updateTimer = () => {
      const sec = ((Date.now() - this.sopStartedAt) / 1000).toFixed(1);
      if (this.dom.sopReactionTimer) {
        this.dom.sopReactionTimer.textContent = `${sec} с`;
      }
    };
    updateTimer();
    this.sopTimerInterval = setInterval(updateTimer, 100);

    this.dom.alarmInstructionOverlay.classList.remove('hidden');
  }

  updateSopLiveTemperature(metricValueText, isEmergencyActive) {
    if (this.dom.sopLiveTemp) {
      this.dom.sopLiveTemp.textContent = metricValueText;
    }
    if (!isEmergencyActive) {
      this.hideAlarmInstructionOverlay();
    }
  }

  hideAlarmInstructionOverlay() {
    if (this.sopTimerInterval) {
      clearInterval(this.sopTimerInterval);
      this.sopTimerInterval = null;
    }
    this.dom.alarmInstructionOverlay?.classList.add('hidden');
  }

  openIncidentsModal() {
    this.dom.incidentsModal?.classList.remove('hidden');
  }

  closeIncidentsModal() {
    this.dom.incidentsModal?.classList.add('hidden');
  }

  getIncidentFilterValues() {
    return {
      dateKey: this.dom.filterIncidentDate?.value || 'ALL',
      shiftId: this.dom.filterIncidentShift?.value || 'ALL',
      furnaceId: this.dom.filterIncidentFurnace?.value || 'ALL'
    };
  }

  renderDailyAlarmsWidget(dailyStats, onSelectDateKey) {
    if (this.dom.dailyTodayCount) this.dom.dailyTodayCount.textContent = String(dailyStats.todayTotal);
    if (this.dom.dailyWeekCount) this.dom.dailyWeekCount.textContent = String(dailyStats.weekTotal);

    if (!this.dom.dailyBarsStrip) return;

    const maxCount = Math.max(1, ...dailyStats.days.map(d => d.total));

    this.dom.dailyBarsStrip.innerHTML = dailyStats.days.map(day => {
      const heightPct = day.total === 0 ? 10 : Math.max(22, Math.round((day.total / maxCount) * 100));
      return `
        <div class="day-bar-col ${day.isToday ? 'is-today' : ''}" data-day-key="${day.dateKey}" title="Дата: ${day.dateKey} · Аварий: ${day.total} (ДСП-1: ${day.byFurnace[1]}, ДСП-2: ${day.byFurnace[2]}, ДСП-3: ${day.byFurnace[3]})">
          <span class="day-bar-count">${day.total}</span>
          <div class="day-bar-track">
            <div class="day-bar-fill ${day.total === 0 ? 'zero' : ''}" style="height: ${heightPct}%"></div>
          </div>
          <span class="day-bar-date">${day.shortLabel}</span>
        </div>
      `;
    }).join('');

    this.dom.dailyBarsStrip.querySelectorAll('.day-bar-col').forEach(col => {
      col.addEventListener('click', () => {
        const dateKey = col.dataset.dayKey;
        if (onSelectDateKey) onSelectDateKey(dateKey);
      });
    });
  }

  renderIncidentsModal(dailyStats, filteredIncidents, selectedFilters) {
    if (this.dom.modalKpiToday) this.dom.modalKpiToday.textContent = String(dailyStats.todayTotal);
    if (this.dom.modalKpiWeek) this.dom.modalKpiWeek.textContent = String(dailyStats.weekTotal);
    if (this.dom.modalKpiActive) this.dom.modalKpiActive.textContent = String(dailyStats.todayActive);
    if (this.dom.modalKpiTopFurnace) this.dom.modalKpiTopFurnace.textContent = dailyStats.topFurnaceName;

    if (this.dom.filterIncidentDate) {
      const currentVal = selectedFilters?.dateKey || this.dom.filterIncidentDate.value || 'ALL';
      const optionsHtml = `<option value="ALL">Все дни (Весь архив)</option>` +
        [...dailyStats.days].reverse().map(d =>
          `<option value="${d.dateKey}" ${d.dateKey === currentVal ? 'selected' : ''}>${d.dateKey} (${d.isToday ? 'Сегодня' : d.weekday}) — ${d.total} ав.</option>`
        ).join('');
      this.dom.filterIncidentDate.innerHTML = optionsHtml;
      this.dom.filterIncidentDate.value = currentVal;
    }

    if (this.dom.modalDailyBars) {
      const maxCount = Math.max(1, ...dailyStats.days.map(d => d.total));
      this.dom.modalDailyBars.innerHTML = dailyStats.days.map(day => {
        const heightPct = day.total === 0 ? 10 : Math.max(20, Math.round((day.total / maxCount) * 100));
        const isSelected = selectedFilters?.dateKey === day.dateKey;
        return `
          <div class="day-bar-col ${day.isToday || isSelected ? 'is-today' : ''}" data-modal-day="${day.dateKey}">
            <span class="day-bar-count">${day.total} ав.</span>
            <div class="day-bar-track">
              <div class="day-bar-fill ${day.total === 0 ? 'zero' : ''}" style="height: ${heightPct}%"></div>
            </div>
            <span class="day-bar-date">${day.dateKey} (${day.weekday})</span>
          </div>
        `;
      }).join('');

      this.dom.modalDailyBars.querySelectorAll('[data-modal-day]').forEach(col => {
        col.addEventListener('click', () => {
          const dayKey = col.dataset.modalDay;
          if (this.dom.filterIncidentDate) {
            this.dom.filterIncidentDate.value = dayKey;
            if (this.onIncidentFilterChange) {
              this.onIncidentFilterChange(this.getIncidentFilterValues());
            }
          }
        });
      });
    }

    if (this.dom.incidentsTableTbody) {
      if (filteredIncidents.length === 0) {
        this.dom.incidentsTableTbody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align:center; padding: 18px; color: var(--text-dim);">
              За выбранные сутки / смену аварийных инцидентов не зафиксировано.
            </td>
          </tr>
        `;
        return;
      }

      this.dom.incidentsTableTbody.innerHTML = filteredIncidents.map(inc => {
        const isActive = inc.status === 'Активна';
        return `
          <tr>
            <td style="font-family:var(--font-mono); font-weight:700; color:var(--prim-cyan-400);">${inc.id}</td>
            <td style="font-family:var(--font-mono);">${inc.dateKey}</td>
            <td style="font-family:var(--font-mono);">${inc.time}</td>
            <td style="font-family:var(--font-mono);">Смена ${inc.shiftId}</td>
            <td style="font-family:var(--font-mono); font-weight:700;">${inc.furnaceName}</td>
            <td><strong>${inc.code}</strong> · ${inc.title}</td>
            <td style="font-family:var(--font-mono); font-weight:700; color:#fca5a5;">${inc.maxTemp} °C</td>
            <td><strong>${inc.responsibleName}</strong> <span style="color:var(--text-dim); font-family:var(--font-mono);">(Таб. №${inc.responsibleBadge})</span></td>
            <td>
              <span class="log-badge" data-level="${isActive ? 'ALARM' : 'INFO'}">${inc.status}</span>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
}
