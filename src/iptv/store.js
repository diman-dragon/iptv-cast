import { readJson, writeJson } from '../core/storage.js';

// Всё пользовательское: свои источники, свои каналы, избранное, история, настройки.
const K = {
  sources: 'iptvcast.sources', // свои источники (плейлисты)
  channels: 'iptvcast.channels', // свои одиночные каналы
  fav: 'iptvcast.fav',
  history: 'iptvcast.history',
  prefs: 'iptvcast.prefs',
};
const HISTORY_MAX = 40;

const listeners = new Set();
export const onStoreChange = (fn) => listeners.add(fn);
const changed = (what) => listeners.forEach((fn) => fn(what));

// ---------- настройки
const DEFAULTS = {
  video: true, // сразу открывать видео на весь экран
  preferCast: true, // если ТВ подключён — каналы идут на ТВ
  ua: '', // свой User-Agent для всех каналов
  view: 'list', // вид каталога
  cview: 'list', // вид списка каналов
  lastSource: 'freetv',
  lastType: 'all',
};

export const getPrefs = () => ({ ...DEFAULTS, ...readJson(K.prefs, {}) });
export const getPref = (key) => getPrefs()[key];
export function setPref(key, value) {
  writeJson(K.prefs, { ...readJson(K.prefs, {}), [key]: value });
  changed('prefs');
}

// ---------- свои источники
export const customSources = () => readJson(K.sources, []);

export function addSource({ name, url, type, file = false }) {
  const id = `my-${Date.now().toString(36)}`;
  const item = { id, name, url, type, file, builtin: false, emoji: file ? '📄' : '🔗' };
  writeJson(K.sources, [...customSources(), item]);
  changed('sources');
  return item;
}

export function removeSource(id) {
  writeJson(K.sources, customSources().filter((s) => s.id !== id));
  changed('sources');
}

// ---------- свои каналы
export const customChannels = () => readJson(K.channels, []);

export function addChannel({ name, url, group, logo = '' }) {
  writeJson(K.channels, [...customChannels(), { name, url, group, logo, ua: '', ref: '' }]);
  changed('channels');
}

export function removeChannel(url) {
  writeJson(K.channels, customChannels().filter((c) => c.url !== url));
  changed('channels');
}

// ---------- избранное
export const favorites = () => readJson(K.fav, []);
export const isFavorite = (url) => favorites().some((c) => c.url === url);

export function toggleFavorite(channel) {
  const list = favorites();
  const next = list.some((c) => c.url === channel.url)
    ? list.filter((c) => c.url !== channel.url)
    : [{ ...channel }, ...list];
  writeJson(K.fav, next);
  changed('fav');
  return next.some((c) => c.url === channel.url);
}

// ---------- история
export const history = () => readJson(K.history, []);

export function pushHistory(channel) {
  const rest = history().filter((c) => c.url !== channel.url);
  writeJson(K.history, [{ ...channel }, ...rest].slice(0, HISTORY_MAX));
  changed('history');
}

export function clearHistory() {
  writeJson(K.history, []);
  changed('history');
}
