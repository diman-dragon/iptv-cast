import { el, button } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { TYPES } from '../data/types.js';
import { navigate } from '../app/router.js';
import { parseM3u } from '../iptv/parse.js';
import { saveFileSource } from '../iptv/playlist.js';
import { addChannel, addSource } from '../iptv/store.js';
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
  navigate('catalog');
  setView({ sourceId: source.id });
}

// «Добавить своё»: плейлист по ссылке, файл M3U или одиночный канал.
export function openAddDialog() {
  let mode = 'playlist';
  let file = null;
  const body = el('div', 'form');
  const error = el('div', 'form-error');
  const typeItems = TYPES.filter((x) => x.id !== 'mine').map((x) => ({ id: x.id, label: `${x.emoji} ${t(x.key)}` }));
  let typeSelect = createSelect(typeItems, 'mix');
  let name;
  let url;
  let group;
  let picked;

  const draw = () => {
    error.textContent = '';
    file = null;
    name = createField('add.name', { placeholderKey: mode === 'channel' ? 'add.nameChannelPh' : 'add.namePh' });
    url = createField('add.url', { placeholderKey: 'add.urlPh', type: 'url' });
    group = createField('add.group', { placeholderKey: 'add.groupPh' });
    const nodes = [];
    if (mode === 'channel') {
      nodes.push(name.node, url.node, group.node);
    } else {
      const typeRow = el('label', 'field');
      typeRow.append(bindText(el('span', 'field-label'), 'add.type'), typeSelect);
      if (mode === 'playlist') nodes.push(url.node);
      else {
        picked = el('div', 'field-hint', t('add.noFile'));
        const choose = bindText(button('btn ghost', () => input.click()), 'add.chooseFile');
        const input = el('input');
        Object.assign(input, { type: 'file', accept: '.m3u,.m3u8,.txt,audio/x-mpegurl,application/vnd.apple.mpegurl,*/*', hidden: true });
        input.addEventListener('change', () => {
          file = input.files?.[0] ?? null;
          picked.textContent = file ? file.name : t('add.noFile');
        });
        nodes.push(choose, input, picked);
      }
      nodes.push(name.node, typeRow);
    }
    body.replaceChildren(...nodes);
  };

  const submit = async () => {
    error.textContent = '';
    try {
      if (mode === 'channel') {
        if (!isUrl(url.input.value.trim()) && !/^(rtmp|rtsp|udp):\/\//i.test(url.input.value.trim())) return (error.textContent = t('add.badUrl'));
        addChannel({
          name: name.input.value.trim() || t('add.unnamed'),
          url: url.input.value.trim(),
          group: group.input.value.trim() || t('add.myGroup'),
        });
        toast(t('add.channelDone'));
        closeModal();
        return;
      }
      if (mode === 'playlist') {
        const link = url.input.value.trim();
        if (!isUrl(link)) return (error.textContent = t('add.badUrl'));
        let host = link;
        try {
          host = new URL(link).host;
        } catch {
          /* оставляем ссылку как имя */
        }
        const source = addSource({ name: name.input.value.trim() || host, url: link, type: typeSelect.value });
        toast(t('add.done'));
        closeModal();
        return openSourceNow(source);
      }
      if (!file) return (error.textContent = t('add.badFile'));
      const text = await readFile(file);
      if (!parseM3u(text).length) return (error.textContent = t('add.emptyFile'));
      const source = addSource({ name: name.input.value.trim() || file.name, url: '', type: typeSelect.value, file: true });
      await saveFileSource(source.id, text);
      toast(t('add.done'));
      closeModal();
      openSourceNow(source);
    } catch {
      error.textContent = t('add.failed');
    }
  };

  const seg = createSegmented(
    [
      { id: 'playlist', labelKey: 'add.modePlaylist' },
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
