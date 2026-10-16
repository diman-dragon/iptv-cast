import { el, button, icon } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { TYPES, findType } from '../data/types.js';
import { navigate } from '../app/router.js';
import { openAddDialog } from '../dialogs/add.js';
import { dropSourceData, loadSource } from '../iptv/playlist.js';
import { allSources, descOf, nameOf } from '../iptv/sources.js';
import { getPref, onStoreChange, removeSource, setPref } from '../iptv/store.js';
import { getView, setView } from '../iptv/view-state.js';
import { ICONS } from '../ui/icons.js';
import { createSearch } from '../ui/search.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { createViewSwitch } from '../ui/view-switch.js';
import { createStateBox } from '../ui/state-box.js';

const ALL = 'all';

function openSource(source) {
  setPref('lastSource', source.id);
  setView({ mode: 'source', sourceId: source.id, query: '', group: '' });
  navigate('channels');
}

function menuOf(source) {
  const actions = [
    { label: t('cat.open'), run: () => openSource(source) },
    {
      label: t('cat.refresh'),
      run: async () => {
        if (source.virtual) return;
        toast(t('cat.refreshing'));
        try {
          await loadSource(source, { force: true });
          toast(t('cat.refreshed'));
        } catch {
          toast(t('ch.error'));
        }
      },
    },
  ];
  if (source.url) {
    actions.push({
      label: t('cat.copy'),
      run: () => navigator.clipboard?.writeText(source.url).then(() => toast(t('cat.copied'))),
    });
  }
  if (!source.builtin && !source.virtual) {
    actions.push({
      label: t('cat.remove'),
      danger: true,
      run: async () => {
        await dropSourceData(source.id);
        removeSource(source.id);
        toast(t('cat.removed'));
      },
    });
  }
  openSheet(nameOf(source), actions);
}

function createCard(source) {
  const type = findType(source.type);
  const item = el('div', 'src');
  item.style.setProperty('--c', type.color);
  const bubble = el('div', 'src-bubble', source.emoji ?? type.emoji);
  const meta = el('div', 'meta');
  meta.append(el('div', 'fname', nameOf(source)), el('div', 'fsub', descOf(source)));
  const more = button('more', (e) => {
    e.stopPropagation();
    menuOf(source);
  });
  more.append(icon(ICONS.more));
  more.setAttribute('aria-label', t('lib.menu'));
  item.append(bubble, meta, more);
  item.addEventListener('click', () => openSource(source));
  return item;
}

// Каталог: типы источников, поиск и свои плейлисты.
export function renderCatalog() {
  const root = el('section', 'catalog');
  let type = getPref('lastType');
  let query = '';

  const top = el('div', 'cat-top');
  const search = createSearch('cat.search', (text) => {
    query = text.toLowerCase();
    draw();
  });
  const add = button('btn add-btn', openAddDialog);
  add.append(icon(ICONS.plus, 'btn-ico'), bindText(el('span'), 'cat.add'));
  const viewSwitch = createViewSwitch(
    () => getPref('view'),
    (v) => {
      setPref('view', v);
      draw();
    },
  );
  top.append(search, add);

  const chips = el('div', 'chips');
  chips.dataset.noswipe = '1';
  const chipNodes = new Map();
  [{ id: ALL, emoji: '✨', key: 'type.all' }, ...TYPES].forEach((x) => {
    const chip = button('chip', () => {
      type = x.id;
      setPref('lastType', type);
      mark();
      draw();
    });
    chip.append(el('span', 'chip-emoji', x.emoji), bindText(el('span'), x.key));
    chips.append(chip);
    chipNodes.set(x.id, chip);
  });
  const mark = () => {
    chipNodes.forEach((chip, id) => chip.classList.toggle('on', id === type));
    chipNodes.get(type)?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  };

  const bar = el('div', 'cat-bar');
  const count = el('div', 'muted small');
  bar.append(count, viewSwitch);
  const list = el('div');

  function matches(s) {
    if (query && !`${nameOf(s)} ${descOf(s)}`.toLowerCase().includes(query)) return false;
    if (type === ALL) return true;
    if (type === 'mine') return s.type === 'mine' || !s.builtin;
    return s.type === type;
  }

  function section(titleType, sources) {
    const box = el('div', 'cat-section');
    const head = el('div', 'cat-head');
    head.style.setProperty('--c', titleType.color);
    head.append(el('span', 'cat-head-emoji', titleType.emoji), bindText(el('span'), titleType.key), el('span', 'cat-count', String(sources.length)));
    const grid = el('div', `lib-items ${getPref('view')}`);
    grid.append(...sources.map(createCard));
    box.append(head, grid);
    return box;
  }

  function draw() {
    const sources = allSources().filter(matches);
    count.textContent = t('cat.count', { n: sources.length });
    if (!sources.length) {
      const hint = type === 'mine' ? 'cat.emptyMineHint' : 'cat.emptyHint';
      list.replaceChildren(createStateBox(ICONS.catalog, 'cat.empty', hint, type === 'mine' ? 'cat.add' : null, openAddDialog));
      return;
    }
    if (type === ALL && !query) {
      // Без фильтра — разделы по типам; свои плейлисты показываются в своём типе.
      list.replaceChildren(
        ...TYPES.map((x) => [x, sources.filter((s) => s.type === x.id)])
          .filter(([, items]) => items.length)
          .map(([x, items]) => section(x, items)),
      );
      return;
    }
    const grid = el('div', `lib-items ${getPref('view')}`);
    grid.append(...sources.map(createCard));
    list.replaceChildren(grid);
  }

  root.append(top, chips, bar, list);
  mark();
  draw();
  onStoreChange((what) => what === 'sources' && draw());
  document.addEventListener('langchange', draw);
  return root;
}
