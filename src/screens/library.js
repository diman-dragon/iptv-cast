import { el, button, icon } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { TYPES, findType } from '../data/types.js';
import { navigate } from '../app/router.js';
import { openCheckDialog } from '../dialogs/check.js';
import { openEditSource } from '../dialogs/edit-source.js';
import { dropSourceData } from '../iptv/playlist.js';
import { FAV_ID, HISTORY_ID, MINE_ID, allSources, descOf, nameOf } from '../iptv/sources.js';
import { customSources, favorites, getChecks, getPref, history, localChannels, onStoreChange, removeSource, setPref } from '../iptv/store.js';
import { onView, setView } from '../iptv/view-state.js';
import { ICONS } from '../ui/icons.js';
import { closeModal, openModal } from '../ui/modal.js';
import { createSearch } from '../ui/search.js';
import { createStateBox } from '../ui/state-box.js';
import { toast } from '../ui/toast.js';
import { createViewSwitch } from '../ui/view-switch.js';
import { createChannelsView } from './channels.js';

const ALL = 'all';
const GENRES = TYPES.filter((x) => x.id !== 'mine'); // «Мои» вынесены наверх кнопками

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

function actionBtn(svg, labelKey, run) {
  const b = button('row-btn', (e) => {
    e.stopPropagation();
    run();
  });
  b.append(icon(svg));
  b.setAttribute('aria-label', t(labelKey));
  return b;
}

// Итог последней проверки каналов под описанием плейлиста.
function checkBadge(source) {
  const c = getChecks()[source.id];
  if (!c || c.offline) return null;
  const when = new Date(c.time).toLocaleDateString();
  return el('div', `src-status ${c.alive ? 'ok' : 'bad'}`, c.alive ? t('chk.badge', { a: c.alive, d: c.removed, date: when }) : t('chk.badgeNone', { date: when }));
}

function createCard(source) {
  const type = findType(source.type);
  const item = el('div', 'src');
  item.style.setProperty('--c', type.color);
  const meta = el('div', 'meta');
  meta.append(el('div', 'fname', nameOf(source)), el('div', 'fsub', descOf(source)));
  const badge = checkBadge(source);
  if (badge) meta.append(badge);
  item.append(el('div', 'src-bubble', source.emoji ?? type.emoji), meta);
  const acts = el('div', 'acts');
  acts.append(
    actionBtn(ICONS.checkCircle, 'chk.one', () => openCheckDialog([source])),
    actionBtn(ICONS.edit, 'edit.title', () => openEditSource(source)),
    actionBtn(ICONS.trash, 'cat.remove', () => confirmRemove(source)),
  );
  item.append(acts);
  item.addEventListener('click', () => openSource(source));
  return item;
}

// Библиотека. Сверху «Мои» кнопками, ниже поиск и проверка каналов, ниже сами плейлисты по жанрам.
export function renderLibrary() {
  const root = el('section', 'catalog');
  let type = getPref('lastType');
  let query = '';

  const browse = el('div');

  // ---------- 1. «Мои»: избранное, история, свои каналы
  const mine = el('div', 'mine-row');
  const mineCount = { [FAV_ID]: () => favorites().length, [HISTORY_ID]: () => history().length, [MINE_ID]: () => localChannels(MINE_ID).length };
  const mineBtns = allSources()
    .filter((s) => s.virtual)
    .map((s) => {
      const b = button('mine-btn', () => openSource(s));
      const count = el('span', 'mine-count');
      b.append(el('span', 'mine-emoji', s.emoji), el('span', 'mine-name', nameOf(s)), count);
      mine.append(b);
      return { s, count, name: b.querySelector('.mine-name') };
    });
  const drawMine = () =>
    mineBtns.forEach(({ s, count, name }) => {
      count.textContent = String(mineCount[s.id]());
      name.textContent = nameOf(s);
    });

  // ---------- 2. поиск и проверка каналов
  const top = el('div', 'cat-top');
  const search = createSearch('cat.search', (text) => {
    query = text.toLowerCase();
    draw();
  });
  const checkBtn = button('btn ghost check-btn', () => openCheckDialog(customSources()));
  checkBtn.append(icon(ICONS.checkCircle, 'btn-ico'), bindText(el('span'), 'chk.button'));
  top.append(search, checkBtn);

  // ---------- 3. сама библиотека
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
  browse.append(mine, top, chips, bar, intro, list);

  // Чипы жанров — только те, в которых что-то есть.
  function drawChips() {
    const present = new Set(customSources().map((s) => s.type));
    const items = [{ id: ALL, emoji: '✨', key: 'type.all' }, ...GENRES.filter((x) => present.has(x.id))];
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

  const matches = (s) => (!query || `${nameOf(s)} ${descOf(s)}`.toLowerCase().includes(query)) && (type === ALL || s.type === type);

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
    drawMine();
    drawChips();
    const all = customSources();
    const sources = all.filter(matches);
    count.textContent = t('cat.count', { n: all.length });
    checkBtn.hidden = !all.length;
    bar.hidden = !all.length;
    // Пока ничего не загружено — подсказка, где это сделать.
    intro.replaceChildren(...(all.length ? [] : [createStateBox(ICONS.library, 'lib.empty', 'lib.emptyHint', 'lib.openSettings', () => navigate('settings'))]));
    if (!sources.length) {
      list.replaceChildren(...(all.length ? [createStateBox(ICONS.search, 'cat.empty', 'cat.emptyHint')] : []));
      return;
    }
    if (type === ALL && !query) {
      list.replaceChildren(
        ...GENRES.map((x) => [x, sources.filter((s) => s.type === x.id)])
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
  onStoreChange((what) => ['sources', 'checks', 'fav', 'history', 'channels'].includes(what) && draw());
  document.addEventListener('langchange', draw);
  return root;
}
