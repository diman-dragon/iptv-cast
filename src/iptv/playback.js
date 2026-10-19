import { t } from '../i18n/i18n.js';
import { toast } from '../ui/toast.js';
import { cleanName } from './parse.js';
import { Iptv } from './native.js';
import { getPref, pushHistory } from './store.js';

// Состояние воспроизведения для всех экранов: что играет, на телефоне или на ТВ, таймер сна.
// ТВ бывает двух видов: Chromecast (Google Cast) и DLNA (Samsung, LG, Sony и др.).
const S = {
  channel: null, // последний выбранный канал
  list: [], // список, из которого выбран (для переключения на ТВ и повторного запуска)
  playing: false,
  loading: false,
  error: '',
  onTv: false, // канал отправлен на ТВ
  tvPlaying: false, // на ТВ идёт воспроизведение (а не пауза)
  tvError: '', // ТВ не смог загрузить поток
  cast: { available: false, connected: false, device: '' }, // Chromecast
  dlna: null, // выбранный DLNA-телевизор: { name, location, controlUrl, serviceType }
  sleepDeadline: 0, // Date.now() момента, когда сработает таймер сна
  hasPrev: false, // в очереди плеера есть предыдущий / следующий канал
  hasNext: false,
};
const AROUND = 150; // сколько соседних каналов отдаём нативной очереди

const listeners = new Set();
export const getPlayback = () => S;
export const onPlayback = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(S));

export const hasTv = () => Boolean(S.dlna) || S.cast.connected;
export const tvName = () => S.dlna?.name || (S.cast.connected ? S.cast.device : '');

const item = (ch) => ({
  url: ch.url,
  title: cleanName(ch.name),
  subtitle: ch.group || '',
  logo: ch.logo || '',
  ua: ch.ua || getPref('ua') || '',
  ref: ch.ref || '',
});

function applyState(st) {
  S.playing = Boolean(st.playing);
  S.loading = Boolean(st.loading);
  S.error = st.error || '';
  S.sleepDeadline = st.sleepLeft > 0 ? Date.now() + st.sleepLeft * 1000 : 0;
  S.hasPrev = Boolean(st.hasPrev);
  S.hasNext = Boolean(st.hasNext);
  // Канал могли переключить кнопками окна плеера — подхватываем то, что играет сейчас.
  if (!S.onTv && st.loaded && st.url && S.channel?.url !== st.url) {
    S.channel = S.list.find((c) => c.url === st.url) ?? { name: st.title, url: st.url, group: st.sub || '', logo: st.logo || '' };
    pushHistory(S.channel);
  }
  emit();
}

function applyCast(info) {
  S.cast = { available: Boolean(info.available), connected: Boolean(info.connected), device: info.device || '' };
  if (S.cast.connected) S.dlna = null; // активен один ТВ
  if (!hasTv()) S.onTv = false;
  emit();
}

// Канал ушёл на ТВ (из окна плеера или из списка): на телефоне всё остановлено и окно закрыто.
export function applyTvStarted(e) {
  const known = S.list.find((c) => c.url === e.url);
  S.channel = known ?? { name: e.title || e.url, url: e.url, group: e.sub || '', logo: e.logo || '' };
  S.dlna = e.kind === 'dlna' ? { name: e.name, location: e.location, controlUrl: e.controlUrl, serviceType: e.serviceType } : null;
  S.onTv = true;
  S.tvPlaying = true;
  S.tvError = '';
  S.playing = false;
  S.sleepDeadline = 0;
  pushHistory(S.channel);
  emit();
}

function failTv(message) {
  S.tvError = message || 'error';
  S.tvPlaying = false;
  toast(t('tv.failed'), 4200);
  emit();
}

// Настройки передачи на ТВ нужны и нативной части: кнопка «На ТВ» находится в окне плеера.
export function syncTvOptions() {
  Iptv.setTvOptions({ castProxy: getPref('castProxy'), dlnaProxy: getPref('dlnaProxy') });
}

export async function initPlayback() {
  await Iptv.addListener('state', applyState);
  await Iptv.addListener('cast', applyCast);
  await Iptv.addListener('castError', (e) => failTv(e?.message));
  await Iptv.addListener('tvStarted', applyTvStarted);
  await Iptv.addListener('tvDisconnect', backToPhone);
  syncTvOptions();
  applyState(await Iptv.state());
  applyCast(await Iptv.castState());
}

// Текст ошибки плеера для пользователя.
export function errorText(code) {
  if (!code) return '';
  if (/NETWORK|TIMEOUT|IO_UNSPECIFIED|CLEARTEXT/.test(code)) return t('err.net');
  if (/HTTP|FILE_NOT_FOUND/.test(code)) return t('err.http');
  if (/PARSING|UNSUPPORTED|DECODER|DECODING/.test(code)) return t('err.format');
  return t('err.generic');
}

