import { el } from '../core/dom.js';
import { t } from '../i18n/i18n.js';

const DELAY = 150; // мс: не перерисовываем список на каждую букву

// Поле поиска. onInput(text) вызывается с задержкой.
export function createSearch(placeholderKey, onInput) {
  const input = el('input', 'search');
  Object.assign(input, { type: 'search', autocomplete: 'off', enterKeyHint: 'search' });
  const label = () => {
    input.placeholder = t(placeholderKey);
    input.setAttribute('aria-label', t(placeholderKey));
  };
  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => onInput(input.value.trim()), DELAY);
  });
  document.addEventListener('langchange', label);
  label();
  return input;
}
