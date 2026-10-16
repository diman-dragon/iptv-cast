import { AUTO, LANGS } from '../i18n/languages.js';
import { changeLanguage, getLangPref } from '../i18n/language.js';
import { createSegmented } from './segmented.js';

const items = [{ id: AUTO, labelKey: 'lang.auto' }, ...LANGS.map((l) => ({ id: l.id, label: l.label }))];

export const createLangSwitch = () => createSegmented(items, getLangPref, changeLanguage);
