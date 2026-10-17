import { el, button } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { kvClear } from '../core/kv.js';
import { clearHistory, customSources, favorites, getPref, history, onStoreChange, removeSource, setPref } from '../iptv/store.js';
import { clearMemory, diagnose, dropSourceData } from '../iptv/playlist.js';
import { createAboutCard } from '../ui/about-card.js';
import { createField } from '../ui/field.js';
import { createLangSwitch } from '../ui/lang-switch.js';
import { createRow } from '../ui/setting-row.js';
import { createSwitch } from '../ui/switch.js';
import { createThemeSwitch } from '../ui/theme-switch.js';
import { toast } from '../ui/toast.js';

function uaRow() {
  const field = createField('set.ua', { hintKey: 'set.uaHint', placeholderKey: 'set.uaPh', value: getPref('ua') });
  field.input.addEventListener('change', () => setPref('ua', field.input.value.trim()));
  return field.node;
}

function dataBlock() {
  const box = el('div', 'data-block');
  const stats = el('div', 'muted small');
  const list = el('div', 'my-list');
  const draw = () => {
    stats.textContent = t('set.stats', { s: customSources().length, f: favorites().length, h: history().length });
    list.replaceChildren(
      ...customSources().map((s) => {
        const row = el('div', 'row');
        const name = el('span', 'my-name', s.name);
        const del = bindText(button('btn ghost sm', async () => {
          await dropSourceData(s.id);
          removeSource(s.id);
        }), 'cat.remove');
        row.append(name, del);
        return row;
      }),
    );
  };
  const actions = el('div', 'row-actions');
  actions.append(
    bindText(button('btn ghost', async () => {
      clearMemory();
      await kvClear();
      toast(t('set.cacheCleared'));
    }), 'set.clearCache'),
    bindText(button('btn ghost', () => {
      clearHistory();
      toast(t('set.historyCleared'));
    }), 'set.clearHistory'),
  );
  const diag = el('pre', 'diag');
  diag.hidden = true;
  actions.append(
    bindText(button('btn ghost', async () => {
      diag.hidden = false;
      diag.textContent = t('set.diagRunning');
      diag.textContent = (await diagnose()).join('\n');
    }), 'set.diag'),
  );
  box.append(bindText(el('h3', 'section-title'), 'set.mySources'), list, stats, actions, diag);
  onStoreChange(draw);
  document.addEventListener('langchange', draw);
  draw();
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
      uaRow(),
    ],
  },
  { id: 'data', titleKey: 'set.sectionData', build: () => [dataBlock()] },
  { id: 'about', titleKey: 'set.sectionAbout', build: () => [createAboutCard()] },
];
