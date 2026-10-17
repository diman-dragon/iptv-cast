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
  preferCast: true, // если ТВ подключён — каналы идут на ТВ
  ua: '', // свой User-Agent для всех каналов
  view: 'list', // вид библиотеки
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

// ---------- библиотека: загруженные плейлисты
export const customSources = () => readJson(K.sources, []);

// list: [{ name, url, type, emoji, desc, file }]. Плейлисты с уже известной ссылкой пропускаются.
// Возвращает только реально добавленные.
export function addSources(list) {
  const have = customSources();
  const urls = new Set(have.filter((x) => !x.file).map((x) => x.url));
  const added = [];
  list.forEach((x) => {
    if (!x.file && urls.has(x.url)) return;
    urls.add(x.url);
    added.push({
      id: `my-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: x.name,
      desc: x.desc,
      url: x.url || '',
      type: x.type || 'mix',
      emoji: x.emoji || (x.file ? '📄' : '🔗'),
      file: Boolean(x.file),
    });
  });
  if (added.length) {
    writeJson(K.sources, [...have, ...added]);
    changed('sources');
  }
  return added;
}

export const addSource = (x) => addSources([x])[0];

export function removeSource(id) {
  writeJson(K.sources, customSources().filter((s) => s.id !== id));
  changed('sources');
}

export function removeAllSources() {
  writeJson(K.sources, []);
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
