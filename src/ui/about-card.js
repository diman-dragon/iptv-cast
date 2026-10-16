import { el, icon } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { ICONS } from './icons.js';

// «О приложении»: карточка в двойной рамке с уголками — название, версия, что это и чем не является.
export function createAboutCard() {
  const frame = el('div', 'about');
  const inner = el('div', 'about-in');
  ['tl', 'tr', 'bl', 'br'].forEach((c) => frame.append(el('span', `about-corner ${c}`)));
  const logo = el('div', 'about-logo');
  logo.append(icon(ICONS.tv, 'about-ico'));
  inner.append(
    logo,
    el('h2', 'about-name', 'IPTV Cast'),
    bindText(el('div', 'about-tag'), 'about.tag'),
    bindText(el('div', 'about-ver'), 'settings.version', { v: __APP_VERSION__ }),
    el('div', 'about-rule'),
    bindText(el('p', 'about-text'), 'about.lead'),
    bindText(el('p', 'about-text'), 'about.legal'),
  );
  frame.append(inner);
  return frame;
}
