import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { kvGet, kvSet } from '../core/kv.js';
import { cleanName } from './parse.js';
import { getPref } from './store.js';

// Программа передач (XMLTV). Адрес берётся из плейлиста (`x-tvg-url`) и из настроек.
// Файл программы целиком хранится как текст; для канала из него вынимаются только его передачи.
const TTL = 6 * 3600 * 1000; // как долго программа считается свежей
const KEEP_MAX = 40 * 1024 * 1024; // больше в IndexedDB не кладём (только в памяти)
const NEXT = 8; // сколько ближайших передач показываем

const mem = new Map(); // url -> { time, text }

const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const gunzip = (bytes) => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();

async function download(url) {
  const gz = /\.gz($|\?)/i.test(url);
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, responseType: gz ? 'arraybuffer' : 'text', connectTimeout: 20000, readTimeout: 120000 });
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    return gz ? gunzip(fromBase64(r.data)) : String(r.data);
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return gz ? gunzip(new Uint8Array(await r.arrayBuffer())) : r.text();
}

async function loadGuide(url) {
  const hit = mem.get(url);
  if (hit && Date.now() - hit.time < TTL) return hit.text;
  const saved = await kvGet(`epg:${url}`);
  if (saved && Date.now() - saved.time < TTL) {
    mem.set(url, saved);
    return saved.text;
  }
  const text = await download(url);
  const value = { time: Date.now(), text };
  mem.set(url, value);
  if (text.length < KEEP_MAX) await kvSet(`epg:${url}`, value);
  return text;
}

const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// «20260101120000 +0300» -> миллисекунды.
export function parseXmltvTime(s) {
  const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*([+-]\d{4})?/.exec(s ?? '');
  if (!m) return NaN;
  const [, Y, Mo, D, H, Mi, Se = '00', tz = '+0000'] = m;
  const off = (tz[0] === '-' ? -1 : 1) * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
  return Date.UTC(Number(Y), Number(Mo) - 1, Number(D), Number(H), Number(Mi), Number(Se)) - off * 60000;
}

// Какой id канала в этой программе: по tvg-id, а если его нет — по названию.
function channelId(text, ch) {
  if (ch.id && text.includes(`channel="${ch.id}"`)) return ch.id;
  const want = norm(cleanName(ch.name));
  if (!want) return '';
  const re = /<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g;
  let m;
  while ((m = re.exec(text))) {
    for (const n of m[2].matchAll(/<display-name[^>]*>([^<]*)<\/display-name>/g)) {
      if (norm(unescapeXml(n[1])) === want) return unescapeXml(m[1]);
    }
  }
  return '';
}

// Все передачи канала. Идём по вхождениям channel="id", а не по всему XML регулярками.
export function programmesOf(text, id) {
  const out = [];
  const needle = `channel="${id.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
  let at = text.indexOf(needle);
  while (at >= 0) {
    const open = text.lastIndexOf('<programme', at);
    const close = text.indexOf('</programme>', at);
    if (open >= 0 && close > at) {
      const block = text.slice(open, close);
      const start = parseXmltvTime(/\bstart="([^"]*)"/.exec(block)?.[1]);
      const stop = parseXmltvTime(/\bstop="([^"]*)"/.exec(block)?.[1]);
      const title = /<title[^>]*>([^<]*)<\/title>/.exec(block)?.[1];
      const desc = /<desc[^>]*>([^<]*)<\/desc>/.exec(block)?.[1];
      if (Number.isFinite(start) && title) out.push({ start, stop: Number.isFinite(stop) ? stop : start + 3600000, title: unescapeXml(title), desc: desc ? unescapeXml(desc) : '' });
    }
    at = text.indexOf(needle, close > at ? close : at + needle.length);
  }
  return out.sort((a, b) => a.start - b.start);
}

// { now, next: [...] } для канала; null — программы нет; { error } — не удалось загрузить.
export async function getProgram(ch, at = Date.now()) {
  const urls = [...new Set([...(ch.epg ?? []), getPref('epgUrl')].filter(Boolean))];
  if (!urls.length) return null;
  let failed = '';
  for (const url of urls) {
    try {
      const text = await loadGuide(url);
      const id = channelId(text, ch);
      if (!id) continue;
      const list = programmesOf(text, id).filter((p) => p.stop > at);
      if (!list.length) continue;
      const now = list[0].start <= at ? list[0] : null;
      return { now, next: list.slice(now ? 1 : 0, (now ? 1 : 0) + NEXT) };
    } catch (e) {
      failed = String(e?.message ?? e);
    }
  }
  return failed ? { error: failed } : null;
}

export const clearGuideCache = () => mem.clear();
