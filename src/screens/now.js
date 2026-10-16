import { el, button, icon, image } from '../core/dom.js';
import { bindAria, bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { navigate } from '../app/router.js';
import { cleanName } from '../iptv/parse.js';
import {
  castChannel, disconnectTv, errorText, getPlayback, onPlayback, openExternal, openVideo, pickTv,
  playChannel, setSleep, stopPlayback, togglePlay, zap,
} from '../iptv/playback.js';
import { history, isFavorite, onStoreChange, toggleFavorite } from '../iptv/store.js';
import { ICONS } from '../ui/icons.js';
import { createSegmented } from '../ui/segmented.js';
import { createStateBox } from '../ui/state-box.js';
import { toast } from '../ui/toast.js';

const SLEEP = [0, 15, 30, 60, 90];

const fmtLeft = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// «Сейчас»: что играет, управление, ТВ и таймер сна.
export function renderNow() {
  const root = el('section', 'now');
  const card = el('div', 'now-card');
  const stage = el('div', 'now-stage');
  const logo = el('div', 'now-logo');
  const title = el('div', 'now-title');
  const sub = el('div', 'muted small');
  const status = el('div', 'now-status');
  stage.append(logo);
  card.append(stage, title, sub, status);

  const ctl = (svg, key, run, cls = '') => {
    const b = button(`ctl ${cls}`, run);
    b.append(icon(svg));
    bindAria(b, key);
    return b;
  };
  const prev = ctl(ICONS.prev, 'now.prev', () => zap(-1).then((ok) => ok || toast(t('now.noPrev'))));
  const next = ctl(ICONS.next, 'now.next', () => zap(1).then((ok) => ok || toast(t('now.noNext'))));
  const play = ctl(ICONS.play, 'now.play', () => togglePlay(), 'big');
  const stop = ctl(ICONS.stop, 'now.stop', () => stopPlayback());
  const controls = el('div', 'ctl-row');
  controls.append(prev, stop, play, next);

  const actions = el('div', 'act-row');
  const act = (svg, key, run) => {
    const b = button('act', run);
    b.append(icon(svg), bindText(el('span'), key));
    return b;
  };
  const videoBtn = act(ICONS.video, 'now.video', () => openVideo());
  const tvBtn = act(ICONS.cast, 'now.tv', () => {
    const { channel } = getPlayback();
    (channel ? castChannel(channel) : pickTv()).catch(() => toast(t('cast.unavailable')));
  });
  const extBtn = act(ICONS.external, 'now.external', () => {
    const { channel } = getPlayback();
    if (channel) openExternal(channel).catch(() => toast(t('ch.noApp')));
  });
  const favBtn = act(ICONS.star, 'now.fav', () => {
    const { channel } = getPlayback();
    if (channel) toast(toggleFavorite(channel) ? t('ch.favAdded') : t('ch.favRemoved'));
  });
  actions.append(videoBtn, tvBtn, extBtn, favBtn);

  const tvPanel = el('div', 'tv-panel');
  const tvText = el('div', 'tv-text');
  const tvOff = bindText(button('btn ghost', () => disconnectTv()), 'now.disconnect');
  tvPanel.append(icon(ICONS.cast, 'tv-ico'), tvText, tvOff);

  const sleepBox = el('div', 'sleep');
  const sleepHead = el('div', 'sleep-head');
  const sleepLeft = el('span', 'sleep-left');
  sleepHead.append(icon(ICONS.moon, 'sleep-ico'), bindText(el('span'), 'now.sleep'), sleepLeft);
  let minutes = 0;
  const sleepSeg = createSegmented(
    SLEEP.map((m) => (m ? { id: m, label: `${m}′` } : { id: 0, labelKey: 'now.sleepOff' })),
    () => minutes,
    (m) => {
      minutes = m;
      setSleep(m);
    },
  );
  sleepSeg.classList.add('seg-full');
  sleepBox.append(sleepHead, sleepSeg);

  const recentHead = bindText(el('h3', 'section-title'), 'now.recent');
  const recent = el('div', 'lib-items list');

  function drawRecent() {
    const items = history().slice(0, 8);
    recentHead.hidden = recent.hidden = !items.length;
    recent.replaceChildren(
      ...items.map((ch) => {
        const row = el('div', 'item');
        const meta = el('div', 'meta');
        meta.append(el('div', 'fname', cleanName(ch.name)), el('div', 'fsub', ch.group || ''));
        const go = button('row-btn', (e) => {
          e.stopPropagation();
          playChannel(ch, history());
        });
        go.append(icon(ICONS.play));
        row.append(meta, go);
        row.addEventListener('click', () => playChannel(ch, history()));
        return row;
      }),
    );
  }

  const empty = createStateBox(ICONS.now, 'now.empty', 'now.emptyHint', 'now.toChannels', () => navigate('channels'));

  function draw() {
    const S = getPlayback();
    const has = Boolean(S.channel);
    empty.hidden = has;
    [card, controls, actions, sleepBox].forEach((n) => (n.hidden = !has));
    tvPanel.hidden = !S.cast.connected;
    tvText.textContent = t('now.onTv', { d: S.cast.device });
    if (has) {
      const ch = S.channel;
      title.textContent = cleanName(ch.name);
      sub.textContent = ch.group || '';
      logo.replaceChildren();
      logo.classList.toggle('has-logo', /^https?:/i.test(ch.logo ?? ''));
      if (/^https?:/i.test(ch.logo ?? '')) {
        const img = image('now-img', ch.logo);
        img.addEventListener('error', () => img.remove());
        logo.append(img);
      } else logo.append(icon(ICONS.tv, 'now-ico'));
      const err = errorText(S.error);
      status.className = `now-status ${err ? 'bad' : S.playing ? 'live' : ''}`;
      status.textContent = err || (S.onTv ? t('now.statusTv', { d: S.cast.device }) : S.loading ? t('now.loading') : S.playing ? t('now.live') : t('now.paused'));
      play.replaceChildren(icon(S.playing ? ICONS.pause : ICONS.play));
      play.classList.toggle('on', S.playing);
      favBtn.classList.toggle('on', isFavorite(ch.url));
      favBtn.querySelector('.ico').innerHTML = isFavorite(ch.url) ? ICONS.starFill : ICONS.star;
      videoBtn.hidden = S.onTv;
    }
    minutes = S.sleepDeadline ? minutes : 0;
    sleepSeg.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', SLEEP[i] === minutes));
    tick();
  }

  // Обратный отсчёт таймера сна.
  let timer = 0;
  function tick() {
    const left = getPlayback().sleepDeadline - Date.now();
    sleepLeft.textContent = left > 0 ? fmtLeft(left) : '';
    clearTimeout(timer);
    if (left > 0) timer = setTimeout(tick, 1000);
  }

  root.append(empty, card, controls, actions, tvPanel, sleepBox, recentHead, recent);
  onPlayback(draw);
  onStoreChange((what) => {
    if (what === 'history') drawRecent();
    if (what === 'fav') draw();
  });
  document.addEventListener('langchange', draw);
  draw();
  drawRecent();
  return root;
}
