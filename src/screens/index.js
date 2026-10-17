import { ICONS } from '../ui/icons.js';
import { renderLibrary } from './library.js';
import { renderNow } from './now.js';
import { renderSettings } from './settings.js';

// Единый реестр экранов: из него строятся вкладки и заголовок.
// key — ключ перевода названия. Порядок = порядок вкладок = порядок свайпов.
export const SCREENS = [
  { id: 'library', icon: ICONS.library, key: 'nav.library', render: renderLibrary },
  { id: 'player', icon: ICONS.now, key: 'nav.player', render: renderNow },
  { id: 'settings', icon: ICONS.settings, key: 'nav.settings', render: renderSettings },
];
