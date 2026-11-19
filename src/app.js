/**
 * ============================================================================
 * COMPOSITION ROOT: src/app.js — ТОЧКА СБОРКИ И ЗАПУСКА АРХИТЕКТУРЫ MVP
 * ============================================================================
 * Роль в архитектурном паттерне MVP (Model – View – Presenter):
 * Файл `app.js` является точкой композиции (Composition Root).
 * Здесь создаются экземпляры:
 * 1. `FurnaceModel` (Модель данных и физики ДСП-135 ОАО «БМЗ»);
 * 2. `FurnaceView` (Пассивное представление: DOM, Chart.js, Three.js);
 * 3. `FurnacePresenter` (Презентер, которому через Dependency Injection
 *    передаются ссылки на `model` и `view`).
 */

import { FurnaceModel } from './model.js';
import { FurnaceView } from './view.js';
import { FurnacePresenter } from './presenter.js';

window.addEventListener('DOMContentLoaded', () => {
  // 1. Создаём экземпляр Модели (хранит данные ДСП-1, ДСП-2, ДСП-3 и проверяет пороги)
  const model = new FurnaceModel();

  // 2. Создаём экземпляр Представления (работает с DOM, Three.js и Chart.js)
  const view = new FurnaceView();

  // 3. Создаём экземпляр Презентера и связываем Model и View
  const presenter = new FurnacePresenter(model, view);

  // 4. Запускаем приложение
  presenter.init();

  // Экспортируем ссылку в window для удобной демонстрации преподавателю в консоли DevTools
  window.bmzApp = { model, view, presenter };

  // 5. Защита закрытия приложения по паролю (0000)
  const closeModal = document.getElementById('closeAppModal');
  const closeForm = document.getElementById('closeAppForm');
  const closeInput = document.getElementById('closeAppPasswordInput');
  const closeError = document.getElementById('closeAppErrorMsg');
  const btnCancelClose = document.getElementById('btnCancelCloseApp');
  const btnCloseExitModal = document.getElementById('btnCloseExitModal');

  const openCloseModal = () => {
    if (!closeModal) return;
    if (closeError) closeError.textContent = '';
    if (closeInput) closeInput.value = '';
    closeModal.classList.remove('hidden');
    setTimeout(() => closeInput?.focus(), 40);
  };

  const hideCloseModal = () => {
    closeModal?.classList.add('hidden');
    if (closeError) closeError.textContent = '';
    if (closeInput) closeInput.value = '';
  };

  btnCancelClose?.addEventListener('click', hideCloseModal);
  btnCloseExitModal?.addEventListener('click', hideCloseModal);
  closeModal?.addEventListener('click', (e) => {
    if (e.target === closeModal) hideCloseModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closeModal && !closeModal.classList.contains('hidden')) {
      hideCloseModal();
    }
  });

  closeForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = closeInput?.value.trim() || '';
    if (window.electronAPI && typeof window.electronAPI.confirmClose === 'function') {
      const res = await window.electronAPI.confirmClose(pwd);
      if (!res || !res.ok) {
        if (closeError) closeError.textContent = res?.error || 'Неверный пароль.';
        closeInput?.select();
      }
    }
  });

  if (window.electronAPI && typeof window.electronAPI.onRequestClose === 'function') {
    window.electronAPI.onRequestClose(openCloseModal);
  }
});
