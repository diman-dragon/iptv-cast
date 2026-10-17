import { App } from '@capacitor/app';
import { getView, setView } from '../iptv/view-state.js';
import { closeModal, isModalOpen } from '../ui/modal.js';
import { HOME, getScreen, goHome } from './router.js';

// Системная «Назад»: окно → из списка каналов в библиотеку → с любого экрана в библиотеку.
// В самой библиотеке ничего не происходит, приложение остаётся открытым.
export function initBack() {
  App.addListener('backButton', () => {
    if (isModalOpen()) return closeModal();
    if (getScreen() === HOME && getView().sourceId) return setView({ sourceId: null });
    if (getScreen() !== HOME) goHome();
  });
}
