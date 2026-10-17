import { el, button, icon } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { TYPES, findType } from '../data/types.js';
import { openAddDialog } from '../dialogs/add.js';
import { dropSourceData } from '../iptv/playlist.js';
import { allSources, descOf, nameOf } from '../iptv/sources.js';
import { customSources, getPref, onStoreChange, removeSource, setPref } from '../iptv/store.js';
import { onView, setView } from '../iptv/view-state.js';
import { ICONS } from '../ui/icons.js';
import { closeModal, openModal } from '../ui/modal.js';
import { createSearch } from '../ui/search.js';
import { createStateBox } from '../ui/state-box.js';
import { toast } from '../ui/toast.js';
import { createViewSwitch } from '../ui/view-switch.js';
import { createChannelsView } from './channels.js';

const ALL = 'all';

const openSource = (source) => setView({ sourceId: source.id });

// Удаление плейлиста — с подтверждением, чтобы не стереть случайно.
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
  if (!source.virtual) {
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

// Библиотека: загруженные плейлисты по жанрам → список каналов → окно плеера.
export function renderLibrary() {
  const root = el('section', 'catalog');
  let type = getPref('lastType');
  let query = '';

  // ---------- список плейлистов
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
  const intro = el('div');
  const list = el('div');
  browse.append(top, chips, bar, intro, list);

  // Чипы жанров — только те, в которых что-то есть.
  function drawChips() {
    const present = new Set(allSources().map((s) => s.type));
    const items = [{ id: ALL, emoji: '✨', key: 'type.all' }, ...TYPES.filter((x) => present.has(x.id))];
    if (!items.some((x) => x.id === type)) type = ALL;
    chips.replaceChildren(
      ...items.map((x) => {
        const chip = button(`chip${x.id === type ? ' on' : ''}`, () => {
          type = x.id;
          setPref('lastType', type);
          draw();
        });
        chip.append(el('span', 'chip-emoji', x.emoji), bindText(el('span'), x.key));
        return chip;
      }),
    );
    chips.querySelector('.on')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }

  const matches = (s) =>
    (!query || `${nameOf(s)} ${descOf(s)}`.toLowerCase().includes(query)) && (type === ALL || s.type === type);

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
    drawChips();
    const sources = allSources().filter(matches);
    count.textContent = t('cat.count', { n: customSources().length });
    // Пока ничего не загружено — подсказка, с чего начать.
    intro.replaceChildren(...(customSources().length || query ? [] : [createStateBox(ICONS.library, 'lib.empty', 'lib.emptyHint', 'cat.add', openAddDialog)]));
    if (!sources.length) {
      list.replaceChildren(...(query ? [createStateBox(ICONS.search, 'cat.empty', 'cat.emptyHint')] : []));
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

  // ---------- внутри плейлиста
  const channels = createChannelsView({ onBack: () => setView({ sourceId: null }) });
  channels.node.hidden = true;
  root.append(browse, channels.node);

  // Библиотека и список каналов — один экран: переключаем показ и помним прокрутку.
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

  draw();
  onStoreChange((what) => what === 'sources' && draw());
  document.addEventListener('langchange', draw);
  return root;
}
