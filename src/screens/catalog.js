import { el, button, icon } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { TYPES, findType } from '../data/types.js';
import { openAddDialog } from '../dialogs/add.js';
import { dropSourceData } from '../iptv/playlist.js';
import { allSources, descOf, nameOf } from '../iptv/sources.js';
import { getPref, onStoreChange, removeSource, setPref } from '../iptv/store.js';
import { getView, onView, setView } from '../iptv/view-state.js';
import { ICONS } from '../ui/icons.js';
import { closeModal, openModal } from '../ui/modal.js';
import { createSearch } from '../ui/search.js';
import { createStateBox } from '../ui/state-box.js';
import { createViewSwitch } from '../ui/view-switch.js';
import { toast } from '../ui/toast.js';
import { createChannelsView } from './channels.js';

const ALL = 'all';

const openSource = (source) => setView({ sourceId: source.id });

// Удаление своего источника — с подтверждением, чтобы не стереть случайно.
function confirmRemove(source) {
  const actions = el('div', 'modal-actions');
  actions.append(
    bindText(button('btn ghost', closeModal), 'lib.cancel'),
    bindText(
      button('btn danger', async () => {
        await dropSourceData(source.id);
        removeSource(source.id);
        closeModal();
        toast(t('cat.removed'));
      }),
      'cat.remove',
    ),
  );
  openModal(t('cat.confirmRemove', { n: nameOf(source) }), [actions]);
}

function createCard(source) {
  const type = findType(source.type);
  const item = el('div', 'src');
  item.style.setProperty('--c', type.color);
  const meta = el('div', 'meta');
  meta.append(el('div', 'fname', nameOf(source)), el('div', 'fsub', descOf(source)));
  item.append(el('div', 'src-bubble', source.emoji ?? type.emoji), meta);
  if (!source.builtin && !source.virtual) {
    const del = button('row-btn', (e) => {
      e.stopPropagation();
      confirmRemove(source);
    });
    del.append(icon(ICONS.trash));
    del.setAttribute('aria-label', t('cat.remove'));
    item.append(del);
  }
  item.addEventListener('click', () => openSource(source));
  return item;
}

// Каталог: типы источников → источник → список каналов → окно плеера.
export function renderCatalog() {
  const root = el('section', 'catalog');
  let type = getPref('lastType');
  let query = '';

  // ---------- каталог источников
  const browse = el('div');
  const top = el('div', 'cat-top');
  const search = createSearch('cat.search', (text) => {
    query = text.toLowerCase();
    draw();
  });
  const add = button('btn add-btn', openAddDialog);
  add.append(icon(ICONS.plus, 'btn-ico'), bindText(el('span'), 'cat.add'));
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

  const viewSwitch = createViewSwitch(
    () => getPref('view'),
    (v) => {
      setPref('view', v);
      draw();
    },
  );
  const bar = el('div', 'cat-bar');
  const count = el('div', 'muted small');
  bar.append(count, viewSwitch);
  const list = el('div');
  browse.append(top, chips, bar, list);

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
      list.replaceChildren(createStateBox(ICONS.catalog, 'cat.empty', type === 'mine' ? 'cat.emptyMineHint' : 'cat.emptyHint', type === 'mine' ? 'cat.add' : null, openAddDialog));
      return;
    }
    if (type === ALL && !query) {
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

  // ---------- внутри источника
  const channels = createChannelsView({ onBack: () => setView({ sourceId: null }) });
  channels.node.hidden = true;
  root.append(browse, channels.node);

  // Каталог и список каналов — один экран: переключаем показ и помним прокрутку каталога.
  let saved = 0;
  onView((v) => {
    const screen = root.closest('.screen');
    const open = Boolean(v.sourceId);
    if (open && !browse.hidden) saved = screen?.scrollTop ?? 0;
    browse.hidden = open;
    channels.node.hidden = !open;
    if (open) channels.open(v.sourceId);
    if (screen) screen.scrollTop = open ? 0 : saved;
  });

  mark();
  draw();
  onStoreChange((what) => what === 'sources' && draw());
  document.addEventListener('langchange', draw);
  return root;
}
