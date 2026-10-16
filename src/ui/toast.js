import { el } from '../core/dom.js';

let node = null;
let timer = 0;

// Короткое сообщение внизу экрана; исчезает само.
export function toast(text, ms = 2400) {
  node?.remove();
  clearTimeout(timer);
  node = el('div', 'toast', text);
  document.body.append(node);
  timer = setTimeout(() => {
    node?.remove();
    node = null;
  }, ms);
}
