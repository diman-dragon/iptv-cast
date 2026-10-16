// Мини-хелперы для создания DOM-элементов.
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function button(className = '', onClick) {
  const node = el('button', className);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

export function image(className, src) {
  const node = el('img', className);
  node.alt = '';
  node.draggable = false;
  node.loading = 'lazy';
  if (src) node.src = src;
  return node;
}

// Статичная SVG-разметка из icons.js (не пользовательский ввод).
export function icon(svg, className = 'ico') {
  const node = el('span', className);
  node.innerHTML = svg;
  return node;
}
