import { Iptv } from './native.js';
import { loadSource } from './playlist.js';
import { getPref } from './store.js';

// Проверка плейлиста: скачать, разобрать и убедиться, что хотя бы один поток реально отвечает.
const SAMPLE = 10; // сколько каналов пробуем (равномерно по всему списку)
const WAVE = 4; // сколько потоков проверяем одновременно
const TIMEOUT = 8000; // мс на один поток

const pick = (channels, n) => {
  const step = Math.max(1, Math.floor(channels.length / n));
  const out = [];
  for (let i = 0; i < channels.length && out.length < n; i += step) out.push(channels[i]);
  return out;
};

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

async function probeOne(ch) {
  try {
    return await withTimeout(
      Iptv.probe({ url: ch.url, ua: ch.ua || getPref('ua') || '', ref: ch.ref || '', timeout: TIMEOUT }),
      TIMEOUT + 6000,
    );
  } catch (e) {
    return { ok: false, reason: 'timeout' };
  }
}

// Результат: { ok, kind: 'ok' | 'load' | 'empty' | 'dead' | 'aborted', tried, total, detail }.
export async function checkSource(source, { signal } = {}) {
  let channels;
  try {
    channels = (await loadSource(source, { force: !source.file && !source.local })).channels;
  } catch (e) {
    const empty = String(e?.message) === 'empty';
    return { ok: false, kind: empty ? 'empty' : 'load', detail: empty ? '' : String(e?.message ?? e) };
  }
  if (!channels.length) return { ok: false, kind: 'empty', detail: '' };
  const sample = pick(channels, SAMPLE);
  let tried = 0;
  let reason = '';
  for (let i = 0; i < sample.length; i += WAVE) {
    if (signal?.aborted) return { ok: false, kind: 'aborted', tried };
    const wave = sample.slice(i, i + WAVE);
    const results = await Promise.all(wave.map(probeOne));
    tried += wave.length;
    const alive = results.find((r) => r.ok);
    if (alive) return { ok: true, kind: 'ok', tried, total: channels.length };
    reason = results[0]?.reason ?? reason;
  }
  return { ok: false, kind: 'dead', tried, total: channels.length, detail: reason };
}

// Несколько плейлистов подряд (по два одновременно). onResult(source, result, done) — после каждого.
export async function checkAll(sources, { signal, onResult } = {}) {
  let next = 0;
  let done = 0;
  const results = new Map();
  async function worker() {
    while (next < sources.length && !signal?.aborted) {
      const source = sources[next++];
      const result = await checkSource(source, { signal });
      if (result.kind === 'aborted') return;
      results.set(source.id, result);
      onResult?.(source, result, ++done);
    }
  }
  await Promise.all([worker(), worker()]);
  return results;
}
