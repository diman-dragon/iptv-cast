import { el, button } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { saveLocalChannel } from '../iptv/store.js';
import { createField } from '../ui/field.js';
import { closeModal, openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

export const isStreamUrl = (s) => /^(https?|rtmp|rtsp|udp):\/\/\S+$/i.test(s);

// Канал своего плейлиста: создать (channel не задан) или изменить.
export function openChannelDialog(playlistId, channel) {
  const name = createField('add.name', { placeholderKey: 'add.nameChannelPh', value: channel?.name ?? '' });
  const url = createField('add.url', { placeholderKey: 'add.urlPh', type: 'url', value: channel?.url ?? '' });
  const group = createField('add.group', { placeholderKey: 'add.groupPh', value: channel?.group ?? '' });
  const logo = createField('edit.logo', { placeholderKey: 'add.urlPh', type: 'url', value: channel?.logo ?? '' });
  const error = el('div', 'form-error');

  const save = () => {
    const link = url.input.value.trim();
    if (!isStreamUrl(link)) return (error.textContent = t('add.badUrl'));
    saveLocalChannel(
      playlistId,
      { name: name.input.value.trim() || t('add.unnamed'), url: link, group: group.input.value.trim() || t('add.myGroup'), logo: logo.input.value.trim() },
      channel?.url,
    );
    closeModal();
    toast(t('ch.saved'));
  };

  const actions = el('div', 'modal-actions');
  actions.append(bindText(button('btn ghost', closeModal), 'lib.cancel'), bindText(button('btn', save), 'edit.save'));
  const form = el('div', 'form');
  form.append(name.node, url.node, group.node, logo.node, error);
  openModal(t(channel ? 'ch.editTitle' : 'ch.newTitle'), [form, actions]);
}