// Отправить канал на ТВ: Chromecast — через телефон-прокси (CORS, заголовки), DLNA — напрямую.
async function sendToTv(ch) {
  S.channel = ch;
  S.tvError = '';
  const base = item(ch);
  try {
    if (S.dlna) {
      const proxy = Boolean(base.ua || base.ref || getPref('dlnaProxy'));
      await Iptv.dlnaPlay({ ...S.dlna, ...base, proxy });
    } else {
      await Iptv.castLoad({ ...base, proxy: getPref('castProxy') });
    }
    S.onTv = true;
    S.tvPlaying = true;
    S.error = '';
  } catch (e) {
    failTv(String(e?.message ?? e));
  }
  emit();
}

// Нажали на канал: открывается окно плеера (видео или причина ошибки).
// Если ТВ уже выбран и это разрешено — канал сразу уходит на ТВ.
export async function playChannel(ch, list, { open = true } = {}) {
  if (list?.length) S.list = list;
  S.channel = ch;
  pushHistory(ch);
  // ТВ уже подключён — канал сразу идёт на ТВ, на телефоне ничего не открывается.
  if (hasTv() && getPref('preferCast')) return sendToTv(ch);
  S.onTv = false;
  S.error = '';
  emit();
  const all = S.list.length ? S.list : [ch];
  const at = Math.max(0, all.findIndex((c) => c.url === ch.url));
  const from = Math.max(0, at - AROUND);
  // video: окно плеера открывается тем же вызовом, без второго обращения к нативной части.
  await Iptv.play({ ...item(ch), queue: all.slice(from, at + AROUND).map(item), index: at - from, video: open });
}

// Окно выбора ТВ (нативное): Chromecast и DLNA. Если ТВ уже выбран — в нём есть «Вернуть на телефон».
export function openTvPicker() {
  if (!S.channel) return Promise.resolve();
  return Iptv.tvPicker({ ...item(S.channel), sub: S.channel.group || '', active: hasTv() });
}

// «Вернуть на телефон»: отключить ТВ и продолжить этот же канал здесь.
async function backToPhone() {
  await disconnectTv();
  if (S.channel) await playChannel(S.channel, undefined, { open: false });
}

export async function disconnectTv() {
  if (S.dlna) {
    await Iptv.dlnaControl({ ...S.dlna, action: 'stop' }).catch(() => {});
    S.dlna = null;
    S.onTv = false;
    emit();
    return;
  }
  return Iptv.castStop();
}

// «Пуск / стоп»: идёт — остановить (канал остаётся выбранным), остановлено — запустить заново (эфир, без «хвоста»).
export async function startStop() {
  if (S.onTv && hasTv()) {
    if (!S.tvPlaying) return sendToTv(S.channel);
    try {
      if (S.dlna) await Iptv.dlnaControl({ ...S.dlna, action: 'stop' });
      else await Iptv.castControl({ action: 'pause' });
      S.tvPlaying = false;
      emit();
    } catch (e) {
      failTv(String(e?.message ?? e));
    }
    return;
  }
  if (S.playing || S.loading) return stopPlayback();
  if (S.channel) return playChannel(S.channel, undefined, { open: false });
}

export async function stopPlayback() {
  if (S.onTv && S.dlna) await Iptv.dlnaControl({ ...S.dlna, action: 'stop' }).catch(() => {});
  S.onTv = false;
  S.tvPlaying = false;
  S.sleepDeadline = 0;
  await Iptv.stop();
  emit();
}

// Соседний канал в списке, из которого выбран текущий.
const neighbor = (step) => S.list[S.list.findIndex((c) => c.url === S.channel?.url) + step];

// Есть ли куда переключаться (для доступности кнопок).
export function canZap(step) {
  if (S.onTv || !(S.playing || S.loading)) return Boolean(S.channel && neighbor(step));
  return step < 0 ? S.hasPrev : S.hasNext;
}

// Переключение по списку: step = +1 следующий, -1 предыдущий. true — переключили.
export async function zap(step) {
  if (S.onTv) {
    const next = neighbor(step);
    if (next) await sendToTv(next);
    return Boolean(next);
  }
  if (S.playing || S.loading) {
    const st = await Iptv.zap({ step });
    applyState(st);
    return st.moved !== false;
  }
  // Остановлено: просто запускаем соседний канал в окне вкладки.
  const next = neighbor(step);
  if (!next) return false;
  await playChannel(next, undefined, { open: false });
  return true;
}

export async function setSleep(minutes) {
  applyState(await Iptv.sleep({ minutes }));
}

export const openVideo = () => Iptv.openVideo();
export const openExternal = (ch) => Iptv.openExternal({ url: ch.url, title: cleanName(ch.name) });
