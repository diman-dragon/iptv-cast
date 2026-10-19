import { el, button } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { openAddDialog } from '../dialogs/add.js';
import { clearHistory, customSources, getPref, removeAllSources, setPref } from '../iptv/store.js';
import { diagnose, dropSourceData } from '../iptv/playlist.js';
import { syncTvOptions } from '../iptv/playback.js';
import { diagnoseTv } from '../iptv/tv-diag.js';
import { createAboutCard } from '../ui/about-card.js';
import { createField } from '../ui/field.js';
import { createLangSwitch } from '../ui/lang-switch.js';
import { closeModal, openModal } from '../ui/modal.js';
import { createRow } from '../ui/setting-row.js';
import { createSwitch } from '../ui/switch.js';
import { createThemeSwitch } from '../ui/theme-switch.js';
import { toast } from '../ui/toast.js';

function uaRow() {
  const field = createField('set.ua', { hintKey: 'set.uaHint', placeholderKey: 'set.uaPh', value: getPref('ua') });
  field.input.addEventListener('change', () => setPref('ua', field.input.value.trim()));
  return field.node;
}

// Данные: загрузка плейлистов, очистка истории, удаление плейлистов, проверка подключения и диагностика ТВ.
function dataBlock() {
  const box = el('div', 'data-block');
  const diag = el('pre', 'diag');
  diag.hidden = true;
  const run = async (job) => {
    diag.hidden = false;
    diag.textContent = t('set.diagRunning');
    diag.textContent = (await job()).join('\n');
  };

  const confirmRemoveAll = () => {
    const n = customSources().length;
    if (!n) return toast(t('set.nothingToRemove'));
    const row = el('div', 'modal-actions');
    row.append(
      bindText(button('btn ghost', closeModal), 'lib.cancel'),
      bindText(
        button('btn danger', async () => {
          await Promise.all(customSources().map((x) => dropSourceData(x.id)));
          removeAllSources();
          closeModal();
          toast(t('cat.removed'));
        }),
        'set.removeAll',
      ),
    );
    openModal(t('set.removeAllConfirm', { n }), [row]);
  };

  const actions = el('div', 'data-actions');
  actions.append(
    bindText(button('btn', openAddDialog), 'set.loadLists'),
    bindText(button('btn ghost', () => {
      clearHistory();
      toast(t('set.historyCleared'));
    }), 'set.clearHistory'),
    bindText(button('btn ghost', confirmRemoveAll), 'set.removeAll'),
    bindText(button('btn ghost', () => run(diagnose)), 'set.diag'),
    bindText(button('btn ghost', () => run(diagnoseTv)), 'tv.diag'),
  );
  box.append(actions, diag);
  return box;
}

// Разделы настроек по смыслу. build() собирает содержимое страницы.
export const PAGES = [
  {
    id: 'interface',
    titleKey: 'set.sectionInterface',
    build: () => [createRow('set.theme', createThemeSwitch()), createRow('set.language', createLangSwitch())],
  },
  {
    id: 'playback',
    titleKey: 'set.sectionPlayback',
    build: () => [
      createRow('set.preferCast', createSwitch(() => getPref('preferCast'), (v) => setPref('preferCast', v))),
      createRow('set.castProxy', createSwitch(() => getPref('castProxy'), (v) => { setPref('castProxy', v); syncTvOptions(); })),
      createRow('set.dlnaProxy', createSwitch(() => getPref('dlnaProxy'), (v) => { setPref('dlnaProxy', v); syncTvOptions(); })),
      uaRow(),
    ],
  },
  { id: 'data', titleKey: 'set.sectionData', build: () => [dataBlock()] },
  { id: 'about', titleKey: 'set.sectionAbout', build: () => [createAboutCard()] },
];
