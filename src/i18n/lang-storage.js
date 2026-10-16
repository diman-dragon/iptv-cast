import { readStored, writeStored } from '../core/storage.js';
import { AUTO, LANGS } from './languages.js';

const KEY = 'iptvcast.lang';

// Выбор пользователя: 'auto' (по умолчанию), 'ru' или 'en'.
export function loadLangPref() {
  const saved = readStored(KEY);
  return LANGS.some((l) => l.id === saved) ? saved : AUTO;
}

export const saveLangPref = (pref) => writeStored(KEY, pref);
