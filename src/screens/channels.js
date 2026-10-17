import { el, button, icon, image } from '../core/dom.js';
import { bindAria } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { cleanName, tagsOf } from '../iptv/parse.js';
import { castChannel, getPlayback, onPlayback, playChannel } from '../iptv/playback.js';
import { loadSource } from '../iptv/playlist.js';
import { FAV_ID, HISTORY_ID, MINE_ID, findSource, nameOf } from '../iptv/sources.js';
import { getPref, isFavorite, onStoreChange, removeChannel, setPref, toggleFavorite } from '../iptv/store.js';
import { createSelect } from '../ui/field.js';
import { ICONS } from '../ui/icons.js';
import { createSearch } from '../ui/search.js';
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
  thumb.append(el('span', 'thumb-letter', [...name.trim()][0]?.toUpperCase() ?? '?'));
  if (/^https?:/i.test(ch.logo)) {
    const img = image('thumb-img', ch.logo);
    img.addEventListener('load', () => thumb.classList.add('has-logo'));
    img.addEventListener('error', () => img.remove());
    thumb.append(img);
  }
  return thumb;
}

// Список каналов одного источника — внутри экрана «Каталог». onBack — «назад к каталогу».
export function createChannelsView({ onBack }) {
  const node = el('div', 'channels');
  let source = null;
  let all = [];
  let filtered = [];
  let shown = 0;
  let query = '';
  let group = '';
  let loading = false;
  let failed = false;
  let failText = '';
  let seq = 0; // номер последней загрузки: устаревшие ответы отбрасываем
  let grid = null;
  let observer = null;

  // ---------- верх: назад, обновить, поиск, группа, вид
  const backBtn = button('src-chip', onBack);
  const backName = el('span', 'src-chip-name');
  backBtn.append(icon(ICONS.back), backName);
  const refreshBtn = button('icon-btn', () => load(true));
  refreshBtn.append(icon(ICONS.refresh));
  bindAria(refreshBtn, 'ch.refresh');
  const top = el('div', 'ch-top');
  top.append(backBtn, refreshBtn);

  const search = createSearch('ch.search', (text) => {
    query = text;
    applyFilter();
  });
  const viewSwitch = createViewSwitch(
    () => getPref('cview'),
    (v) => {
      setPref('cview', v);
      drawList();
    },
  );
  const groupBox = el('div', 'group-box');
  const toolsRow = el('div', 'tools-row');
  toolsRow.append(groupBox, viewSwitch);
  const status = el('div', 'muted small');
  const head = el('div', 'ch-head');
  head.append(top, search, toolsRow, status);

  const list = el('div');
  const more = button('btn ghost more-btn', () => drawMore());
  more.textContent = t('ch.more');
  document.addEventListener('langchange', () => (more.textContent = t('ch.more')));
  node.append(head, list);

  // ---------- строка канала
  function createItem(ch) {
    const item = el('div', 'item');
    item._url = ch.url;
    item.classList.toggle('playing', getPlayback().channel?.url === ch.url);
    const meta = el('div', 'meta');
    const name = el('div', 'fname');
    const label = el('span', '', cleanName(ch.name));
    const sub = el('div', 'fsub');
    sub.textContent = [ch.group, ...tagsOf(ch.name).slice(0, 2)].filter(Boolean).join(' · ');
    name.append(label);
    meta.append(name, sub);

    const acts = el('div', 'acts');
    const favBtn = button('row-btn', (e) => {
      e.stopPropagation();
      toast(toggleFavorite(ch) ? t('ch.favAdded') : t('ch.favRemoved'));
    });
    bindAria(favBtn, 'ch.addFav');
    const castBtn = button('row-btn', (e) => {
      e.stopPropagation();
      castChannel(ch, filtered).catch(() => toast(t('cast.unavailable')));
    });
    castBtn.append(icon(ICONS.cast));
    bindAria(castBtn, 'ch.cast');
    acts.append(favBtn, castBtn);
    if (source?.id === MINE_ID) {
      const del = button('row-btn', (e) => {
        e.stopPropagation();
        removeChannel(ch.url);
      });
      del.append(icon(ICONS.trash));
      bindAria(del, 'ch.remove');
      acts.append(del);
    }

    // Звёздочка и пометка в названии отражают избранное.
    item._sync = () => {
      const fav = isFavorite(ch.url);
      favBtn.replaceChildren(icon(fav ? ICONS.starFill : ICONS.star));
      favBtn.classList.toggle('fav-on', fav);
      name.querySelector('.fav-mark')?.remove();
    };
    item._sync();
    item.append(createThumb(ch), meta, acts);
    item.addEventListener('click', () => playChannel(ch, filtered));
    return item;
  }

  // ---------- список с постраничной подгрузкой
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

  function emptyBox() {
    const id = source?.id;
    if (id === FAV_ID) return createStateBox(ICONS.star, 'ch.noFav', 'ch.noFavHint');
    if (id === HISTORY_ID) return createStateBox(ICONS.clock, 'ch.noHistory', 'ch.noHistoryHint');
    if (id === MINE_ID) return createStateBox(ICONS.plus, 'ch.noMine', 'ch.noMineHint');
    return createStateBox(ICONS.search, 'ch.noMatch');
  }

  function drawList() {
    observer?.disconnect();
    shown = 0;
    grid = null;
    if (loading) return list.replaceChildren(el('div', 'spinner'));
    if (failed) {
      const box = createStateBox(ICONS.refresh, 'ch.error', 'ch.errorHint', 'ch.retry', () => load(true));
      box.querySelector('.empty-title').after(el('code', 'err-detail', failText));
      return list.replaceChildren(box);
    }
    if (!filtered.length) return list.replaceChildren(emptyBox());
    grid = el('div', `lib-items ${getPref('cview')}`);
    list.replaceChildren(grid);
    drawMore();
  }

  function applyFilter() {
    const q = query.toLowerCase();
    filtered = all.filter((c) => (!group || c.group === group) && (!q || c.name.toLowerCase().includes(q)));
    status.textContent = loading ? t('ch.loading') : all.length ? t('ch.count', { n: filtered.length, total: all.length }) : '';
    drawList();
  }

  function drawGroups() {
    const groups = [...new Set(all.map((c) => c.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    groupBox.hidden = groups.length < 2;
    if (groupBox.hidden) return;
    const select = createSelect([{ id: '', label: t('ch.allGroups') }, ...groups.map((g) => ({ id: g, label: g }))], group);
    select.addEventListener('change', () => {
      group = select.value;
      applyFilter();
    });
    groupBox.replaceChildren(select);
  }

  async function load(force = false) {
    if (!source) return;
    const mine = ++seq;
    failed = false;
    backName.textContent = nameOf(source);
    refreshBtn.hidden = Boolean(source.virtual);
    loading = true;
    all = [];
    applyFilter();
    try {
      const res = await loadSource(source, { force });
      if (mine !== seq) return;
      all = res.channels;
    } catch (e) {
      if (mine !== seq) return;
      failed = true;
      failText = String(e?.message ?? e);
    }
    loading = false;
    drawGroups();
    applyFilter();
  }

  // Открыть источник по id.
  function open(id) {
    source = findSource(id) ?? null;
    query = '';
    group = '';
    search.value = '';
    if (source) load();
  }

  // Избранное, история и «мои каналы» меняются сами — перечитываем без индикатора загрузки.
  onStoreChange(async (what) => {
    if (!source) return;
    const live = { fav: FAV_ID, history: HISTORY_ID, channels: MINE_ID }[what];
    if (live && live === source.id) {
      all = (await loadSource(source)).channels;
      drawGroups();
      applyFilter();
    } else if (what === 'fav') {
      grid?.querySelectorAll('.item').forEach((n) => n._sync?.());
    }
  });
  onPlayback(() => grid?.querySelectorAll('.item').forEach((n) => n.classList.toggle('playing', n._url === getPlayback().channel?.url)));
  document.addEventListener('langchange', () => {
    if (!source) return;
    backName.textContent = nameOf(source);
    drawGroups();
    applyFilter();
  });

  return { node, open };
}
