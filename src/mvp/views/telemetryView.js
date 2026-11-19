/**
 * ============================================================================
 * [V] MVP VIEW MODULE 1: src/mvp/views/telemetryView.js
 * Назначение: Пассивное представление шапки, 5 карточек датчиков,
 *             графика температуры Chart.js и оперативного журнала событий
 * ============================================================================
 * Роль в паттерне MVP:
 * Отвечает ТОЛЬКО за обновление DOM-элементов датчиков, шапки и графика Chart.js.
 * Не содержит бизнес-логики и не обращается к Model напрямую.
 */

export class TelemetryView {
  constructor() {
    this.dom = {
      clock: document.getElementById('headerClock'),
      furnaceTabs: document.querySelectorAll('.furnace-tab'),
      headerOperatorAvatar: document.getElementById('headerOperatorAvatar'),
      headerOperatorName: document.getElementById('headerOperatorName'),
      headerOperatorRole: document.getElementById('headerOperatorRole'),
      headerTodayAlarmsBadge: document.getElementById('headerTodayAlarmsBadge'),
      btnEndShift: document.getElementById('btnEndShift'),
      btnOpenStaffAssign: document.getElementById('btnOpenStaffAssign'),
      btnQuickAssignResp: document.getElementById('btnQuickAssignResp'),
      modalLivePlcTicker: document.getElementById('modalLivePlcTicker'),
      systemStatusPill: document.getElementById('systemStatusPill'),
      systemStatusText: document.getElementById('systemStatusText'),

      activeShiftBadge: document.getElementById('activeShiftBadge'),
      meltBadge: document.getElementById('activeMeltBadge'),
      steelGradeBadge: document.getElementById('activeSteelGrade'),
      stageBadge: document.getElementById('activeStageBadge'),
      controllerBadge: document.getElementById('activeControllerBadge'),
      activeResponsibleName: document.getElementById('activeResponsibleName'),
      activeResponsibleSub: document.getElementById('activeResponsibleSub'),

      cards: {
        temperature: {
          card: document.getElementById('card-temperature'),
          value: document.getElementById('val-temperature'),
          badge: document.getElementById('badge-temperature'),
          bar: document.getElementById('bar-temperature'),
          sub: document.getElementById('sub-temperature')
        },
        current: {
          card: document.getElementById('card-current'),
          value: document.getElementById('val-current'),
          badge: document.getElementById('badge-current'),
          bar: document.getElementById('bar-current'),
          sub: document.getElementById('sub-current')
        },
        pressure: {
          card: document.getElementById('card-pressure'),
          value: document.getElementById('val-pressure'),
          badge: document.getElementById('badge-pressure'),
          bar: document.getElementById('bar-pressure'),
          sub: document.getElementById('sub-pressure')
        },
        energy: {
          card: document.getElementById('card-energy'),
          value: document.getElementById('val-energy'),
          badge: document.getElementById('badge-energy'),
          bar: document.getElementById('bar-energy'),
          sub: document.getElementById('sub-energy')
        },
        oxygen: {
          card: document.getElementById('card-oxygen'),
          value: document.getElementById('val-oxygen'),
          badge: document.getElementById('badge-oxygen'),
          bar: document.getElementById('bar-oxygen'),
          sub: document.getElementById('sub-oxygen')
        }
      },

      arcHeatVal: document.getElementById('arcHeatVal'),
      chemHeatVal: document.getElementById('chemHeatVal'),
      lossHeatVal: document.getElementById('lossHeatVal'),
      waterFlowVal: document.getElementById('waterFlowVal'),
      heatBarArc: document.getElementById('heatBarArc'),
      btnEmergency: document.getElementById('btnEmergency'),
      btnCooling: document.getElementById('btnCooling'),

      chartCanvas: document.getElementById('tempChartCanvas'),
      chartSubInfo: document.getElementById('chartSubInfo'),
      logList: document.getElementById('eventLogList'),
      logCountBadge: document.getElementById('logCountBadge'),
      toastContainer: document.getElementById('toastContainer'),

      sensorDetailModal: document.getElementById('sensorDetailModal'),
      btnCloseSensorModal: document.getElementById('btnCloseSensorModal'),
      sensorModalTitle: document.getElementById('sensorModalTitle'),
      sensorModalValue: document.getElementById('sensorModalValue'),
      sensorModalStatusBadge: document.getElementById('sensorModalStatusBadge'),
      sensorModalNormalRange: document.getElementById('sensorModalNormalRange'),
      sensorModalCriticalThreshold: document.getElementById('sensorModalCriticalThreshold'),
      sensorModalFurnaceInfo: document.getElementById('sensorModalFurnaceInfo'),
      sensorModalDescription: document.getElementById('sensorModalDescription'),
      sensorModalBelowTitle: document.getElementById('sensorModalBelowTitle'),
      sensorModalBelowList: document.getElementById('sensorModalBelowList'),
      sensorModalBelowAction: document.getElementById('sensorModalBelowAction'),
      sensorModalAboveTitle: document.getElementById('sensorModalAboveTitle'),
      sensorModalAboveList: document.getElementById('sensorModalAboveList'),
      sensorModalAboveAction: document.getElementById('sensorModalAboveAction')
    };

    this.activeDetailSensorKey = null;
    this._initSensorModalClose();
    this._initChart();
  }

