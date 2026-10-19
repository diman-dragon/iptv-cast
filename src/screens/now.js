import { el, button, icon } from '../core/dom.js';
import { bindAria } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { getScreen, onNavigate } from '../app/router.js';
import { cleanName } from '../iptv/parse.js';
import { Iptv } from '../iptv/native.js';
import { canZap, errorText, getPlayback, hasTv, onPlayback, openTvPicker, setSleep, startStop, tvName, zap } from '../iptv/playback.js';
import { ICONS } from '../ui/icons.js';
import { isModalOpen } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

const SLEEP = [0, 15, 30, 60, 90];

const fmtLeft = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Вкладка «Плеер»: окно просмотра и под ним кнопки — сон, предыдущий, пуск/стоп, следующий, ТВ.
// В самом окне (оно нативное, лежит поверх страницы) две кнопки: качество и «на весь экран».
export function renderNow() {
  const root = el('section', 'player');

  // ---------- окно просмотра: заглушка под нативным видео
  const stage = el('div', 'stage');
  const ph = el('div', 'stage-ph');
  stage.append(ph);

  // ---------- кнопки
  const ctl = (svg, key, run, cls = '') => {
    const b = button(`pc ${cls}`, run);
    b.append(icon(svg));
    bindAria(b, key);
    return b;
  };

  // Сон: по нажатию выдвигается вверх список значений.
  const sleepWrap = el('div', 'pc-sleep');
  const sleepBtn = button('pc', () => togglePop());
  const sleepLeft = el('span', 'pc-badge');
  sleepBtn.append(icon(ICONS.moon), sleepLeft);
  bindAria(sleepBtn, 'now.sleep');
  const pop = el('div', 'pc-pop');
  pop.hidden = true;
  let minutes = 0;
  const chips = SLEEP.map((m) => {
    const chip = button('pc-chip', () => {
      minutes = m;
      setSleep(m);
      closePop();
      draw();
    });
    chip.textContent = m ? `${m}′` : t('now.sleepOff');
    chip.dataset.m = String(m);
    return chip;
  });
  pop.append(...chips);
  sleepWrap.append(sleepBtn, pop);
  let popOpen = false;
  function togglePop() {
    popOpen ? closePop() : openPop();
  }
  function openPop() {
    popOpen = true;
    pop.hidden = false;
    chips.forEach((c) => c.classList.toggle('on', Number(c.dataset.m) === minutes));
    syncEmbed();
  }
  function closePop() {
    popOpen = false;
    pop.hidden = true;
    syncEmbed();
  }
  document.addEventListener('click', (e) => {
    if (popOpen && !sleepWrap.contains(e.target)) closePop();
  });
  document.addEventListener('langchange', () => chips.forEach((c) => (c.dataset.m === '0' ? (c.textContent = t('now.sleepOff')) : 0)));

  const prev = ctl(ICONS.prev, 'now.prev', () => zap(-1).then((ok) => ok || toast(t('now.noPrev'))));
  const play = ctl(ICONS.play, 'now.start', () => startStop(), 'big');
  const next = ctl(ICONS.next, 'now.next', () => zap(1).then((ok) => ok || toast(t('now.noNext'))));
  const tv = ctl(ICONS.cast, 'now.tv', () => openTvPicker().catch(() => toast(t('cast.unavailable'))));
  const row = el('div', 'pc-row');
  row.append(sleepWrap, prev, play, next, tv);

  root.append(stage, row);

  // ---------- нативное видео поверх окна просмотра
  // Нативный вид лежит над страницей, поэтому прячем его, пока открыто что-то поверх (список сна, окна).
  let last = '';
  const wantVideo = () => {
    const S = getPlayback();
    return getScreen() === 'player' && !popOpen && !isModalOpen() && Boolean(S.channel) && !S.onTv && (S.playing || S.loading || Boolean(S.error));
  };
  function syncEmbed() {
    const r = stage.getBoundingClientRect();
    if (!wantVideo() || r.width < 2) {
      if (last !== 'hide') {
        last = 'hide';
        Iptv.embedHide();
      }
      return;
    }
    const key = [r.left, r.top, r.width, r.height].map(Math.round).join(',');
    if (key !== last) {
      last = key;
      Iptv.embedShow({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
  }
  setInterval(syncEmbed, 200); // окно едет вместе со страницей (переходы, прокрутка, поворот)
  onNavigate(() => {
    closePop();
    syncEmbed();
  });

  // ---------- заглушка и состояние кнопок
  const phBlock = (svg, title, sub, bad = false) => {
    const box = el('div', 'ph-box');
    box.append(icon(svg, 'ph-ico'), el('div', `ph-title${bad ? ' bad' : ''}`, title));
    if (sub) box.append(el('div', 'ph-sub', sub));
    return box;
  };

  function draw() {
    const S = getPlayback();
    const ch = S.channel;
    const name = ch ? cleanName(ch.name) : '';
    const local = S.playing || S.loading || Boolean(S.error);
    if (!ch) ph.replaceChildren(phBlock(ICONS.tv, t('now.empty'), t('now.emptyHint')));
    else if (S.onTv) {
      const err = S.tvError ? t('tv.failedShort') : '';
      ph.replaceChildren(phBlock(ICONS.cast, t('now.statusTv', { d: tvName() }), err || name, Boolean(err)));
    } else if (local) {
      const err = errorText(S.error);
      ph.replaceChildren(phBlock(ICONS.tv, name, err ? `${err} · ${S.error.replace('ERROR_CODE_', '')}` : t('now.loading'), Boolean(err)));
    } else ph.replaceChildren(phBlock(ICONS.tv, name, t('now.stoppedHint')));

    const running = S.onTv ? S.tvPlaying : S.playing || S.loading;
    play.replaceChildren(icon(running ? ICONS.stop : ICONS.play));
    play.setAttribute('aria-label', t(running ? 'now.stop' : 'now.start'));
    play.classList.toggle('on', running);
    play.disabled = !ch;
    prev.disabled = !canZap(-1);
    next.disabled = !canZap(1);
    tv.disabled = !ch;
    tv.classList.toggle('on', hasTv());
    minutes = S.sleepDeadline ? minutes : 0;
    tickSleep();
    syncEmbed();
  }

  // Обратный отсчёт таймера сна на самой кнопке.
  let timer = 0;
  function tickSleep() {
    const left = getPlayback().sleepDeadline - Date.now();
    sleepLeft.textContent = left > 0 ? fmtLeft(left) : '';
    sleepBtn.classList.toggle('on', left > 0);
    clearTimeout(timer);
    if (left > 0) timer = setTimeout(tickSleep, 1000);
  }

  onPlayback(draw);
  document.addEventListener('langchange', draw);
  draw();
  return root;
}
