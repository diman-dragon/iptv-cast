import { el, button } from '../core/dom.js';
import { bindAria, bindText } from '../i18n/bind.js';

// Содержимое кнопки: пиктограмма (SVG-строка) или подпись (ключ перевода / готовый текст).
function fill(btn, item) {
  if (item.icon) btn.innerHTML = item.icon;
  if (item.labelKey) bindText(btn, item.labelKey);
  else if (item.label) btn.textContent = item.label;
  if (item.ariaKey) bindAria(btn, item.ariaKey);
}

// Переключатель «один из N» в одну полоску; выбранный вариант подсвечен.
export function createSegmented(items, getCurrent, onPick) {
  const box = el('div', 'seg');
  const buttons = new Map();

  const mark = () => {
    buttons.forEach((btn, id) => {
      btn.classList.toggle('on', id === getCurrent());
      btn.setAttribute('aria-pressed', String(id === getCurrent()));
    });
  };

  items.forEach((item) => {
    const btn = button('', () => {
      onPick(item.id);
      mark();
    });
    fill(btn, item);
    box.append(btn);
    buttons.set(item.id, btn);
  });

  mark();
  return box;
}
