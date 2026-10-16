import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { kvDel, kvGet, kvSet } from '../core/kv.js';
import { parseM3u } from './parse.js';
import { MINE_ID } from './sources.js';
import { customChannels } from './store.js';

const TTL = 12 * 3600 * 1000; // сколько кэш считается свежим
const MEM_MAX = 3;
const mem = new Map(); // id -> { time, channels }

async function download(url) {
  if (Capacitor.isNativePlatform()) {
    // Через нативный HTTP: без CORS, с заголовком User-Agent.
    const r = await CapacitorHttp.get({
      url,
      responseType: 'text',
      connectTimeout: 20000,
      readTimeout: 60000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) IPTVCast' },
    });
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    return typeof r.data === 'string' ? r.data : String(r.data ?? '');
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function remember(id, value) {
  mem.set(id, value);
  while (mem.size > MEM_MAX) mem.delete(mem.keys().next().value);
}

// Каналы источника. force — игнорировать кэш. Возвращает { channels, time, cached }.
export async function loadSource(source, { force = false } = {}) {
  if (source.id === MINE_ID) return { channels: customChannels(), time: Date.now(), cached: true };

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
