import { el } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';

// Поле формы: подпись, ввод, подсказка. Возвращает { node, input }.
export function createField(labelKey, { hintKey, placeholderKey, type = 'text', value = '' } = {}) {
  const node = el('label', 'field');
  const input = el('input');
  Object.assign(input, { type, value, autocomplete: 'off', spellcheck: false });
  if (placeholderKey) input.placeholder = t(placeholderKey);
  node.append(bindText(el('span', 'field-label'), labelKey), input);
  if (hintKey) node.append(bindText(el('span', 'field-hint'), hintKey));
  return { node, input };
}

// Выпадающий список: items = [{ id, label }].
export function createSelect(items, value) {
  const select = el('select', 'select');
  items.forEach((item) => select.append(new Option(item.label, item.id)));
  select.value = value;
  return select;
}
