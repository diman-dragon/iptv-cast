import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { kvDel, kvGet, kvSet } from '../core/kv.js';
import { parseM3u } from './parse.js';
import { FAV_ID, HISTORY_ID, MINE_ID } from './sources.js';
import { customChannels, favorites, history } from './store.js';

const TTL = 12 * 3600 * 1000; // сколько кэш считается свежим
const MEM_MAX = 3;
const mem = new Map(); // id -> { time, channels }

// Зеркала: тот же список лежит и на GitHub Pages, и в ветке gh-pages репозитория.
const MIRRORS = [['https://iptv-org.github.io/iptv/', 'https://raw.githubusercontent.com/iptv-org/iptv/gh-pages/']];

export function candidates(url) {
  const list = [url];
  MIRRORS.forEach(([from, to]) => url.startsWith(from) && list.push(to + url.slice(from.length)));
  return list;
}

let lastVia = '';

async function viaNative(url) {
  // Нативный HTTP: без CORS, с заголовком User-Agent.
  const r = await CapacitorHttp.get({
    url,
    responseType: 'text',
    connectTimeout: 20000,
    readTimeout: 60000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) IPTVCast' },
  });
  if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}

async function viaFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// Пробует все способы по очереди; принимает только настоящий плейлист (не HTML-страницу ошибки).
async function fetchText(url) {
  const ways = Capacitor.isNativePlatform() ? [['native', viaNative], ['web', viaFetch]] : [['web', viaFetch]];
  let last;
  for (const [name, way] of ways) {
    try {
      const text = await way(url);
      if (/#EXTM3U|#EXTINF/i.test(text)) {
        lastVia = name;
        return text;
      }
      last = new Error('not a playlist');
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

async function download(url) {
  let last;
  for (const u of candidates(url)) {
    try {
      return await fetchText(u);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

// Проверка подключения для экрана настроек: что именно доступно с этого устройства.
export async function diagnose() {
  const targets = [
    'https://iptv-org.github.io/iptv/countries/rs.m3u',
    'https://raw.githubusercontent.com/iptv-org/iptv/gh-pages/countries/rs.m3u',
    'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
  ];
  const out = [];
  for (const url of targets) {
    const t0 = Date.now();
    const host = new URL(url).host;
    try {
      const n = parseM3u(await fetchText(url)).length;
      out.push(`✔ ${host}: ${n} · ${Date.now() - t0} ms · ${lastVia}`);
    } catch (e) {
      out.push(`✖ ${host}: ${e?.message ?? e}`);
    }
  }
  return out;
}

function remember(id, value) {
  mem.set(id, value);
  while (mem.size > MEM_MAX) mem.delete(mem.keys().next().value);
}

// Каналы источника. force — игнорировать кэш. Возвращает { channels, time, cached }.
export async function loadSource(source, { force = false } = {}) {
  // Виртуальные источники читаются из хранилища на лету и не кэшируются.
  const local = { [FAV_ID]: favorites, [HISTORY_ID]: history, [MINE_ID]: customChannels }[source.id];
  if (local) return { channels: local(), time: Date.now(), cached: true };

  const hit = mem.get(source.id);
  if (hit && !force) return { ...hit, cached: true };

  let text;
  let time = Date.now();
  let cached = false;
  if (source.file) {
    text = await kvGet(`file:${source.id}`);
    if (!text) throw new Error('empty');
    cached = true;
  } else {
    const saved = force ? null : await kvGet(`pl:${source.id}`);
    if (saved && Date.now() - saved.time < TTL) {
      ({ text, time } = saved);
      cached = true;
    } else {
      try {
        text = await download(source.url);
        await kvSet(`pl:${source.id}`, { time, text });
      } catch (e) {
        if (!saved) throw e;
        ({ text, time } = saved); // нет сети — показываем старый кэш
        cached = true;
      }
    }
  }
  const channels = parseM3u(text);
  if (!channels.length) throw new Error('empty');
  const value = { channels, time };
  remember(source.id, value);
  return { ...value, cached };
}

export const saveFileSource = (id, text) => kvSet(`file:${id}`, text);

export async function dropSourceData(id) {
  mem.delete(id);
  await Promise.all([kvDel(`pl:${id}`), kvDel(`file:${id}`)]);
}

export const clearMemory = () => mem.clear();
