import { App } from '@capacitor/app';
import { getView, setView } from '../iptv/view-state.js';
import { closeModal, isModalOpen } from '../ui/modal.js';
import { HOME, getScreen, goHome } from './router.js';

// Системная «Назад»: окно → из списка каналов в библиотеку → с любого экрана в библиотеку →
// в самой библиотеке приложение сворачивается (как в обычных приложениях; фоновой службы нет, канал встаёт на паузу).
export function initBack() {
  App.addListener('backButton', () => {
    if (isModalOpen()) return closeModal();
    if (getScreen() === HOME && getView().sourceId) return setView({ sourceId: null });
    if (getScreen() !== HOME) return goHome();
    App.minimizeApp().catch(() => {});
  });
}
