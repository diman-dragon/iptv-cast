import { el, button } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { TYPES } from '../data/types.js';
import { navigate } from '../app/router.js';
import { parsePack } from '../iptv/import.js';
import { parseM3u } from '../iptv/parse.js';
import { cachePlaylist, downloadAny, saveFileSource } from '../iptv/playlist.js';
import { addChannel, addSource, addSources, customSources } from '../iptv/store.js';
import { setView } from '../iptv/view-state.js';
import { createField, createSelect } from '../ui/field.js';
import { closeModal, openModal } from '../ui/modal.js';
import { createSegmented } from '../ui/segmented.js';
import { toast } from '../ui/toast.js';

const isUrl = (s) => /^https?:\/\/\S+$/i.test(s);
const readFile = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });

function openSourceNow(source) {
  navigate('library');
  setView({ sourceId: source.id });
}

// «Загрузить»: плейлист по ссылке, файл (плейлист или подборка) или один канал.
export function openAddDialog() {
  let mode = 'link';
  let file = null;
  const body = el('div', 'form');
  const error = el('div', 'form-error');
  const typeItems = TYPES.filter((x) => x.id !== 'mine').map((x) => ({ id: x.id, label: `${x.emoji} ${t(x.key)}` }));
  const typeSelect = createSelect(typeItems, 'mix');
  let name;
  let url;
  let group;
  let picked;
  let busy = false;

  const draw = () => {
    error.textContent = '';
    file = null;
    name = createField('add.name', { placeholderKey: mode === 'channel' ? 'add.nameChannelPh' : 'add.namePh' });
    url = createField('add.url', { placeholderKey: 'add.urlPh', type: 'url', hintKey: mode === 'link' ? 'add.linkHint' : undefined });
    group = createField('add.group', { placeholderKey: 'add.groupPh' });
    const nodes = [];
    if (mode === 'channel') {
      nodes.push(name.node, url.node, group.node);
    } else {
      const typeRow = el('label', 'field');
      typeRow.append(bindText(el('span', 'field-label'), 'add.type'), typeSelect);
      if (mode === 'link') nodes.push(url.node);
      else {
        picked = el('div', 'field-hint', t('add.noFile'));
        const input = el('input');
        Object.assign(input, { type: 'file', accept: '.m3u,.m3u8,.json,.txt,*/*', hidden: true });
        input.addEventListener('change', () => {
          file = input.files?.[0] ?? null;
          picked.textContent = file ? file.name : t('add.noFile');
        });
        const choose = bindText(button('btn ghost', () => input.click()), 'add.chooseFile');
        nodes.push(choose, input, picked, bindText(el('div', 'field-hint'), 'add.fileHint'));
      }
      nodes.push(name.node, typeRow);
    }
    body.replaceChildren(...nodes);
  };

  // Текст пришёл откуда угодно (ссылка или файл): это подборка или один плейлист?
  const take = async (text, { link = '', label }) => {
    const pack = parsePack(text);
    if (pack) {
      if (!pack.length) return (error.textContent = t('add.emptyFile'));
      const added = addSources(pack);
      closeModal();
      toast(added.length ? t('add.packDone', { n: added.length }) : t('add.packNone'));
      return navigate('library');
    }
    if (!parseM3u(text).length) return (error.textContent = t('add.emptyFile'));
    const entry = { name: name.input.value.trim() || label, type: typeSelect.value };
    let source;
    if (link) {
      source = addSource({ ...entry, url: link }) ?? customSources().find((x) => x.url === link);
      await cachePlaylist(source.id, text);
    } else {
      source = addSource({ ...entry, url: '', file: true });
      await saveFileSource(source.id, text);
    }
    closeModal();
    toast(t('add.done'));
    openSourceNow(source);
  };

  const submit = async () => {
    if (busy) return;
    error.textContent = '';
    try {
      if (mode === 'channel') {
        const link = url.input.value.trim();
        if (!isUrl(link) && !/^(rtmp|rtsp|udp):\/\//i.test(link)) return (error.textContent = t('add.badUrl'));
        addChannel({ name: name.input.value.trim() || t('add.unnamed'), url: link, group: group.input.value.trim() || t('add.myGroup') });
        closeModal();
        return toast(t('add.channelDone'));
      }
      busy = true;
      if (mode === 'link') {
        const link = url.input.value.trim();
        if (!isUrl(link)) return (error.textContent = t('add.badUrl'));
        error.textContent = t('add.downloading');
        let host = link;
        try {
          host = new URL(link).host;
        } catch {
          /* оставляем ссылку как имя */
        }
        error.textContent = '';
        await take(await downloadAny(link), { link, label: host });
      } else {
        if (!file) return (error.textContent = t('add.badFile'));
        await take(await readFile(file), { label: file.name });
      }
    } catch (e) {
      error.textContent = `${t('add.failed')}: ${e?.message ?? e}`;
    } finally {
      busy = false;
    }
  };

  const seg = createSegmented(
    [
      { id: 'link', labelKey: 'add.modeLink' },
      { id: 'file', labelKey: 'add.modeFile' },
      { id: 'channel', labelKey: 'add.modeChannel' },
    ],
    () => mode,
    (id) => {
      mode = id;
      draw();
    },
  );
  seg.classList.add('seg-full');

  const actions = el('div', 'modal-actions');
  actions.append(bindText(button('btn ghost', closeModal), 'lib.cancel'), bindText(button('btn', submit), 'add.submit'));
  draw();
  openModal(t('add.title'), [seg, body, error, actions]);
}
