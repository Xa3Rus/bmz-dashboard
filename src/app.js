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
});
