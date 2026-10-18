import { el, button } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { TYPES } from '../data/types.js';
import { clearMemory, dropSourceData } from '../iptv/playlist.js';
import { descOf, nameOf } from '../iptv/sources.js';
import { clearCheck, updateSource } from '../iptv/store.js';
import { createField, createSelect } from '../ui/field.js';
import { closeModal, openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

// Первый символ-эмодзи целиком (с модификаторами), а не половинка суррогатной пары.
const firstSymbol = (text) => {
  const s = text.trim();
  if (!s) return '';
  return typeof Intl?.Segmenter === 'function' ? ([...new Intl.Segmenter().segment(s)][0]?.segment ?? '') : [...s][0];
};

// Правка плейлиста: название, значок, жанр, описание и (для ссылок) адрес.
export function openEditSource(source) {
  const remote = !source.file && !source.local;
  const name = createField('add.name', { value: nameOf(source) });
  const emoji = createField('edit.emoji', { value: source.emoji ?? '', hintKey: 'edit.emojiHint' });
  const desc = createField('edit.desc', { value: source.desc ? descOf(source) : '' });
  const url = createField('add.url', { type: 'url', value: source.url ?? '' });
  const typeRow = el('label', 'field');
  const typeSelect = createSelect(TYPES.filter((x) => x.id !== 'mine').map((x) => ({ id: x.id, label: `${x.emoji} ${t(x.key)}` })), source.type);
  typeRow.append(bindText(el('span', 'field-label'), 'add.type'), typeSelect);
  const error = el('div', 'form-error');

  const save = async () => {
    const link = url.input.value.trim();
    if (remote && !/^https?:\/\/\S+$/i.test(link)) return (error.textContent = t('add.badUrl'));
    const patch = {
      name: name.input.value.trim() || nameOf(source),
      emoji: firstSymbol(emoji.input.value) || source.emoji,
      type: typeSelect.value,
      desc: desc.input.value.trim() || undefined,
    };
    if (remote && link !== source.url) {
      patch.url = link;
      await dropSourceData(source.id); // другой адрес — старый кэш и результат проверки больше не годятся
      clearMemory();
      clearCheck(source.id);
    }
    updateSource(source.id, patch);
    closeModal();
    toast(t('edit.saved'));
  };

  const actions = el('div', 'modal-actions');
  actions.append(bindText(button('btn ghost', closeModal), 'lib.cancel'), bindText(button('btn', save), 'edit.save'));
  const kind = source.local ? 'edit.kindLocal' : source.file ? 'edit.kindFile' : 'edit.kindLink';
  const form = el('div', 'form');
  form.append(bindText(el('div', 'muted small'), kind), name.node, emoji.node, typeRow, desc.node, ...(remote ? [url.node] : []), error);
  openModal(t('edit.title'), [form, actions]);
}
