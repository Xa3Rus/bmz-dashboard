/**
 * ============================================================================
 * [V] MVP VIEW MODULE 3: src/mvp/views/authShiftView.js
 * Назначение: Пассивное представление обязательной авторизации по сменам,
 *             матрицы назначения ответственных за печи 3x3 и добавления пользователей
 * ============================================================================
 * Роль в паттерне MVP:
 * Отрисовывает модальное окно входа по табельному номеру и паролю,
 * таблицу назначения ответственных за печи ДСП-1..3 по сменам 1..3 и список штата.
 */

export class AuthShiftView {
  constructor() {
    this.dom = {
      btnOpenAuthModal: document.getElementById('btnOpenAuthModal'),
      btnOpenStaffAssign: document.getElementById('btnOpenStaffAssign'),
      btnQuickAssignResp: document.getElementById('btnQuickAssignResp'),
      staffModal: document.getElementById('staffModal'),
      authModalStatusBadge: document.getElementById('authModalStatusBadge'),
      loginPromptBanner: document.getElementById('loginPromptBanner'),
      btnCloseStaffModal: document.getElementById('btnCloseStaffModal'),
      staffTabBtns: document.querySelectorAll('[data-staff-tab]'),
      loginForm: document.getElementById('loginForm'),
      loginShiftSelect: document.getElementById('loginShiftSelect'),
      loginBadgeInput: document.getElementById('loginBadgeInput'),
      loginPinInput: document.getElementById('loginPinInput'),
      loginErrorMsg: document.getElementById('loginErrorMsg'),
      quickRosterGrid: document.getElementById('quickRosterGrid'),
      shiftMatrixTbody: document.getElementById('shiftMatrixTbody'),
      addUserForm: document.getElementById('addUserForm'),
      newBadgeInput: document.getElementById('newBadgeInput'),
      newPinInput: document.getElementById('newPinInput'),
      newFullNameInput: document.getElementById('newFullNameInput'),
      newRoleSelect: document.getElementById('newRoleSelect'),
      newAssignShiftSelect: document.getElementById('newAssignShiftSelect'),
      newAssignFurnaceSelect: document.getElementById('newAssignFurnaceSelect'),
      addUserErrorMsg: document.getElementById('addUserErrorMsg'),
      usersListTbody: document.getElementById('usersListTbody')
    };

    this.isAuthLocked = true;
    this._initModalTabs();
  }

