import { App } from '@capacitor/app';
import { closeModal, isModalOpen } from '../ui/modal.js';
import { closeSheet, isSheetOpen } from '../ui/sheet.js';
import { HOME, getScreen, goHome } from './router.js';

// Системная «Назад»: сначала закрывает открытое окно или меню; потом с любого экрана — в каталог.
// В каталоге ничего не происходит, приложение остаётся открытым.
export function initBack() {
  App.addListener('backButton', () => {
    if (isModalOpen()) return closeModal();
    if (isSheetOpen()) return closeSheet();
    if (getScreen() !== HOME) goHome();
  });
}
