import { el, button, icon } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';

// Пустое состояние: значок, заголовок, подсказка и (по желанию) кнопка.
export function createStateBox(svg, titleKey, hintKey, actionKey, onAction, params) {
  const box = el('div', 'empty');
  box.append(icon(svg, 'empty-ico'), bindText(el('div', 'empty-title'), titleKey, params));
  if (hintKey) box.append(bindText(el('div', 'muted small'), hintKey));
  if (actionKey) box.append(bindText(button('btn', onAction), actionKey));
  return box;
}
