/**
 * ============================================================================
 * [M] MVP MODEL MODULE 2: src/mvp/models/authShiftModel.js
 * Назначение: Модель авторизации, сменной работы (Смена 1..3), кнопки «Конец смены»,
 *             добавления пользователей и матрицы ответственных за печи
 * ============================================================================
 * Роль в паттерне MVP:
 * 1. При запуске приложения требует обязательного ввода табельного номера и пароля
 *    (`currentUser = null`).
 * 2. Хранит штат сотрудников (`users`) и матрицу назначений `shiftAssignments`:
 *    за одну и ту же печь на разных сменах отвечают разные сталевары.
 * 3. Реализует завершение смены (`endCurrentShift`) с автоматическим выходом
 *    пользователя и переходом на следующую смену без остановки программы.
 *
 * ВАЖНО: Ничего не знает о DOM и HTML.
 */

export class AuthShiftModel {
  constructor() {
    this.shiftsCatalog = {
      1: { id: 1, name: 'Смена 1 (Дневная)', hours: '08:00–16:00', brigade: 'Бригада А' },
      2: { id: 2, name: 'Смена 2 (Вечерняя)', hours: '16:00–00:00', brigade: 'Бригада Б' },
      3: { id: 3, name: 'Смена 3 (Ночная)',   hours: '00:00–08:00', brigade: 'Бригада В' }
    };

    const hour = new Date().getHours();
    this.activeShiftId = (hour >= 8 && hour < 16) ? 1 : ((hour >= 16 && hour <= 23) ? 2 : 3);
    this.lastAutoShiftHour = hour;

    this.users = [
      { badgeNo: '10105', fullName: 'Лукашов Василий Григорьевич', role: 'Мастер смены ЭСПЦ-2', pinCode: '0000', isMaster: true },
      // Смена 1 (08:00–16:00)
      { badgeNo: '10421', fullName: 'Иванов Алексей Владимирович', role: 'Сталевар 6 разряда (Смена 1)', pinCode: '1111', isMaster: false },
      { badgeNo: '10422', fullName: 'Петров Сергей Николаевич', role: 'Сталевар 6 разряда (Смена 1)', pinCode: '2222', isMaster: false },
      { badgeNo: '10423', fullName: 'Ковалёв Дмитрий Игоревич', role: 'Сталевар 6 разряда (Смена 1)', pinCode: '3333', isMaster: false },
      // Смена 2 (16:00–00:00) — другие ответственные за те же печи!
      { badgeNo: '20421', fullName: 'Сидоренко Павел Петрович', role: 'Сталевар 6 разряда (Смена 2)', pinCode: '1111', isMaster: false },
      { badgeNo: '20422', fullName: 'Кравченко Максим Олегович', role: 'Сталевар 5 разряда (Смена 2)', pinCode: '2222', isMaster: false },
      { badgeNo: '20423', fullName: 'Беляев Артём Викторович', role: 'Сталевар 6 разряда (Смена 2)', pinCode: '3333', isMaster: false },
      // Смена 3 (00:00–08:00) — третья бригада ответственных!
      { badgeNo: '30421', fullName: 'Морозов Игорь Константинович', role: 'Сталевар 6 разряда (Смена 3)', pinCode: '1111', isMaster: false },
      { badgeNo: '30422', fullName: 'Захаров Николай Андреевич', role: 'Сталевар 5 разряда (Смена 3)', pinCode: '2222', isMaster: false },
      { badgeNo: '30423', fullName: 'Громов Роман Сергеевич', role: 'Сталевар 6 разряда (Смена 3)', pinCode: '3333', isMaster: false }
    ];

    // Матрица ответственных за печи по сменам: shiftAssignments[shiftId][furnaceId] = badgeNo
    this.shiftAssignments = {
      1: { 1: '10421', 2: '10422', 3: '10423' },
      2: { 1: '20421', 2: '20422', 3: '20423' },
      3: { 1: '30421', 2: '30422', 3: '30423' }
    };

    // Обязательная авторизация при запуске
    this.currentUser = null;
  }

  getUserByBadge(badgeNo) {
    return this.users.find(u => String(u.badgeNo) === String(badgeNo)) || null;
  }

  getActiveShift() {
    return this.shiftsCatalog[this.activeShiftId] || this.shiftsCatalog[1];
  }

