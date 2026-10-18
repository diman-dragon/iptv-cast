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
};
let pending = null; // канал, который отправим на ТВ, как только пользователь выберет ТВ
let tvPicker = async () => {}; // окно выбора ТВ регистрирует интерфейс
const AROUND = 150; // сколько соседних каналов отдаём нативной очереди

const listeners = new Set();
export const getPlayback = () => S;
export const onPlayback = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(S));

export const setTvPicker = (fn) => (tvPicker = fn);
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
  // Канал могли переключить кнопками окна плеера — подхватываем то, что играет сейчас.
  if (!S.onTv && st.loaded && st.url && S.channel?.url !== st.url) {
    S.channel = S.list.find((c) => c.url === st.url) ?? { name: st.title, url: st.url, group: st.sub || '', logo: st.logo || '' };
    pushHistory(S.channel);
  }
  emit();
}

async function applyCast(info) {
  S.cast = { available: Boolean(info.available), connected: Boolean(info.connected), device: info.device || '' };
  if (S.cast.connected) S.dlna = null; // активен один ТВ
  if (!hasTv()) {
    S.onTv = false;
    pending = null;
  } else if (pending) {
    const ch = pending;
    pending = null;
    await sendToTv(ch);
  }
  emit();
}

function failTv(message) {
  S.tvError = message || 'error';
  S.tvPlaying = false;
  toast(t('tv.failed'), 4200);
  emit();
}

export async function initPlayback() {
  await Iptv.addListener('state', applyState);
  await Iptv.addListener('cast', applyCast);
  await Iptv.addListener('castError', (e) => failTv(e?.message));
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
export async function playChannel(ch, list) {
  if (list?.length) S.list = list;
  S.channel = ch;
  pushHistory(ch);
  if (hasTv() && getPref('preferCast')) return sendToTv(ch);
  S.onTv = false;
  S.error = '';
  emit();
  const all = S.list.length ? S.list : [ch];
  const at = Math.max(0, all.findIndex((c) => c.url === ch.url));
  const from = Math.max(0, at - AROUND);
  // video: окно плеера открывается тем же вызовом, без второго обращения к нативной части.
  await Iptv.play({ ...item(ch), queue: all.slice(from, at + AROUND).map(item), index: at - from, video: true });
}

// Явно «на ТВ»: если ТВ ещё не выбран — откроется окно выбора, а канал уйдёт сам после выбора.
export async function castChannel(ch, list) {
  if (list?.length) S.list = list;
  S.channel = ch;
  pushHistory(ch);
  if (hasTv()) return sendToTv(ch);
  pending = ch;
  await tvPicker();
}

// Выбран DLNA-телевизор из окна выбора.
export async function useDlna(device) {
  if (S.cast.connected) await Iptv.castStop().catch(() => {});
  S.dlna = device;
  S.tvError = '';
  emit();
  if (pending) {
    const ch = pending;
    pending = null;
    await sendToTv(ch);
  }
}

export const pickChromecast = () => Iptv.castPicker();

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

export async function togglePlay() {
  if (S.onTv && hasTv()) {
    const action = S.tvPlaying ? 'pause' : 'play';
    S.tvPlaying = !S.tvPlaying;
    emit();
    try {
      return S.dlna ? await Iptv.dlnaControl({ ...S.dlna, action }) : await Iptv.castControl({ action });
    } catch (e) {
      return failTv(String(e?.message ?? e));
    }
  }
  if (S.playing) return Iptv.pause();
  if (S.channel && !S.loading) {
    const st = await Iptv.state();
    return st.loaded ? Iptv.resume() : playChannel(S.channel);
  }
}

export async function stopPlayback() {
  if (S.onTv && S.dlna) await Iptv.dlnaControl({ ...S.dlna, action: 'stop' }).catch(() => {});
  S.onTv = false;
  S.tvPlaying = false;
  S.sleepDeadline = 0;
  await Iptv.stop();
  emit();
}

// Переключение по списку: step = +1 следующий, -1 предыдущий. true — переключили.
export async function zap(step) {
  if (S.onTv) {
    const i = S.list.findIndex((c) => c.url === S.channel?.url);
    const next = S.list[i + step];
    if (next) await castChannel(next);
    return Boolean(next);
  }
  const st = await Iptv.zap({ step });
  applyState(st);
  return st.moved !== false;
}

export async function setSleep(minutes) {
  applyState(await Iptv.sleep({ minutes }));
}

export const openVideo = () => Iptv.openVideo();
export const openExternal = (ch) => Iptv.openExternal({ url: ch.url, title: cleanName(ch.name) });
