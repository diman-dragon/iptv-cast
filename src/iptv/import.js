import { TYPES } from '../data/types.js';

const TYPE_IDS = new Set(TYPES.map((t) => t.id).filter((id) => id !== 'mine'));

// Файл подборки: { "playlists": [{ name, url, type, emoji, desc }] } или просто массив таких записей.
// Возвращает список источников или null, если это не подборка.
export function parsePack(text) {
  const head = String(text).trimStart()[0];
  if (head !== '{' && head !== '[') return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(data) ? data : data?.playlists;
  if (!Array.isArray(list)) return null;
  return list
    .filter((x) => x && typeof x.url === 'string' && /^https?:\/\/\S+$/i.test(x.url))
    .map((x) => ({
      name: x.name || x.url,
      desc: x.desc,
      url: x.url,
      type: TYPE_IDS.has(x.type) ? x.type : 'mix',
      emoji: typeof x.emoji === 'string' ? x.emoji : undefined,
    }));
}
