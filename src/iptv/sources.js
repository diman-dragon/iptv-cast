import { CATALOG } from '../data/catalog.js';
import { getLang } from '../i18n/i18n.js';
import { customSources } from './store.js';

export const MINE_ID = 'mine-channels';

// «Мои каналы» — виртуальный источник: одиночные каналы, добавленные вручную.
const MINE = {
  id: MINE_ID,
  type: 'mine',
  emoji: '⭐',
  virtual: true,
  name: { ru: 'Мои каналы', en: 'My channels' },
  desc: { ru: 'Каналы, добавленные вручную по ссылке', en: 'Channels you added by hand with a link' },
};

export const allSources = () => [MINE, ...customSources(), ...CATALOG];
export const findSource = (id) => allSources().find((s) => s.id === id);

const pick = (v) => (typeof v === 'string' ? v : (v?.[getLang()] ?? v?.en ?? ''));
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
