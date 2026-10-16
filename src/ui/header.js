import { el } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';

// Узкая шапка: название текущего экрана слева, общие действия (Cast) справа.
export function createHeader() {
  const node = el('header', 'header');
  const title = el('h1', 'header-title');
  const actions = el('div', 'header-actions');
  node.append(title, actions);
  return {
    node,
    actions,
    setTitle: (key) => bindText(title, key),
  };
}
