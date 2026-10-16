import { readStored, writeStored } from '../core/storage.js';
import { THEMES } from './themes.js';

const KEY = 'iptvcast.theme';

// null — пользователь тему не выбирал.
export function loadTheme() {
  const saved = readStored(KEY);
  return THEMES.some((t) => t.id === saved) ? saved : null;
}

export const saveTheme = (id) => writeStored(KEY, id);
