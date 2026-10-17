// Разбор M3U / M3U8: каналы с логотипом, группой и заголовками (User-Agent, Referer).
const attr = (line, name) => (line.match(new RegExp(`${name}="([^"]*)"`, 'i')) || [])[1]?.trim() ?? '';

// Ссылка в стиле «url|User-Agent=...&Referer=...» (так пишут многие списки).
function splitPipe(url) {
  const i = url.indexOf('|');
  if (i < 0) return { url, ua: '', ref: '' };
  const q = new URLSearchParams(url.slice(i + 1));
  const get = (k) => q.get(k) ?? q.get(k.toLowerCase()) ?? '';
  return { url: url.slice(0, i), ua: get('User-Agent'), ref: get('Referer') };
}

export function parseM3u(text) {
  const out = [];
  let cur = null;
  let group = '';
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const comma = line.lastIndexOf(',');
      cur = {
        name: (comma >= 0 ? line.slice(comma + 1).trim() : '') || attr(line, 'tvg-name'),
        logo: attr(line, 'tvg-logo'),
        group: attr(line, 'group-title') || group,
        ua: attr(line, 'http-user-agent'),
        ref: attr(line, 'http-referrer') || attr(line, 'http-referer'),
      };
    } else if (line.startsWith('#EXTGRP:')) {
      group = line.slice(8).trim();
      if (cur && !cur.group) cur.group = group;
    } else if (line.startsWith('#EXTVLCOPT:') && cur) {
      const [k, ...v] = line.slice(11).split('=');
      const val = v.join('=').trim();
      if (/user-agent/i.test(k)) cur.ua = val;
      else if (/referrer|referer/i.test(k)) cur.ref = val;
    } else if (!line.startsWith('#') && cur) {
      const { url, ua, ref } = splitPipe(line);
      if (/^(https?|rtmp|rtsp|udp):\/\//i.test(url)) {
        out.push({ ...cur, url, ua: ua || cur.ua, ref: ref || cur.ref, name: cur.name || url });
      }
      cur = null;
    }
  }
  return out;
}

// Убирает «(1080p)», «[Geo-blocked]» из показа, оставляя исходное имя для поиска.
export const cleanName = (name) => name.replace(/(\s*[([][^)\]]*[)\]])+\s*$/, '').trim() || name;

// Пометки качества из названия: «(720p)», «[Not 24/7]».
export const tagsOf = (name) => [...name.matchAll(/[([]([^)\]]+)[)\]]/g)].map((m) => m[1]);
