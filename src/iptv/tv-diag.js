import { t } from '../i18n/i18n.js';
import { Iptv } from './native.js';

// Что видит телефон: адрес в сети, сервисы Google Play, готовность Cast, найденные DLNA-телевизоры.
export async function diagnoseTv() {
  const out = [];
  try {
    const n = await Iptv.netInfo();
    out.push(`${n.ip ? '✔' : '✖'} ${t('tv.diagIp')}: ${n.ip || t('tv.diagNoWifi')}`);
    out.push(`${n.gms === 0 ? '✔' : '✖'} Google Play services: ${n.gms === 0 ? 'OK' : n.gms === -1 ? t('tv.diagMissing') : `code ${n.gms}`}`);
    out.push(`${n.castReady ? '✔' : '✖'} Google Cast: ${n.castReady ? 'OK' : t('tv.diagNotReady')}`);
  } catch (e) {
    out.push(`✖ netInfo: ${e?.message ?? e}`);
  }
  try {
    const d = (await Iptv.dlnaScan({ timeout: 3000 })).devices ?? [];
    out.push(`${d.length ? '✔' : '✖'} DLNA: ${d.length ? d.map((x) => x.name).join(', ') : t('tv.diagNoDlna')}`);
  } catch (e) {
    out.push(`✖ DLNA: ${e?.message ?? e}`);
  }
  return out;
}
