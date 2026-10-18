import { el } from '../core/dom.js';

let node = null;
let onCloseHook = null;

export const isModalOpen = () => node !== null;

export function closeModal() {
  const hook = onCloseHook;
  onCloseHook = null;
  node?.remove();
  node = null;
  hook?.();
}

// Своё окно по центру: заголовок + содержимое. Закрывается по тапу мимо и системной «Назад».
// onClose — вызывается при любом закрытии (например, остановить долгую проверку).
export function openModal(title, content, { onClose } = {}) {
  closeModal();
  const box = el('div', 'modal-box');
  box.append(el('h2', 'modal-title', title), ...content);
  node = el('div', 'modal');
  node.append(box);
  node.addEventListener('click', (e) => {
    if (e.target === node) closeModal();
  });
  onCloseHook = onClose ?? null;
  document.body.append(node);
}
