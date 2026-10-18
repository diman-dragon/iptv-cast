import { el, button, icon } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { Iptv } from '../iptv/native.js';
import { getPlayback, pickChromecast, useDlna } from '../iptv/playback.js';
import { ICONS } from '../ui/icons.js';
import { closeModal, openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

// Окно «Показать на ТВ»: Chromecast (системный список) и телевизоры DLNA (ищем по сети).
export function openTvDialog() {
  const body = el('div', 'tv-dialog');

  const cast = button('tv-row', async () => {
    try {
      await pickChromecast();
      closeModal();
    } catch {
      toast(t('cast.unavailable'));
    }
  });
  const castText = el('div', 'meta');
  castText.append(el('div', 'fname', 'Chromecast / Google TV'), bindText(el('div', 'fsub'), 'tv.castHint'));
  cast.append(icon(ICONS.cast, 'tv-row-ico'), castText);

  const dlnaHead = el('div', 'tv-head');
  const scanBtn = bindText(button('btn ghost sm', () => scan()), 'tv.rescan');
  dlnaHead.append(bindText(el('span'), 'tv.dlna'), scanBtn);
  const list = el('div', 'tv-list');

  const diag = el('pre', 'diag');
  diag.hidden = true;
  const diagBtn = bindText(
    button('btn ghost sm', async () => {
      diag.hidden = false;
      diag.textContent = t('set.diagRunning');
      diag.textContent = (await diagnoseTv()).join('\n');
    }),
    'tv.diag',
  );

  let seq = 0;
  async function scan() {
    const mine = ++seq;
    list.replaceChildren(el('div', 'spinner small'));
    let devices = [];
    try {
      devices = (await Iptv.dlnaScan({ timeout: 3500 })).devices ?? [];
    } catch {
      /* покажем «не найдено» */
    }
    if (mine !== seq) return;
    if (!devices.length) {
      list.replaceChildren(bindText(el('div', 'muted small tv-none'), 'tv.none'));
      return;
    }
    const current = getPlayback().dlna?.location;
    list.replaceChildren(
      ...devices.map((d) => {
        const row = button(`tv-row${d.location === current ? ' on' : ''}`, async () => {
          await useDlna(d);
          closeModal();
        });
        const meta = el('div', 'meta');
        meta.append(el('div', 'fname', d.name), el('div', 'fsub', 'DLNA'));
        row.append(icon(ICONS.tv, 'tv-row-ico'), meta);
        return row;
      }),
    );
  }

  body.append(cast, dlnaHead, list, diagBtn, diag);
  openModal(t('tv.title'), [body]);
  scan();
}

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