  getResponsibleForFurnace(furnaceId, shiftId = this.activeShiftId) {
    const badgeNo = this.shiftAssignments[shiftId]?.[furnaceId];
    return this.getUserByBadge(badgeNo);
  }

  getAssignedFurnaceForUser(badgeNo, shiftId = this.activeShiftId) {
    const user = this.getUserByBadge(badgeNo);
    if (!user) return null;
    if (user.isMaster) return 0;

    const shiftMap = this.shiftAssignments[shiftId] || {};
    for (const [fId, assignedBadge] of Object.entries(shiftMap)) {
      if (String(assignedBadge) === String(badgeNo)) {
        return Number(fId);
      }
    }
    return null;
  }

  getUserAssignmentsAcrossShifts(badgeNo) {
    const user = this.getUserByBadge(badgeNo);
    if (user && user.isMaster) {
      return [{ shiftId: 0, shiftName: 'Все смены', furnaceId: 0, furnaceName: 'Все печи (Мастер)' }];
    }

    const list = [];
    [1, 2, 3].forEach(sId => {
      [1, 2, 3].forEach(fId => {
        if (String(this.shiftAssignments[sId]?.[fId]) === String(badgeNo)) {
          list.push({
            shiftId: sId,
            shiftName: `Смена ${sId}`,
            furnaceId: fId,
            furnaceName: `ДСП-${fId}`
          });
        }
      });
    });
    return list;
  }

  getShiftAssignmentsMatrix() {
    const matrix = [];
    Object.values(this.shiftsCatalog).forEach(shift => {
      const row = {
        shiftId: shift.id,
        shiftName: shift.name,
        hours: shift.hours,
        brigade: shift.brigade,
        isCurrentShift: shift.id === this.activeShiftId,
        furnaces: {}
      };
      [1, 2, 3].forEach(fId => {
        const badge = this.shiftAssignments[shift.id]?.[fId];
        const user = this.getUserByBadge(badge);
        row.furnaces[fId] = {
          furnaceId: fId,
          furnaceName: `ДСП-${fId}`,
          badgeNo: badge || '',
          fullName: user ? user.fullName : 'Не назначен',
          role: user ? user.role : '—'
        };
      });
      matrix.push(row);
    });
    return matrix;
  }

  authenticateUser(badgeNo, pinCode, targetShiftId = this.activeShiftId) {
    const cleanBadge = String(badgeNo || '').trim();
    const cleanPin = String(pinCode || '').trim();
    const shiftId = Number(targetShiftId) || this.activeShiftId;

    const user = this.getUserByBadge(cleanBadge);
    if (!user) {
      return { ok: false, error: `Пользователь с табельным номером №${cleanBadge} не найден.` };
    }
    if (String(user.pinCode) !== cleanPin) {
      return { ok: false, error: 'Неверный пароль (ПИН-код) пользователя.' };
    }

    let assignedFurnaceId = this.getAssignedFurnaceForUser(user.badgeNo, shiftId);
    let effectiveShiftId = shiftId;

    if (!user.isMaster && assignedFurnaceId === null) {
      const otherShifts = this.getUserAssignmentsAcrossShifts(user.badgeNo);
      if (otherShifts.length > 0) {
        effectiveShiftId = otherShifts[0].shiftId;
        assignedFurnaceId = otherShifts[0].furnaceId;
      }
    }

    this.activeShiftId = effectiveShiftId;
    this.currentUser = user;

    return {
      ok: true,
      user,
      shift: this.getActiveShift(),
      assignedFurnaceId
    };
  }

  endCurrentShift(activeFurnaceId) {
    const prevUser = this.currentUser;
    const prevShift = this.getActiveShift();
    const nextShiftId = this.activeShiftId === 1 ? 2 : (this.activeShiftId === 2 ? 3 : 1);
    const nextShift = this.shiftsCatalog[nextShiftId];
    const nextResponsible = this.getResponsibleForFurnace(activeFurnaceId, nextShiftId);

    this.currentUser = null;
    this.activeShiftId = nextShiftId;

    return {
      prevUser,
      prevShift,
      nextShift,
      nextResponsible
    };
  }

  formatShortName(fullName) {
    if (!fullName) return '—';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const initials = parts.slice(1).map(p => `${p[0]}.`).join('');
    return `${parts[0]} ${initials}`;
  }
}
