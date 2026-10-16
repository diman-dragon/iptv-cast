// Что показывает экран «Каналы»: источник, избранное или история; поиск и группа.
const S = { mode: 'source', sourceId: null, query: '', group: '' };
const listeners = new Set();

export const getView = () => S;
export const onView = (fn) => listeners.add(fn);

export function setView(patch) {
  Object.assign(S, patch);
  listeners.forEach((fn) => fn(S));
}
