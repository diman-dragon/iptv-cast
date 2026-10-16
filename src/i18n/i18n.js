import ru from './locales/ru.js';
import en from './locales/en.js';
import { DEFAULT_LANG } from './languages.js';

const DICTS = { ru, en };
let lang = DEFAULT_LANG;

export const getLang = () => lang;

export function setCurrent(id) {
  if (DICTS[id]) lang = id;
}

// Подстановка {name} из params.
const format = (text, params) =>
  params ? text.replace(/\{(\w+)\}/g, (m, k) => params[k] ?? m) : text;

// Перевод по ключу; если ключа нет в языке — берём английский, иначе сам ключ.
export function t(key, params) {
  return format(DICTS[lang][key] ?? DICTS[DEFAULT_LANG][key] ?? key, params);
}