  _initModalTabs() {
    this.dom.staffTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchStaffModalTab(btn.dataset.staffTab);
      });
    });
  }

  bindStaffModalEvents({ onOpenModal, onLoginSubmit, onAssignResponsible, onAddUser, onDeleteUser }) {
    this.onAssignResponsibleCallback = onAssignResponsible;
    this.onDeleteUserCallback = onDeleteUser;

    this.dom.btnOpenAuthModal?.addEventListener('click', () => {
      this.openStaffModal('auth', { isLocked: this.isAuthLocked });
      if (onOpenModal) onOpenModal();
    });

    this.dom.btnOpenStaffAssign?.addEventListener('click', () => {
      this.openStaffModal('matrix', { isLocked: this.isAuthLocked });
      if (onOpenModal) onOpenModal();
    });

    this.dom.btnQuickAssignResp?.addEventListener('click', () => {
      this.openStaffModal('matrix', { isLocked: this.isAuthLocked });
      if (onOpenModal) onOpenModal();
    });

    this.dom.btnCloseStaffModal?.addEventListener('click', () => {
      if (!this.isAuthLocked) this.closeStaffModal();
    });

    this.dom.staffModal?.addEventListener('click', e => {
      if (e.target === this.dom.staffModal && !this.isAuthLocked) {
        this.closeStaffModal();
      }
    });

    this.dom.loginForm?.addEventListener('submit', e => {
      e.preventDefault();
      if (onLoginSubmit) {
        onLoginSubmit({
          shiftId: Number(this.dom.loginShiftSelect?.value || 1),
          badgeNo: this.dom.loginBadgeInput?.value.trim() || '',
          pinCode: this.dom.loginPinInput?.value.trim() || ''
        });
      }
    });

    this.dom.addUserForm?.addEventListener('submit', e => {
      e.preventDefault();
      if (onAddUser) {
        onAddUser({
          badgeNo: this.dom.newBadgeInput?.value.trim() || '',
          pinCode: this.dom.newPinInput?.value.trim() || '',
          fullName: this.dom.newFullNameInput?.value.trim() || '',
          role: this.dom.newRoleSelect?.value || 'Сталевар 6 разряда',
          assignShiftId: Number(this.dom.newAssignShiftSelect?.value || 0),
          assignFurnaceId: Number(this.dom.newAssignFurnaceSelect?.value || 0)
        });
      }
    });
  }

  openStaffModal(defaultTab = 'auth', options = {}) {
    const { isLocked = false, promptText = '' } = options;
    this.isAuthLocked = Boolean(isLocked);

    this.setLoginError('');
    this.setAddUserError('');

    if (this.dom.btnCloseStaffModal) {
      this.dom.btnCloseStaffModal.classList.toggle('hidden', this.isAuthLocked);
    }

    if (this.dom.authModalStatusBadge) {
      this.dom.authModalStatusBadge.textContent = this.isAuthLocked
        ? 'ОБЯЗАТЕЛЬНАЯ АВТОРИЗАЦИЯ СМЕНЫ'
        : 'УПРАВЛЕНИЕ ПЕРСОНАЛОМ И СМЕНАМИ';
    }

    if (this.dom.loginPromptBanner && promptText) {
      this.dom.loginPromptBanner.textContent = promptText;
    }

    if (this.dom.loginPinInput) {
      this.dom.loginPinInput.value = '';
    }

    this.dom.staffModal?.classList.remove('hidden');
    this.switchStaffModalTab(defaultTab);

    setTimeout(() => {
      this.dom.loginBadgeInput?.focus();
    }, 60);
  }

  closeStaffModal() {
    this.isAuthLocked = false;
    this.dom.staffModal?.classList.add('hidden');
  }

  switchStaffModalTab(tabName) {
    this.dom.staffTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.staffTab === tabName);
    });
    ['auth', 'matrix', 'users'].forEach(paneKey => {
      const pane = document.getElementById(`staffPane-${paneKey}`);
      pane?.classList.toggle('active', paneKey === tabName);
    });
  }

  setLoginError(msg) {
    if (this.dom.loginErrorMsg) this.dom.loginErrorMsg.textContent = msg || '';
  }

  setAddUserError(msg) {
    if (this.dom.addUserErrorMsg) this.dom.addUserErrorMsg.textContent = msg || '';
  }

  clearAddUserForm() {
    if (this.dom.newBadgeInput) this.dom.newBadgeInput.value = '';
    if (this.dom.newFullNameInput) this.dom.newFullNameInput.value = '';
    if (this.dom.newPinInput) this.dom.newPinInput.value = '1234';
  }

  renderStaffModal({ users, matrix, activeShiftId, currentUserBadge }) {
    if (this.dom.loginShiftSelect) {
      this.dom.loginShiftSelect.value = String(activeShiftId);
    }

    if (this.dom.quickRosterGrid) {
      this.dom.quickRosterGrid.innerHTML = users.map(u => {
        const assignSummary = u.assignmentsText || (u.isMaster ? 'Все смены · Все печи (Мастер)' : 'Резерв цеха');
        const defaultShift = u.firstShiftId || activeShiftId;
        return `
          <div class="roster-user-card" data-badge="${u.badgeNo}" data-pin="${u.pinCode}" data-shift="${defaultShift}">
            <div class="roster-user-info">
              <span class="roster-user-name">${u.fullName}</span>
              <span class="roster-user-role">${u.role}</span>
              <span class="roster-user-assign">${assignSummary}</span>
            </div>
            <div class="roster-user-cred">
              Таб. №<b>${u.badgeNo}</b><br/>Пароль: <b>${u.pinCode}</b>
            </div>
          </div>
        `;
      }).join('');

      this.dom.quickRosterGrid.querySelectorAll('.roster-user-card').forEach(card => {
        card.addEventListener('click', () => {
          if (this.dom.loginBadgeInput) this.dom.loginBadgeInput.value = card.dataset.badge;
          if (this.dom.loginPinInput) {
            this.dom.loginPinInput.value = card.dataset.pin;
            this.dom.loginPinInput.focus();
          }
          if (this.dom.loginShiftSelect && card.dataset.shift) {
            this.dom.loginShiftSelect.value = card.dataset.shift;
          }
          this.setLoginError('');
        });
      });
    }

    if (this.dom.shiftMatrixTbody) {
      this.dom.shiftMatrixTbody.innerHTML = matrix.map(row => {
        const renderCellSelect = (furnaceId) => {
          const currentBadge = row.furnaces[furnaceId]?.badgeNo || '';
          const options = users.map(u =>
            `<option value="${u.badgeNo}" ${String(u.badgeNo) === String(currentBadge) ? 'selected' : ''}>${u.fullName} (Таб. №${u.badgeNo})</option>`
          ).join('');

          return `
            <select class="scada-input scada-input-sm matrix-assign-select" data-shift-id="${row.shiftId}" data-furnace-id="${furnaceId}">
              ${options}
            </select>
          `;
        };

        return `
          <tr>
            <td>
              <strong>${row.shiftName}</strong>
              ${row.isCurrentShift ? '<span class="codex-badge" style="margin-left:6px;">АКТИВНА</span>' : ''}
            </td>
            <td style="font-family:var(--font-mono);">${row.hours} · ${row.brigade}</td>
            <td>${renderCellSelect(1)}</td>
            <td>${renderCellSelect(2)}</td>
            <td>${renderCellSelect(3)}</td>
          </tr>
        `;
      }).join('');

      this.dom.shiftMatrixTbody.querySelectorAll('.matrix-assign-select').forEach(sel => {
        sel.addEventListener('change', () => {
          const shiftId = Number(sel.dataset.shiftId);
          const furnaceId = Number(sel.dataset.furnaceId);
          const badgeNo = sel.value;
          if (this.onAssignResponsibleCallback) {
            this.onAssignResponsibleCallback(shiftId, furnaceId, badgeNo);
          }
        });
      });
    }

    if (this.dom.usersListTbody) {
      this.dom.usersListTbody.innerHTML = users.map(u => {
        const isCurrent = String(u.badgeNo) === String(currentUserBadge);
        const canDelete = !isCurrent && String(u.badgeNo) !== '10105';
        return `
          <tr>
            <td style="font-family:var(--font-mono); font-weight:700;">№${u.badgeNo}</td>
            <td><strong>${u.fullName}</strong></td>
            <td>${u.role}</td>
            <td style="font-family:var(--font-mono); color:var(--prim-codex-300);">${u.assignmentsText}</td>
            <td>
              ${isCurrent
                ? '<span class="codex-badge">На посту</span>'
                : (canDelete
                    ? `<button type="button" class="btn-table-del" data-del-badge="${u.badgeNo}">Удалить</button>`
                    : '<span style="color:var(--text-dim); font-size:10px;">Системный</span>')
              }
            </td>
          </tr>
        `;
      }).join('');

      this.dom.usersListTbody.querySelectorAll('[data-del-badge]').forEach(btn => {
        btn.addEventListener('click', () => {
          const badge = btn.dataset.delBadge;
          if (this.onDeleteUserCallback) {
            this.onDeleteUserCallback(badge);
          }
        });
      });
    }
  }
}
