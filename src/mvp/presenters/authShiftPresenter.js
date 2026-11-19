/**
 * ============================================================================
 * [P] MVP PRESENTER MODULE 2: src/mvp/presenters/authShiftPresenter.js
 * Назначение: Презентер авторизации по сменам, кнопки «Конец смены»,
 *             добавления пользователей и назначения ответственных за печи
 * ============================================================================
 * Роль в паттерне MVP:
 * Связывает `AuthShiftModel` и `AuthShiftView`.
 * 1. При запуске программы открывает обязательное окно ввода табельного номера
 *    и пароля, не останавливая фоновый приём данных от печи.
 * 2. Обрабатывает кнопку «Конец смены»: автоматически вылогинивает оператора,
 *    передаёт вахту следующей смене и запрашивает пароль нового пользователя.
 * 3. Обрабатывает назначение ответственных за печи ДСП-1..3 по сменам 1..3
 *    и добавление новых сотрудников.
 */

export class AuthShiftPresenter {
  constructor(rootModel, rootView) {
    this.model = rootModel;
    this.view = rootView;
  }

  init({ onSyncAll, onSaveState }) {
    this.onSyncAll = onSyncAll;
    this.onSaveState = onSaveState;

    this.view.bindEndShift(() => this.handleEndShift());

    this.view.bindStaffModalEvents({
      onOpenModal: () => this.refreshStaffModalView(),
      onLoginSubmit: credentials => this.handleLoginSubmit(credentials),
      onAssignResponsible: (shiftId, furnaceId, badgeNo) => this.handleAssignResponsible(shiftId, furnaceId, badgeNo),
      onAddUser: newUserData => this.handleAddUserSubmit(newUserData),
      onUpdateUser: (originalBadgeNo, updatedData) => this.handleUpdateUserSubmit(originalBadgeNo, updatedData),
      onDeleteUser: badgeNo => this.handleDeleteUser(badgeNo)
    });
  }

  openMandatoryStartupAuth() {
    const activeShift = this.model.getActiveShift();
    const resp = this.model.getResponsibleForFurnace(this.model.getActiveFurnace().id, activeShift.id);
    this.refreshStaffModalView();
    this.view.openStaffModal('auth', {
      isLocked: true,
      promptText: `Запуск АСУ ТП ДСП (${activeShift.name}). Введите табельный номер и пароль дежурного оператора (по графику за ДСП-1 отвечает: ${resp ? resp.fullName + ', Таб. №' + resp.badgeNo : '—'}). Приём данных от печей уже идёт в фоновом режиме 24/7.`
    });
  }

  refreshStaffModalView() {
    const activeShift = this.model.getActiveShift();
    const currentUser = this.model.getCurrentUser();
    const matrix = this.model.getShiftAssignmentsMatrix();

    const usersFormatted = this.model.getUsers().map(u => {
      const assigns = this.model.getUserAssignmentsAcrossShifts(u.badgeNo);
      const assignmentsText = assigns.length > 0
        ? assigns.map(a => a.shiftId === 0 ? a.furnaceName : `${a.shiftName}: ${a.furnaceName}`).join(' · ')
        : 'Не закреплён за печью';
      return {
        ...u,
        assignmentsText,
        firstShiftId: assigns[0]?.shiftId || activeShift.id
      };
    });

    this.view.renderStaffModal({
      users: usersFormatted,
      matrix,
      activeShiftId: activeShift.id,
      activeShiftLabel: `${activeShift.name} · ${activeShift.hours} · ${activeShift.brigade}`,
      currentUserBadge: currentUser?.badgeNo,
      isMaster: Boolean(currentUser?.isMaster)
    });
  }

  handleEndShift() {
    const shiftResult = this.model.endCurrentShift('Нажата кнопка «Конец смены»');
    if (this.onSaveState) this.onSaveState();
    if (this.onSyncAll) this.onSyncAll();
    this.onShiftEndedPrompt(shiftResult, false);
  }

