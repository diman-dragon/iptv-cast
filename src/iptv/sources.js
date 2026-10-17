import { getLang } from '../i18n/i18n.js';
import { customSources } from './store.js';

export const FAV_ID = 'fav';
export const HISTORY_ID = 'history';
export const MINE_ID = 'mine-channels';

// Виртуальные источники: их каналы собираются из того, что хранит приложение.
const virtual = (id, emoji, ru, en, dru, den) => ({
  id,
  type: 'mine',
  emoji,
  virtual: true,
  name: { ru, en },
  desc: { ru: dru, en: den },
});

const VIRTUAL = [
  virtual(FAV_ID, '⭐', 'Избранное', 'Favorites', 'Каналы, отмеченные звёздочкой', 'Channels you starred'),
  virtual(HISTORY_ID, '🕘', 'История', 'History', 'Что вы смотрели недавно', 'What you watched recently'),
  virtual(MINE_ID, '📌', 'Мои каналы', 'My channels', 'Каналы, добавленные вручную по ссылке', 'Channels you added by hand with a link'),
];

// В приложении нет встроенных плейлистов: только то, что пользователь загрузил сам.
export const allSources = () => [...VIRTUAL, ...customSources()];
export const findSource = (id) => allSources().find((s) => s.id === id);

const pick = (v) => (typeof v === 'string' ? v : (v?.[getLang()] ?? v?.ru ?? v?.en ?? ''));
export const nameOf = (s) => pick(s.name);

export function descOf(s) {
  if (s.desc) return pick(s.desc);
  if (s.file) return '📄';
  try {
    return new URL(s.url).host;
  } catch {
    return s.url;
  }
}
