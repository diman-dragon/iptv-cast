import { el, button } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { PAGES } from '../settings/pages.js';
import { getPageIndex, setPageIndex } from '../settings/settings-nav.js';

// Настройки страничками: сверху названия разделов (можно нажать), ниже страницы, которые листаются свайпом.
// Каждая страница прокручивается по вертикали сама.
export function renderSettings() {
  const root = el('section', 'settings');
  const tabs = el('div', 'stabs');
  const pager = el('div', 'spager');
  pager.dataset.noswipe = '1';
  const dots = el('div', 'sdots');

  const chips = PAGES.map((page, i) => {
    const chip = button('stab', () => pager.scrollTo({ left: i * pager.clientWidth, behavior: 'smooth' }));
    bindText(chip, page.titleKey);
    tabs.append(chip);
    const view = el('div', 'spage');
    view.append(...page.build());
    pager.append(view);
    const dot = el('span', 'sdot');
    dots.append(dot);
    return { chip, dot };
  });

  let shown = -1;
  const mark = () => {
    const i = Math.max(0, Math.min(PAGES.length - 1, Math.round(pager.scrollLeft / (pager.clientWidth || 1))));
    if (i === shown) return;
    shown = i;
    setPageIndex(i);
    chips.forEach(({ chip, dot }, n) => {
      chip.classList.toggle('on', n === i);
      chip.setAttribute('aria-current', String(n === i));
      dot.classList.toggle('on', n === i);
    });
    const chip = chips[i].chip;
    tabs.scrollTo({ left: chip.offsetLeft - (tabs.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
  };
  let frame = 0;
  pager.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(mark);
  });

  root.append(tabs, pager, dots);
  // Экран вставляется в документ позже: возвращаемся на прежнюю страницу, когда у ленты появилась ширина.
  const restore = () => {
    if (!pager.clientWidth) return requestAnimationFrame(restore);
    pager.scrollLeft = getPageIndex() * pager.clientWidth;
    mark();
  };
  requestAnimationFrame(restore);
  return root;
}
