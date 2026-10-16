import { el, button, icon } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';

function createTab(screen, onSelect) {
  const btn = button('tab', () => onSelect(screen.id));
  btn.append(icon(screen.icon, 'tab-icon'), bindText(el('span', 'tab-label'), screen.key));
  return btn;
}

// Нижние вкладки: линейный значок + подпись, активная подсвечивается.
export function createTabbar(screens, onSelect) {
  const node = el('nav', 'tabbar');
  const tabs = new Map();

  screens.forEach((screen) => {
    const btn = createTab(screen, onSelect);
    node.append(btn);
    tabs.set(screen.id, btn);
  });

  const setActive = (id) => {
    tabs.forEach((btn, key) => {
      btn.classList.toggle('active', key === id);
      btn.setAttribute('aria-current', key === id ? 'page' : 'false');
    });
  };

  return { node, setActive };
}
