import { Iptv } from './native.js';
import { addRemoved, clearRemoved, getVerified, loadSource, setVerified } from './playlist.js';
import { deleteLocalChannels, getPref, restoreLocalChannels } from './store.js';

// Проверка КАЖДОГО канала плейлиста: поток открывается как в плеере (для HLS — до первого сегмента).
// Не отвечающие каналы удаляются автоматически (с возможностью вернуть).
const CONCURRENCY = 24; // потоков проверяем одновременно
const TIMEOUT = 7000; // мс на канал в первом проходе
const RETRY_TIMEOUT = 12000; // мс в повторном проходе
const VERIFIED_TTL = 24 * 3600 * 1000; // работавшие каналы повторно не проверяем сутки
// Причины, которые могли быть случайным сбоем связи: такие каналы перепроверяются, а не удаляются сразу.
const SOFT = new Set(['timeout', 'network', 'error']);

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

async function probeOne(ch, timeout) {
  try {
    return await withTimeout(
      Iptv.probe({ url: ch.url, ua: ch.ua || getPref('ua') || '', ref: ch.ref || '', timeout }),
      timeout + 6000,
    );
  } catch {
    return { ok: false, reason: 'timeout' };
  }
}

// Раздаёт задачи n рабочим: пока одни ждут ответа, другие уже идут дальше.
async function pool(items, n, job, signal) {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal?.aborted) await job(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

// Проверяет список каналов. Возвращает { alive, dead: [{ ch, reason }], offline, aborted }.
export async function checkChannels(channels, { signal, onProgress } = {}) {
  const alive = [];
  const failed = []; // { ch, reason }
  let done = 0;
  const report = (phase) => onProgress?.({ phase, done, alive: alive.length, dead: failed.length });

  await pool(
    channels,
    CONCURRENCY,
    async (ch) => {
      const r = await probeOne(ch, TIMEOUT);
      done++;
      if (r.ok) alive.push(ch);
      else failed.push({ ch, reason: r.reason });
      report(1);
    },
    signal,
  );

  // Ни один канал не ответил и почти все — таймауты/нет сети: скорее всего, нет интернета. Ничего не удаляем.
  const soft = failed.filter((f) => SOFT.has(f.reason));
  const offline = !alive.length && channels.length >= 5 && soft.length / channels.length >= 0.9;
  if (offline) return { alive, dead: [], offline: true, aborted: Boolean(signal?.aborted) };

  // Спорные (таймаут, сеть) пробуем ещё раз, дольше и без спешки.
  let dead = failed.filter((f) => !SOFT.has(f.reason));
  if (!signal?.aborted && soft.length) {
    onProgress?.({ phase: 2, done, alive: alive.length, dead: dead.length, retry: soft.length });
    const still = [];
    await pool(
      soft,
      Math.ceil(CONCURRENCY / 2),
      async (f) => {
        const r = await probeOne(f.ch, RETRY_TIMEOUT);
        if (r.ok) alive.push(f.ch);
        else still.push({ ch: f.ch, reason: r.reason });
        onProgress?.({ phase: 2, done, alive: alive.length, dead: dead.length + still.length, retry: soft.length });
      },
      signal,
    );
    dead = dead.concat(still);
  }
  // Остановили на середине: спорные, до которых не дошли, не удаляем — их судьба неизвестна.
  return { alive, dead, offline: false, aborted: Boolean(signal?.aborted) };
}

// Проверяет все каналы плейлиста и удаляет не давшие поток. Возвращает отчёт для окна проверки.
export async function checkPlaylist(source, { signal, onProgress } = {}) {
  const { channels } = await loadSource(source);
  const report = { source, total: channels.length, alive: 0, removed: [], offline: false, aborted: false };
  if (!channels.length) return report;

  const verified = source.local ? {} : await getVerified(source.id);
  const fresh = Date.now() - VERIFIED_TTL;
  const todo = channels.filter((c) => !(verified[c.url] > fresh));
  const known = channels.length - todo.length; // уже проверены раньше
  const res = await checkChannels(todo, {
    signal,
    onProgress: (p) => onProgress?.({ ...p, total: channels.length, done: p.done + known, alive: p.alive + known }),
  });

  res.alive.forEach((c) => (verified[c.url] = Date.now()));
  if (!source.local) await setVerified(source.id, verified);

  report.alive = known + res.alive.length;
  report.offline = res.offline;
  report.aborted = res.aborted;
  if (!res.offline && res.dead.length) {
    report.removed = res.dead.map((d) => d.ch);
    const urls = report.removed.map((c) => c.url);
    if (source.local) deleteLocalChannels(source.id, urls);
    else await addRemoved(source.id, urls);
  }
  return report;
}

// Вернуть то, что удалила проверка.
export async function undoRemoved(report) {
  if (!report.removed.length) return;
  if (report.source.local) restoreLocalChannels(report.source.id, report.removed);
  else await clearRemoved(report.source.id, report.removed.map((c) => c.url));
}
