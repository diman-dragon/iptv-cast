// Состояние навигации: какой экран открыт сейчас.
export const HOME = 'library';

let current = HOME;
const listeners = new Set();

export const getScreen = () => current;

export function navigate(id) {
  if (id === current) return;
  current = id;
  listeners.forEach((fn) => fn(current));
}

export const goHome = () => navigate(HOME);

export function onNavigate(fn) {
  listeners.add(fn);
}
