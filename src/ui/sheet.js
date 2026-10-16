import { el, button } from '../core/dom.js';
import { t } from '../i18n/i18n.js';

let node = null;

export const isSheetOpen = () => node !== null;

export function closeSheet() {
  node?.remove();
  node = null;
}

// Нижнее меню действий: заголовок, действия и «Отмена».
export function openSheet(title, actions) {
  closeSheet();
  const box = el('div', 'sheet-box');
  box.append(el('p', 'sheet-title', title));
  [...actions, { label: t('lib.cancel') }].forEach((action) => {
    const btn = button(action.danger ? 'danger' : '', () => {
      closeSheet();
      action.run?.();
    });
    btn.textContent = action.label;
    box.append(btn);
  });
  node = el('div', 'sheet');
  node.append(box);
  node.addEventListener('click', (e) => {
    if (e.target === node) closeSheet();
  });
  document.body.append(node);
}
