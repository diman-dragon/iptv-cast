import { el, button } from '../core/dom.js';

// Выключатель: get() → bool, set(bool).
export function createSwitch(get, set) {
  const btn = button('switch', () => {
    set(!get());
    mark();
  });
  btn.setAttribute('role', 'switch');
  btn.append(el('span', 'knob'));
  const mark = () => {
    btn.classList.toggle('on', get());
    btn.setAttribute('aria-checked', String(get()));
  };
  mark();
  return btn;
}
