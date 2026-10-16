import { el } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';

// Строка настроек: подпись слева, элемент управления справа.
// stacked — элемент под подписью на всю ширину (для длинных переключателей).
export function createRow(labelKey, control, stacked = false) {
  const row = el('div', stacked ? 'row stack' : 'row');
  row.append(bindText(el('span'), labelKey), control);
  return row;
}
