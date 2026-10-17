import { button, icon } from '../core/dom.js';
import { bindAria } from '../i18n/bind.js';
import { SCREENS } from '../screens/index.js';
import { getPlayback, onPlayback, pickTv } from '../iptv/playback.js';
import { ICONS } from '../ui/icons.js';
import { createHeader } from '../ui/header.js';
import { createHost } from '../ui/screen-host.js';
import { createTabbar } from '../ui/tabbar.js';
import { toast } from '../ui/toast.js';
import { t } from '../i18n/i18n.js';
import { getScreen, navigate, onNavigate } from './router.js';
import { initSwipe } from './swipe.js';

const indexOf = (id) => SCREENS.findIndex((s) => s.id === id);

// Кнопка Cast в шапке: видна на всех экранах, горит, когда ТВ подключён.
function createCastButton() {
  const btn = button('cast-btn', () => pickTv().catch(() => toast(t('cast.unavailable'))));
  btn.append(icon(ICONS.cast));
  bindAria(btn, 'ch.cast');
  const label = document.createElement('span');
  label.className = 'cast-name';
  btn.append(label);
  const mark = () => {
    const { cast } = getPlayback();
    btn.classList.toggle('on', cast.connected);
    label.textContent = cast.connected ? cast.device : '';
  };
  onPlayback(mark);
  mark();
  return btn;
}

// Собирает оболочку: шапка + экраны + нижние вкладки + свайпы.
export function mountApp(root) {
  const header = createHeader();
  header.actions.append(createCastButton());
  const host = createHost(SCREENS);
  const tabs = createTabbar(SCREENS, navigate);
  root.append(header.node, host.node, tabs.node);

  let prev = indexOf(getScreen());
  const apply = (id) => {
    const i = indexOf(id);
    header.setTitle(SCREENS[i].key);
    host.show(id, i - prev);
    tabs.setActive(id);
    prev = i;
  };

  onNavigate(apply);
  apply(getScreen());

  initSwipe(host.node, (step) => {
    const next = SCREENS[indexOf(getScreen()) + step];
    if (next) navigate(next.id);
  });
}
