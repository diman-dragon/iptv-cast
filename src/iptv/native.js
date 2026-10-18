import { Capacitor, registerPlugin } from '@capacitor/core';

// Обёртка над нативным плагином «Iptv». В браузере (npm run dev) вместо него — заглушка.
export const isNative = Capacitor.isNativePlatform();

const plugin = isNative ? registerPlugin('Iptv') : null;

const state = { loaded: false, playing: false, loading: false, error: '', title: '', url: '', sleepLeft: 0 };
const castOff = { available: false, connected: false, device: '' };

const web = {
  play: async ({ url }) => {
    window.open(url, '_blank');
    return state;
  },
  state: async () => state,
  castState: async () => castOff,
  // В браузере потоки не проверить (CORS): считаем рабочими, чтобы интерфейс можно было отлаживать.
  probe: async () => ({ ok: true, reason: 'ok', code: 200, info: 'web', ms: 1 }),
  dlnaScan: async () => ({ devices: [] }),
  netInfo: async () => ({ ip: '', gms: -1, castReady: false }),
  addListener: async () => ({ remove() {} }),
};

// В приложении — настоящий плагин; в браузере любой незнакомый вызов возвращает безопасное значение.
export const Iptv =
  plugin ??
  new Proxy(web, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return async () => (String(prop).startsWith('cast') ? castOff : state);
    },
  });
