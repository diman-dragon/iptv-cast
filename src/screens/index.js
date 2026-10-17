import { ICONS } from '../ui/icons.js';
import { renderCatalog } from './catalog.js';
import { renderNow } from './now.js';
import { renderSettings } from './settings.js';

// Единый реестр экранов: из него строятся вкладки и заголовок.
// key — ключ перевода названия. Порядок = порядок вкладок = порядок свайпов.
export const SCREENS = [
  { id: 'catalog', icon: ICONS.catalog, key: 'nav.catalog', render: renderCatalog },
  { id: 'player', icon: ICONS.now, key: 'nav.player', render: renderNow },
  { id: 'settings', icon: ICONS.settings, key: 'nav.settings', render: renderSettings },
];
