/**
 * ============================================================================
 * МОДУЛЬ 2 (Подключается в main.js): modules/authShiftModule.js
 * Назначение: Авторизация, управление сменами, добавление пользователей
 *             и назначение ответственных за печи ДСП-1, ДСП-2, ДСП-3
 * ============================================================================
 * Реализует бизнес-правила ЭСПЦ-2 ОАО «БМЗ»:
 * 1. За одну и ту же печь на разных сменах (Смена 1 / Смена 2 / Смена 3)
 *    отвечают разные сталевары.
 * 2. При запуске программы и после нажатия «Конец смены» требуется обязательный
 *    ввод табельного номера и пароля (ПИН-кода).
 * 3. Позволяет добавлять новых пользователей и переназначать ответственных за печи.
 */

class AuthShiftModule {
  constructor() {
    this.shiftsCatalog = {
      1: { id: 1, name: 'Смена 1 (Дневная)', hours: '08:00–16:00', brigade: 'Бригада А' },
      2: { id: 2, name: 'Смена 2 (Вечерняя)', hours: '16:00–00:00', brigade: 'Бригада Б' },
      3: { id: 3, name: 'Смена 3 (Ночная)',   hours: '00:00–08:00', brigade: 'Бригада В' }
    };

    // Штатное расписание по умолчанию (3 смены по 3 сталевара + Мастер смены)
    this.defaultUsers = [
      { badgeNo: '10105', fullName: 'Лукашов Василий Григорьевич', role: 'Мастер смены ЭСПЦ-2', pinCode: '0000', isMaster: true },
      { badgeNo: '10421', fullName: 'Иванов Алексей Владимирович', role: 'Сталевар 6 разряда (Смена 1)', pinCode: '1111', isMaster: false },
      { badgeNo: '10422', fullName: 'Петров Сергей Николаевич', role: 'Сталевар 6 разряда (Смена 1)', pinCode: '2222', isMaster: false },
      { badgeNo: '10423', fullName: 'Ковалёв Дмитрий Игоревич', role: 'Сталевар 6 разряда (Смена 1)', pinCode: '3333', isMaster: false },
      { badgeNo: '20421', fullName: 'Сидоренко Павел Петрович', role: 'Сталевар 6 разряда (Смена 2)', pinCode: '1111', isMaster: false },
      { badgeNo: '20422', fullName: 'Кравченко Максим Олегович', role: 'Сталевар 5 разряда (Смена 2)', pinCode: '2222', isMaster: false },
      { badgeNo: '20423', fullName: 'Беляев Артём Викторович', role: 'Сталевар 6 разряда (Смена 2)', pinCode: '3333', isMaster: false },
      { badgeNo: '30421', fullName: 'Морозов Игорь Константинович', role: 'Сталевар 6 разряда (Смена 3)', pinCode: '1111', isMaster: false },
      { badgeNo: '30422', fullName: 'Захаров Николай Андреевич', role: 'Сталевар 5 разряда (Смена 3)', pinCode: '2222', isMaster: false },
      { badgeNo: '30423', fullName: 'Громов Роман Сергеевич', role: 'Сталевар 6 разряда (Смена 3)', pinCode: '3333', isMaster: false }
    ];

    // Матрица ответственных по умолчанию: shiftAssignments[shiftId][furnaceId] = badgeNo
    this.defaultAssignments = {
      1: { 1: '10421', 2: '10422', 3: '10423' },
      2: { 1: '20421', 2: '20422', 3: '20423' },
      3: { 1: '30421', 2: '30422', 3: '30423' }
    };
  }

  getDefaultStaffConfig() {
    return {
      shiftsCatalog: this.shiftsCatalog,
      users: this.defaultUsers,
      shiftAssignments: this.defaultAssignments
    };
  }

  /**
   * Регистрация IPC-обработчиков модуля авторизации и смен в main.js
   */
  registerIpcHandlers(ipcMain) {
    ipcMain.handle('auth:defaults', () => this.getDefaultStaffConfig());
  }
}

module.exports = { AuthShiftModule };
