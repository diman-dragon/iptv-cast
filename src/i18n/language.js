import { applyTranslations } from './apply.js';
import { detectLang } from './detect.js';
import { getLang, setCurrent } from './i18n.js';
import { loadLangPref, saveLangPref } from './lang-storage.js';
import { AUTO } from './languages.js';

let pref = AUTO;

export const getLangPref = () => pref;

function activate() {
  setCurrent(pref === AUTO ? detectLang() : pref);
  document.documentElement.lang = getLang();
  applyTranslations();
  document.dispatchEvent(new Event('langchange'));
}

// При старте: выбор пользователя, а при «Авто» — язык устройства.
export function initLanguage() {
  pref = loadLangPref();
  activate();
}

export function changeLanguage(next) {
  pref = next;
  saveLangPref(next);
  activate();
}
