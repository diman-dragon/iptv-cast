// Какой источник открыт внутри библиотеки (null — показан список плейлистов).
const S = { sourceId: null };
const listeners = new Set();

export const getView = () => S;
export const onView = (fn) => listeners.add(fn);

export function setView(patch) {
  Object.assign(S, patch);
  listeners.forEach((fn) => fn(S));
}
