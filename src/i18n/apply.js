import { t } from './i18n.js';

const readParams = (raw) => (raw ? JSON.parse(raw) : undefined);

// Перерисовывает все привязанные тексты после смены языка.
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n, readParams(node.dataset.i18nParams));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAria, readParams(node.dataset.i18nAriaParams)));
  });
}
