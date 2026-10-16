import { findTheme, systemTheme } from './themes.js';
import { loadTheme, saveTheme } from './theme-storage.js';
import { syncSystemBars } from './system-bars.js';

let current = 'dark';

export const getTheme = () => current;

function apply(id) {
  const theme = findTheme(id);
  current = theme.id;
  document.documentElement.dataset.theme = theme.id;
  syncSystemBars(theme);
}

// Выбор пользователя запоминаем; тему системы — нет, чтобы она продолжала действовать.
export function setTheme(id) {
  apply(id);
  saveTheme(current);
}

// Вызывается один раз при старте, до отрисовки интерфейса.
export function initTheme() {
  apply(loadTheme() ?? systemTheme());
}
