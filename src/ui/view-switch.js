import { createSegmented } from './segmented.js';
import { ICONS } from './icons.js';

// Переключатель «строки / карточки» — пиктограммы вместо подписей. pref — ключ настройки.
export function createViewSwitch(get, set) {
  return createSegmented(
    [
      { id: 'list', icon: ICONS.list, ariaKey: 'view.list' },
      { id: 'cards', icon: ICONS.cards, ariaKey: 'view.cards' },
    ],
    get,
    set,
  );
}
