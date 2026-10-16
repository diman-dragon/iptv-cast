import { DEFAULT_LANG, LANGS } from './languages.js';

// Язык устройства: берём первый поддерживаемый из списка предпочтений.
export function detectLang() {
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of prefs) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (LANGS.some((l) => l.id === code)) return code;
  }
  return DEFAULT_LANG;
}
