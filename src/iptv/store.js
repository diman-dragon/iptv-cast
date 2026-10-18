import { readJson, removeStored, writeJson } from '../core/storage.js';

// Всё пользовательское: свои источники, свои каналы, избранное, история, настройки.
const K = {
  sources: 'iptvcast.sources', // свои источники (плейлисты)
  channels: 'iptvcast.channels', // свои одиночные каналы
  fav: 'iptvcast.fav',
  history: 'iptvcast.history',
  prefs: 'iptvcast.prefs',
};
const HISTORY_MAX = 40;
export const MINE_ID = 'mine-channels'; // «Мои каналы» — встроенный свой плейлист
const CHECKS = 'iptvcast.checks';

const listeners = new Set();
export const onStoreChange = (fn) => listeners.add(fn);
const changed = (what) => listeners.forEach((fn) => fn(what));

// ---------- настройки
const DEFAULTS = {
  preferCast: true, // если ТВ подключён — каналы идут на ТВ
  castProxy: true, // Chromecast получает поток через телефон (CORS, User-Agent, HLS)
  dlnaProxy: false, // DLNA-телевизор берёт поток напрямую; через телефон — только по желанию
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
    const remote = x.url && !x.file && !x.local;
    if (remote && urls.has(x.url)) return;
    if (remote) urls.add(x.url);
    added.push({
      id: `my-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: x.name,
      desc: x.desc,
      url: x.url || '',
      type: x.type || 'mix',
      emoji: x.emoji || (x.local ? '📝' : x.file ? '📄' : '🔗'),
      file: Boolean(x.file),
      local: Boolean(x.local),
    });
  });
  if (added.length) {
    writeJson(K.sources, [...have, ...added]);
    changed('sources');
  }
  return added;
}

export const addSource = (x) => addSources([x])[0];

// Правка плейлиста: patch = { name, emoji, type, desc, url }.
export function updateSource(id, patch) {
  writeJson(K.sources, customSources().map((s) => (s.id === id ? { ...s, ...patch } : s)));
  changed('sources');
}

export function removeSource(id) {
  writeJson(K.sources, customSources().filter((s) => s.id !== id));
  removeStored(localKey(id));
  clearCheck(id);
  changed('sources');
}

export function removeAllSources() {
  customSources().forEach((s) => removeStored(localKey(s.id)));
  writeJson(K.sources, []);
  writeJson(CHECKS, {});
  changed('sources');
}

// ---------- результаты проверки плейлистов
export const getChecks = () => readJson(CHECKS, {});

export function setCheck(id, result) {
  writeJson(CHECKS, { ...getChecks(), [id]: { ...result, time: Date.now() } });
  changed('checks');
}

export function clearCheck(id) {
  const all = getChecks();
  if (!(id in all)) return;
  delete all[id];
  writeJson(CHECKS, all);
  changed('checks');
}

// ---------- каналы своих плейлистов (MINE_ID — «Мои каналы», остальные — созданные пользователем)
const localKey = (id) => (id === MINE_ID ? K.channels : `iptvcast.lc.${id}`);

export const localChannels = (id) => readJson(localKey(id), []);

// Создать канал или (если задан oldUrl) изменить существующий.
export function saveLocalChannel(id, channel, oldUrl) {
  const list = localChannels(id);
  const at = list.findIndex((c) => c.url === (oldUrl ?? channel.url));
  const item = { ua: '', ref: '', logo: '', ...(at >= 0 ? list[at] : {}), ...channel };
  if (at >= 0) list[at] = item;
  else list.push(item);
  writeJson(localKey(id), list);
  changed('channels');
}

export function deleteLocalChannel(id, url) {
  writeJson(localKey(id), localChannels(id).filter((c) => c.url !== url));
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
