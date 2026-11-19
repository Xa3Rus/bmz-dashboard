/**
 * ============================================================================
 * [P] MVP PRESENTER MODULE 3: src/mvp/presenters/incidentsPresenter.js
 * Назначение: Презентер аварийной сигнализации, плашки «АВАРИЯ + Инструкция СОП»
 *             и круглосуточного учёта аварий по дням (24/7)
 * ============================================================================
 * Роль в паттерне MVP:
 * Связывает `IncidentsModel` и `IncidentsView`.
 * 1. При симуляции аварии или превышении 1650 °C фиксирует инцидент в суточном
 *    учёте по дням (с ФИО ответственного сталевара активной смены) и командует
 *    `View` высветить плашку «АВАРИЯ» с пошаговой инструкцией по устранению (СОП).
 * 2. При нажатии «Выполнить инструкцию и включить аварийное охлаждение»
 *    запускает охлаждение печи и скрывает плашку аварии.
 * 3. Управляет фильтрацией суточного реестра аварий по дате, смене и печи.
 */

export class IncidentsPresenter {
  constructor(rootModel, rootView) {
    this.model = rootModel;
    this.view = rootView;
    this.incidentFilters = {
      dateKey: 'ALL',
      shiftId: 'ALL',
      furnaceId: 'ALL'
    };
  }

  init({ onSyncAll, onSaveState }) {
    this.onSyncAll = onSyncAll;
    this.onSaveState = onSaveState;

    this.view.bindEmergencySimulate(() => this.handleEmergencySimulate());
    this.view.bindEmergencyCooling(() => this.handleEmergencyCooling());

    this.view.bindIncidentsModalEvents({
      onOpenIncidents: () => this.refreshIncidentsModalView(),
      onFilterChange: filters => {
        this.incidentFilters = filters;
        this.refreshIncidentsModalView();
      }
    });
  }

  showAlarmInstructionForFurnace(furnace) {
    const shift = this.model.getActiveShift();
    const resp = this.model.getResponsibleForFurnace(furnace.id, shift.id);
    const instruction = this.model.getEmergencyInstruction('АВ-01');

    this.view.showAlarmInstructionOverlay({
      furnaceName: furnace.name,
      temperature: furnace.temperature,
      responsibleName: resp ? resp.fullName : 'Не назначен',
      responsibleBadge: resp ? resp.badgeNo : '—',
      shiftName: shift.name,
      instruction
    });
  }

  handleEmergencySimulate() {
    const furnace = this.model.triggerEmergency();
    if (this.onSaveState) this.onSaveState();
    if (this.onSyncAll) this.onSyncAll();

    if (furnace.isEmergency) {
      this.showAlarmInstructionForFurnace(furnace);

      const resp = this.model.getResponsibleForFurnace(furnace.id);
      const shift = this.model.getActiveShift();
      this.view.showToast(
        `АВАРИЯ НА ПЕЧИ ${furnace.name}!`,
        `Температура ${furnace.temperature} °C (> 1650 °C). Выведена инструкция СОП по устранению. Ответственный (${shift.name}): ${resp ? resp.fullName : '—'}.`,
        'danger'
      );
    }
  }

  handleEmergencyCooling() {
    const furnace = this.model.activateEmergencyCooling();
    this.view.hideAlarmInstructionOverlay();
    if (this.onSaveState) this.onSaveState();
    if (this.onSyncAll) this.onSyncAll();

    this.view.showToast(
      `Инструкция выполнена · Аварийное охлаждение (${furnace.name})`,
      'Форсирована подача охлаждающей воды на панели свода (112.5 м³/ч) и снижена мощность трансформатора до 32 МВт.',
      'warning'
    );
  }

  refreshIncidentsModalView() {
    const dailyStats = this.model.getDailyIncidentsStats(7);
    const filtered = this.model.getFilteredIncidents(this.incidentFilters);
    this.view.renderIncidentsModal(dailyStats, filtered, this.incidentFilters);
  }

  openDayInRegistry(selectedDateKey) {
    this.incidentFilters.dateKey = selectedDateKey;
    this.view.openIncidentsModal();
    this.refreshIncidentsModalView();
  }
}
