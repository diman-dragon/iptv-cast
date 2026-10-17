import { t } from '../i18n/i18n.js';
import { cleanName } from './parse.js';
import { Iptv } from './native.js';
import { getPref, pushHistory } from './store.js';

// Состояние воспроизведения для всех экранов: что играет, на телефоне или на ТВ, таймер сна.
const S = {
  channel: null, // последний выбранный канал
  list: [], // список, из которого выбран (для переключения на ТВ и повторного запуска)
  playing: false,
  loading: false,
  error: '',
  onTv: false, // канал отправлен на ТВ
  cast: { available: false, connected: false, device: '' },
  sleepDeadline: 0, // Date.now() момента, когда сработает таймер сна
};
let pending = null; // канал, который отправим на ТВ, как только пользователь его выберет
const AROUND = 150; // сколько соседних каналов отдаём нативной очереди

const listeners = new Set();
export const getPlayback = () => S;
export const onPlayback = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(S));

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
  if (!S.cast.connected) {
    S.onTv = false;
    pending = null;
  } else if (pending) {
    const ch = pending;
    pending = null;
    await sendToTv(ch);
  }
  emit();
}

export async function initPlayback() {
  await Iptv.addListener('state', applyState);
  await Iptv.addListener('cast', applyCast);
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

async function sendToTv(ch) {
  S.channel = ch;
  try {
    await Iptv.castLoad({ url: ch.url, title: cleanName(ch.name), logo: ch.logo || '' });
    S.onTv = true;
    S.playing = false;
    S.error = '';
  } catch (e) {
    S.error = String(e?.message ?? e);
  }
  emit();
}

// Нажали на канал: открывается окно плеера (видео или причина ошибки).
// Если к ТВ уже подключились и это разрешено — канал сразу уходит на ТВ.
export async function playChannel(ch, list) {
  if (list?.length) S.list = list;
  S.channel = ch;
  pushHistory(ch);
  if (S.cast.connected && getPref('preferCast')) return sendToTv(ch);
  S.onTv = false;
  S.error = '';
  emit();
  const all = S.list.length ? S.list : [ch];
  const at = Math.max(0, all.findIndex((c) => c.url === ch.url));
  const from = Math.max(0, at - AROUND);
  await Iptv.play({ ...item(ch), queue: all.slice(from, at + AROUND).map(item), index: at - from });
  await Iptv.openVideo();
}

// Явно «на ТВ»: если ТВ ещё не выбран — откроется список, а канал уйдёт сам после выбора.
export async function castChannel(ch, list) {
  if (list?.length) S.list = list;
  S.channel = ch;
  pushHistory(ch);
  if (S.cast.connected) return sendToTv(ch);
  pending = ch;
  try {
    await Iptv.castPicker();
  } catch (e) {
    pending = null;
    throw e;
  }
}

export const pickTv = () => Iptv.castPicker();
export const disconnectTv = () => Iptv.castStop();

export async function togglePlay() {
  if (S.onTv && S.cast.connected) {
    S.playing = !S.playing;
    emit();
    return Iptv.castControl({ action: S.playing ? 'play' : 'pause' });
  }
  if (S.playing) return Iptv.pause();
  if (S.channel && !S.loading) {
    const st = await Iptv.state();
    return st.loaded ? Iptv.resume() : playChannel(S.channel);
  }
}

export async function stopPlayback() {
  S.onTv = false;
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