  _initSensorModalClose() {
    this.dom.btnCloseSensorModal?.addEventListener('click', () => this.closeSensorDetailModal());
    this.dom.sensorDetailModal?.addEventListener('click', e => {
      if (e.target === this.dom.sensorDetailModal) this.closeSensorDetailModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.activeDetailSensorKey) {
        this.closeSensorDetailModal();
      }
    });
  }

  bindSensorCardClick(handler) {
    Object.entries(this.dom.cards).forEach(([key, domCard]) => {
      if (!domCard?.card) return;
      domCard.card.title = 'Нажмите для подробной информации о показателе';
      domCard.card.addEventListener('click', () => handler(key));
    });
  }

  openSensorDetailModal(detail) {
    if (!this.dom.sensorDetailModal || !detail) return;
    this.activeDetailSensorKey = detail.key;

    if (this.dom.sensorModalTitle) this.dom.sensorModalTitle.textContent = detail.title;
    if (this.dom.sensorModalValue) this.dom.sensorModalValue.textContent = detail.formattedValue;
    if (this.dom.sensorModalStatusBadge) {
      this.dom.sensorModalStatusBadge.textContent = detail.statusLabel;
      this.dom.sensorModalStatusBadge.dataset.status = detail.status;
    }
    if (this.dom.sensorModalNormalRange) this.dom.sensorModalNormalRange.textContent = detail.normalRange;
    if (this.dom.sensorModalCriticalThreshold) this.dom.sensorModalCriticalThreshold.textContent = detail.criticalThreshold;
    if (this.dom.sensorModalFurnaceInfo) this.dom.sensorModalFurnaceInfo.textContent = detail.furnaceInfo;
    if (this.dom.sensorModalDescription) this.dom.sensorModalDescription.textContent = detail.description;

    if (this.dom.sensorModalBelowTitle) this.dom.sensorModalBelowTitle.textContent = detail.belowTitle;
    if (this.dom.sensorModalBelowList) {
      this.dom.sensorModalBelowList.innerHTML = (detail.belowEffects || [])
        .map(text => `<li>${text}</li>`).join('');
    }
    if (this.dom.sensorModalBelowAction) this.dom.sensorModalBelowAction.textContent = detail.belowAction;

    if (this.dom.sensorModalAboveTitle) this.dom.sensorModalAboveTitle.textContent = detail.aboveTitle;
    if (this.dom.sensorModalAboveList) {
      this.dom.sensorModalAboveList.innerHTML = (detail.aboveEffects || [])
        .map(text => `<li>${text}</li>`).join('');
    }
    if (this.dom.sensorModalAboveAction) this.dom.sensorModalAboveAction.textContent = detail.aboveAction;

    this.dom.sensorDetailModal.classList.remove('hidden');
  }

  closeSensorDetailModal() {
    this.activeDetailSensorKey = null;
    this.dom.sensorDetailModal?.classList.add('hidden');
  }

  bindFurnaceSelect(handler) {
    this.dom.furnaceTabs.forEach(btn => {
      btn.addEventListener('click', () => handler(Number(btn.dataset.furnaceId)));
    });
  }

  bindEndShift(handler) {
    this.dom.btnEndShift?.addEventListener('click', () => handler());
  }

  bindEmergencySimulate(handler) {
    this.dom.btnEmergency?.addEventListener('click', () => handler());
  }

  bindEmergencyCooling(handler) {
    this.dom.btnCooling?.addEventListener('click', () => handler());
  }

  updateClock(timeString) {
    if (this.dom.clock) this.dom.clock.textContent = timeString;
  }

  renderHeader(headerViewModel) {
    const {
      activeId,
      activeShiftId,
      activeShiftLabel,
      furnacesSummary,
      meltNumber,
      steelGrade,
      stage,
      controller,
      responsibleName,
      responsibleSub,
      operatorName,
      operatorInitials,
      operatorRoleLine,
      isAuthenticated,
      isMaster,
      allowedFurnaceId,
      todayAlarmsCount,
      systemStatus,
      systemStatusLabel
    } = headerViewModel;

    this.dom.furnaceTabs.forEach(tab => {
      const id = Number(tab.dataset.furnaceId);
      const summary = furnacesSummary.find(f => f.id === id);
      const isVisible = !isAuthenticated || isMaster || !allowedFurnaceId || id === Number(allowedFurnaceId);
      tab.style.display = isVisible ? '' : 'none';
      tab.classList.toggle('active', id === activeId);

      if (summary) {
        tab.dataset.status = summary.status;
        const tempSpan = tab.querySelector('.tab-temp');
        if (tempSpan) tempSpan.textContent = `${summary.temperature} °C`;
        const respSpan = document.getElementById(`tabResp-${id}`);
        if (respSpan) respSpan.textContent = `Отв: ${summary.responsibleShort}`;
      }
    });

    if (this.dom.headerOperatorAvatar) this.dom.headerOperatorAvatar.textContent = operatorInitials;
    if (this.dom.headerOperatorName) this.dom.headerOperatorName.textContent = operatorName;
    if (this.dom.headerOperatorRole) this.dom.headerOperatorRole.textContent = operatorRoleLine;
    if (this.dom.headerTodayAlarmsBadge) this.dom.headerTodayAlarmsBadge.textContent = String(todayAlarmsCount);

    if (this.dom.btnEndShift) {
      this.dom.btnEndShift.style.display = isAuthenticated ? 'inline-flex' : 'none';
    }
    if (this.dom.btnOpenStaffAssign) {
      this.dom.btnOpenStaffAssign.style.display = isMaster ? 'inline-flex' : 'none';
    }
    if (this.dom.btnQuickAssignResp) {
      this.dom.btnQuickAssignResp.style.display = isMaster ? '' : 'none';
    }

    if (this.dom.modalLivePlcTicker && Array.isArray(furnacesSummary)) {
      const tickerStr = furnacesSummary.map(f => `${f.name} (${f.temperature} °C)`).join(' · ');
      this.dom.modalLivePlcTicker.textContent = `Фоновый опрос ПЛК активен: ${tickerStr}`;
    }

    if (this.dom.activeShiftBadge) this.dom.activeShiftBadge.textContent = activeShiftLabel;
    if (this.dom.meltBadge) this.dom.meltBadge.textContent = `#${meltNumber}`;
    if (this.dom.steelGradeBadge) this.dom.steelGradeBadge.textContent = steelGrade;
    if (this.dom.stageBadge) this.dom.stageBadge.textContent = stage;
    if (this.dom.controllerBadge) this.dom.controllerBadge.textContent = controller;
    if (this.dom.activeResponsibleName) this.dom.activeResponsibleName.textContent = responsibleName;
    if (this.dom.activeResponsibleSub) this.dom.activeResponsibleSub.textContent = responsibleSub;

    if (this.dom.systemStatusPill) this.dom.systemStatusPill.dataset.status = systemStatus;
    if (this.dom.systemStatusText) this.dom.systemStatusText.textContent = systemStatusLabel;
  }

  renderSensorCards(sensorsViewModel) {
    const { cards, heatBalance, waterFlow, isEmergency, isCooling, showCoolingBtn } = sensorsViewModel;

    Object.keys(cards).forEach(key => {
      const item = cards[key];
      const domCard = this.dom.cards[key];
      if (!domCard || !domCard.card) return;

      domCard.card.dataset.status = item.status;
      if (domCard.value) domCard.value.textContent = item.formattedValue;
      if (domCard.badge) {
        domCard.badge.textContent = item.statusLabel;
        domCard.badge.dataset.status = item.status;
      }
      if (domCard.bar) {
        domCard.bar.style.width = `${item.percent}%`;
        domCard.bar.dataset.status = item.status;
      }
      if (domCard.sub) domCard.sub.textContent = item.subtitle;
    });

    // Живое обновление значения и статуса в открытой карточке подробной справки
    if (this.activeDetailSensorKey && cards[this.activeDetailSensorKey]) {
      const liveItem = cards[this.activeDetailSensorKey];
      if (this.dom.sensorModalValue) this.dom.sensorModalValue.textContent = liveItem.formattedValue;
      if (this.dom.sensorModalStatusBadge) {
        this.dom.sensorModalStatusBadge.textContent = liveItem.statusLabel;
        this.dom.sensorModalStatusBadge.dataset.status = liveItem.status;
      }
    }

    if (this.dom.arcHeatVal) this.dom.arcHeatVal.textContent = `${heatBalance.arcHeatMw} МВт`;
    if (this.dom.chemHeatVal) this.dom.chemHeatVal.textContent = `${heatBalance.chemHeatMw} МВт`;
    if (this.dom.lossHeatVal) this.dom.lossHeatVal.textContent = `${heatBalance.lossMw} МВт`;
    if (this.dom.waterFlowVal) this.dom.waterFlowVal.textContent = `${waterFlow} м³/ч`;
    if (this.dom.heatBarArc) this.dom.heatBarArc.style.width = `${heatBalance.arcShare}%`;

    if (this.dom.btnEmergency) {
      this.dom.btnEmergency.classList.toggle('is-active', isEmergency);
      const labelEl = this.dom.btnEmergency.querySelector('.btn-label');
      if (labelEl) {
        labelEl.textContent = isEmergency
          ? `АВАРИЯ АКТИВНА (${sensorsViewModel.emergencyCode || 'ЧС'}) — УСТРАНИТЬ`
          : 'Режим симуляции аварии';
      }
    }

    if (this.dom.btnCooling) {
      this.dom.btnCooling.classList.toggle('hidden', !showCoolingBtn);
      this.dom.btnCooling.classList.toggle('is-cooling', isCooling);
      const coolText = this.dom.btnCooling.querySelector('.btn-cooling-label');
      if (coolText) {
        coolText.textContent = isCooling
          ? 'Идёт стабилизация режима печи...'
          : 'Аварийное восстановление';
      }
    }
  }

  renderLogs(logs) {
    if (!this.dom.logList) return;
    if (this.dom.logCountBadge) {
      this.dom.logCountBadge.textContent = `${logs.length} записей`;
    }

    this.dom.logList.innerHTML = logs.slice(0, 35).map(item => `
      <div class="log-row" data-level="${item.level}">
        <span class="log-time">${item.time}</span>
        <span class="log-furnace">${item.furnace}</span>
        <span class="log-badge" data-level="${item.level}">${item.level}</span>
        <span class="log-msg">${item.message}</span>
      </div>
    `).join('');
  }

  showToast(title, message, type = 'success') {
    if (!this.dom.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `scada-toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-header">
        <span class="toast-dot"></span>
        <strong>${title}</strong>
      </div>
      <div class="toast-body">${message}</div>
    `;

    this.dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 300);
    }, 5200);
  }

  _initChart() {
    if (!this.dom.chartCanvas || typeof window.Chart === 'undefined') return;

    const ctx = this.dom.chartCanvas.getContext('2d');
    const gradientNormal = ctx.createLinearGradient(0, 0, 0, 200);
    gradientNormal.addColorStop(0, 'rgba(16, 163, 127, 0.36)');
    gradientNormal.addColorStop(1, 'rgba(16, 163, 127, 0.01)');

    this.chartGradients = { ctx, gradientNormal };

    this.tempChart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Температура (°C)',
            data: [],
            borderColor: '#19c37d',
            backgroundColor: gradientNormal,
            borderWidth: 2.2,
            pointRadius: 2.2,
            pointHoverRadius: 5,
            pointBackgroundColor: '#19c37d',
            fill: true,
            tension: 0.36
          },
          {
            label: 'Порог аварии (1650 °C)',
            data: [],
            borderColor: 'rgba(239, 68, 68, 0.75)',
            borderWidth: 1.4,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
            tension: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 260 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: '#a1a1aa',
              boxWidth: 12,
              boxHeight: 2,
              font: { family: "'JetBrains Mono', monospace", size: 10 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(11, 12, 15, 0.95)',
            borderColor: '#2e323d',
            borderWidth: 1,
            titleColor: '#f4f4f5',
            bodyColor: '#e4e4e7',
            titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 12 }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: {
              color: '#71717a',
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 7,
              font: { family: "'JetBrains Mono', monospace", size: 9.5 }
            }
          },
          y: {
            min: 1480,
            max: 1730,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#a1a1aa',
              stepSize: 40,
              callback: value => `${value}°`,
              font: { family: "'JetBrains Mono', monospace", size: 9.5 }
            }
          }
        }
      }
    });
  }

  renderChart(chartViewModel) {
    if (!this.tempChart) return;
    const { labels, temperatures, criticalLine, isOverheated, furnaceName, currentTemp } = chartViewModel;

    this.tempChart.data.labels = labels;
    this.tempChart.data.datasets[0].data = temperatures;
    this.tempChart.data.datasets[1].data = criticalLine;

    const ctx = this.chartGradients.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, 200);

    if (isOverheated) {
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.42)');
      grad.addColorStop(1, 'rgba(239, 68, 68, 0.02)');
      this.tempChart.data.datasets[0].borderColor = '#ef4444';
      this.tempChart.data.datasets[0].pointBackgroundColor = '#ff5500';
    } else {
      grad.addColorStop(0, 'rgba(16, 163, 127, 0.34)');
      grad.addColorStop(1, 'rgba(16, 163, 127, 0.01)');
      this.tempChart.data.datasets[0].borderColor = '#19c37d';
      this.tempChart.data.datasets[0].pointBackgroundColor = '#19c37d';
    }

    this.tempChart.data.datasets[0].backgroundColor = grad;
    this.tempChart.update('none');

    if (this.dom.chartSubInfo) {
      this.dom.chartSubInfo.textContent = `${furnaceName} · ${currentTemp} °C`;
    }
  }
}
