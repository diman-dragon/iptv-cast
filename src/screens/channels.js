import { el, button, icon, image } from '../core/dom.js';
import { bindAria, bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { navigate } from '../app/router.js';
import { cleanName, tagsOf } from '../iptv/parse.js';
import { castChannel, getPlayback, onPlayback, openExternal, playChannel } from '../iptv/playback.js';
import { loadSource } from '../iptv/playlist.js';
import { findSource, nameOf } from '../iptv/sources.js';
import { favorites, getPref, history, isFavorite, onStoreChange, removeChannel, setPref, toggleFavorite } from '../iptv/store.js';
import { getView, onView, setView } from '../iptv/view-state.js';
import { createSelect } from '../ui/field.js';
import { ICONS } from '../ui/icons.js';
import { createSearch } from '../ui/search.js';
import { createSegmented } from '../ui/segmented.js';
import { openSheet } from '../ui/sheet.js';
import { createStateBox } from '../ui/state-box.js';
import { toast } from '../ui/toast.js';
import { createViewSwitch } from '../ui/view-switch.js';

const PAGE = 60; // сколько каналов дорисовываем за раз

// Цвет заглушки логотипа берётся из названия: один и тот же канал всегда одного цвета.
function hue(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function createThumb(ch) {
  const thumb = el('div', 'thumb');
  const name = cleanName(ch.name);
  thumb.style.setProperty('--h', String(hue(name)));
  const letter = el('span', 'thumb-letter', [...name.trim()][0]?.toUpperCase() ?? '?');
  thumb.append(letter);
  if (/^https?:/i.test(ch.logo)) {
    const img = image('thumb-img', ch.logo);
    img.addEventListener('load', () => thumb.classList.add('has-logo'));
    img.addEventListener('error', () => img.remove());
    thumb.append(img);
  }
  return thumb;
}

// Каналы: выбранный источник, избранное или история.
export function renderChannels() {
  const root = el('section', 'channels');
  let all = []; // каналы текущего режима
  let filtered = [];
  let shown = 0;
  let loading = false;
  let failed = false;
  let seq = 0; // номер последней загрузки: устаревшие ответы отбрасываем

  // ---------- верхняя часть
  const modes = createSegmented(
    [
      { id: 'source', labelKey: 'ch.source' },
      { id: 'fav', labelKey: 'ch.fav' },
      { id: 'history', labelKey: 'ch.history' },
    ],
    () => getView().mode,
    (mode) => setView({ mode, query: '', group: '' }),
  );
  modes.classList.add('seg-full');

  const srcBtn = button('src-chip', () => navigate('catalog'));
  const srcName = el('span', 'src-chip-name');
  srcBtn.append(icon(ICONS.back), srcName);

  const search = createSearch('ch.search', (query) => {
    setView({ query });
  });
  const refreshBtn = button('icon-btn', () => load(true));
  refreshBtn.append(icon(ICONS.refresh));
  bindAria(refreshBtn, 'ch.refresh');
  const viewSwitch = createViewSwitch(
    () => getPref('cview'),
    (v) => {
      setPref('cview', v);
      drawList();
    },
  );
  const groupBox = el('div', 'group-box');
  const searchRow = el('div', 'search-row');
  searchRow.append(search, refreshBtn);
  const toolsRow = el('div', 'tools-row');
  const status = el('div', 'muted small');
  toolsRow.append(groupBox, viewSwitch);
  const head = el('div', 'ch-head');
  head.append(modes, srcBtn, searchRow, toolsRow, status);

  const list = el('div');
  const more = bindText(button('btn ghost more-btn', () => drawMore()), 'ch.more');
  root.append(head, list);

  // ---------- меню строки
  function menuOf(ch) {
    const fav = isFavorite(ch.url);
    const actions = [
      { label: t('ch.play'), run: () => playChannel(ch, filtered) },
      { label: t('ch.cast'), run: () => castChannel(ch, filtered).catch(() => toast(t('cast.unavailable'))) },
      { label: t('ch.external'), run: () => openExternal(ch).catch(() => toast(t('ch.noApp'))) },
      { label: fav ? t('ch.unfav') : t('ch.addFav'), run: () => toast(toggleFavorite(ch) ? t('ch.favAdded') : t('ch.favRemoved')) },
      { label: t('ch.copy'), run: () => navigator.clipboard?.writeText(ch.url).then(() => toast(t('cat.copied'))) },
    ];
    if (getView().mode === 'source' && getView().sourceId === 'mine-channels') {
      actions.push({ label: t('ch.remove'), danger: true, run: () => removeChannel(ch.url) });
    }
    openSheet(cleanName(ch.name), actions);
  }

  function createItem(ch) {
    const item = el('div', 'item');
    const playing = getPlayback().channel?.url === ch.url;
    item.classList.toggle('playing', playing);
    item._url = ch.url;
    const meta = el('div', 'meta');
    const name = el('div', 'fname', cleanName(ch.name));
    if (isFavorite(ch.url)) name.prepend(icon(ICONS.starFill, 'fav-mark'));
    const sub = el('div', 'fsub');
    sub.textContent = [ch.group, ...tagsOf(ch.name).slice(0, 2)].filter(Boolean).join(' · ');
    meta.append(name, sub);
    const castBtn = button('row-btn', (e) => {
      e.stopPropagation();
      castChannel(ch, filtered).catch(() => toast(t('cast.unavailable')));
    });
    castBtn.append(icon(ICONS.cast));
    bindAria(castBtn, 'ch.cast');
    const moreBtn = button('row-btn', (e) => {
      e.stopPropagation();
      menuOf(ch);
    });
    moreBtn.append(icon(ICONS.more));
    bindAria(moreBtn, 'lib.menu');
    item.append(createThumb(ch), meta, castBtn, moreBtn);
    item.addEventListener('click', () => playChannel(ch, filtered));
    return item;
  }

  // ---------- список
  let grid = null;
  let observer = null;

  function drawMore() {
    if (!grid) return;
    more.remove();
    const next = filtered.slice(shown, shown + PAGE);
    grid.append(...next.map(createItem));
    shown += next.length;
    if (shown < filtered.length) {
      list.append(more);
      observer?.disconnect();
      if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver((entries) => entries[0].isIntersecting && drawMore(), { rootMargin: '300px' });
        observer.observe(more);
      }
    }
  }

  function drawList() {
    observer?.disconnect();
    shown = 0;
    grid = null;
    const v = getView();
    if (loading) return list.replaceChildren(el('div', 'spinner'));
    if (failed) return list.replaceChildren(createStateBox(ICONS.refresh, 'ch.error', 'ch.errorHint', 'ch.retry', () => load(true)));
    if (v.mode === 'source' && !v.sourceId) return list.replaceChildren(createStateBox(ICONS.catalog, 'ch.noSource', 'ch.noSourceHint', 'ch.toCatalog', () => navigate('catalog')));
    if (!filtered.length) {
      const key = v.mode === 'fav' ? 'ch.noFav' : v.mode === 'history' ? 'ch.noHistory' : 'ch.noMatch';
      return list.replaceChildren(createStateBox(v.mode === 'fav' ? ICONS.star : ICONS.search, key, v.mode === 'source' ? null : `${key}Hint`));
    }
    grid = el('div', `lib-items ${getPref('cview')}`);
    list.replaceChildren(grid);
    drawMore();
  }

  function applyFilter() {
    const { query, group } = getView();
    const q = query.toLowerCase();
    filtered = all.filter((c) => (!group || c.group === group) && (!q || c.name.toLowerCase().includes(q)));
    status.textContent = loading ? t('ch.loading') : all.length ? t('ch.count', { n: filtered.length, total: all.length }) : '';
    drawList();
  }

  function drawGroups() {
    const groups = [...new Set(all.map((c) => c.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    groupBox.hidden = groups.length < 2;
    if (groupBox.hidden) return;
    const select = createSelect([{ id: '', label: t('ch.allGroups') }, ...groups.map((g) => ({ id: g, label: g }))], getView().group);
    select.addEventListener('change', () => setView({ group: select.value }));
    groupBox.replaceChildren(select);
  }

  async function load(force = false) {
    const v = getView();
    const mine = ++seq;
    failed = false;
    search.value = v.query;
    srcBtn.hidden = v.mode !== 'source';
    refreshBtn.hidden = v.mode !== 'source';
    if (v.mode === 'fav') all = favorites();
    else if (v.mode === 'history') all = history();
    else {
      const source = v.sourceId && findSource(v.sourceId);
      srcName.textContent = source ? nameOf(source) : t('ch.noSource');
      all = [];
      if (source) {
        loading = true;
        applyFilter();
        try {
          const res = await loadSource(source, { force });
          if (mine !== seq) return;
          all = res.channels;
        } catch {
          if (mine !== seq) return;
          failed = true;
        }
        loading = false;
      }
    }
    drawGroups();
    applyFilter();
  }

  // Режим, источник или избранное изменились — перечитываем; поиск и группа — только фильтруем.
  let last = '';
  onView((v) => {
    const key = `${v.mode}|${v.sourceId}`;
    if (key !== last) {
      last = key;
      load();
    } else {
      search.value = v.query;
      applyFilter();
    }
  });
  onStoreChange((what) => {
    const v = getView();
    if ((what === 'fav' && v.mode === 'fav') || (what === 'history' && v.mode === 'history') || (what === 'channels' && v.sourceId === 'mine-channels')) load();
    else if (what === 'fav') drawList();
  });
  onPlayback(() => grid?.querySelectorAll('.item').forEach((n) => n.classList.toggle('playing', n._url === getPlayback().channel?.url)));
  document.addEventListener('langchange', () => {
    drawGroups();
    applyFilter();
  });

  const markModes = () => ['source', 'fav', 'history'].forEach((id, i) => modes.children[i].classList.toggle('on', id === getView().mode));
  onView(markModes);
  last = `${getView().mode}|${getView().sourceId}`;
  markModes();
  applyFilter();
  return root;
}