  onShiftEndedPrompt(shiftResult, isAuto) {
    const { prevUser, prevShift, nextShift, nextResponsible } = shiftResult;
    this.refreshStaffModalView();

    const furnace = this.model.getActiveFurnace();
    const promptMsg = `Смена «${prevShift.name}» завершена (оператор ${prevUser ? prevUser.fullName : '—'} вылогинен). Программа продолжает непрерывно принимать данные от печей ДСП-1..3. Для приёма вахты «${nextShift.name}» (${nextShift.hours}) введите табельный номер и пароль (ответственный за ${furnace.name} на этой смене: ${nextResponsible ? nextResponsible.fullName + ', Таб. №' + nextResponsible.badgeNo : '—'}).`;

    this.view.openStaffModal('auth', {
      isLocked: true,
      promptText: promptMsg
    });

    this.view.showToast(
      isAuto ? 'Автоматическое завершение смены' : 'Смена завершена (Оператор вылогинен)',
      `Опрос датчиков печи продолжается в режиме 24/7. Ожидание входа оператора на «${nextShift.name}».`,
      'warning'
    );
  }

  handleLoginSubmit({ badgeNo, pinCode }) {
    const res = this.model.authenticateUser(badgeNo, pinCode);
    if (!res.ok) {
      this.view.setLoginError(res.error);
      return;
    }

    if (this.onSaveState) this.onSaveState();
    this.view.closeStaffModal();
    if (this.onSyncAll) this.onSyncAll();

    const postInfo = res.user.isMaster
      ? 'Доступ Мастера смены (все печи и управление штатом)'
      : (res.assignedFurnaceId ? `Ответственный за печь ДСП-${res.assignedFurnaceId}` : 'Дежурный оператор');

    this.view.showToast(
      `Смена принята (${res.shift.name})`,
      `${res.user.fullName} (Таб. №${res.user.badgeNo}) · ${postInfo}.`,
      'success'
    );
  }

  handleAssignResponsible(shiftId, furnaceId, badgeNo) {
    const res = this.model.assignResponsibleForFurnace(shiftId, furnaceId, badgeNo);
    if (!res.ok) {
      this.view.showToast('Ошибка назначения', res.error, 'danger');
      return;
    }

    if (this.onSaveState) this.onSaveState();
    this.refreshStaffModalView();
    if (this.onSyncAll) this.onSyncAll();

    this.view.showToast(
      `Назначен ответственный за ДСП-${furnaceId}`,
      `${res.shift.name}: за печь ДСП-${furnaceId} теперь отвечает ${res.user.fullName} (Таб. №${res.user.badgeNo}).`,
      'success'
    );
  }

  handleAddUserSubmit(newUserData) {
    const res = this.model.addUser(newUserData);
    if (!res.ok) {
      this.view.setAddUserError(res.error);
      return;
    }

    if (this.onSaveState) this.onSaveState();
    this.view.clearAddUserForm();
    this.view.setAddUserError('');
    this.refreshStaffModalView();
    if (this.onSyncAll) this.onSyncAll();

    this.view.showToast(
      'Новый пользователь добавлен',
      `${res.user.fullName} (Таб. №${res.user.badgeNo}, ${res.user.role}) зарегистрирован в системе.`,
      'success'
    );
  }

  handleUpdateUserSubmit(originalBadgeNo, updatedData) {
    const res = this.model.updateUser(originalBadgeNo, updatedData);
    if (!res.ok) {
      this.view.setAddUserError(res.error);
      return;
    }

    if (this.onSaveState) this.onSaveState();
    this.view.clearAddUserForm();
    this.view.setAddUserError('');
    this.refreshStaffModalView();
    if (this.onSyncAll) this.onSyncAll();

    this.view.showToast(
      'Данные сотрудника обновлены',
      `${res.user.fullName} (Таб. №${res.user.badgeNo}, ${res.user.role}).`,
      'success'
    );
  }

  handleDeleteUser(badgeNo) {
    const res = this.model.deleteUser(badgeNo);
    if (!res.ok) {
      this.view.showToast('Ограничение удаления', res.error, 'warning');
      return;
    }

    if (this.onSaveState) this.onSaveState();
    this.refreshStaffModalView();
    if (this.onSyncAll) this.onSyncAll();
    this.view.showToast('Штат обновлён', `Сотрудник (Таб. №${badgeNo}) удалён из списка.`, 'warning');
  }
}
