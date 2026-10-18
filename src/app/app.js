import { SCREENS } from '../screens/index.js';
import { createHeader } from '../ui/header.js';
import { createHost } from '../ui/screen-host.js';
import { createTabbar } from '../ui/tabbar.js';
import { getScreen, navigate, onNavigate } from './router.js';
import { initSwipe } from './swipe.js';

const indexOf = (id) => SCREENS.findIndex((s) => s.id === id);

// Собирает оболочку: шапка + экраны + нижние вкладки + свайпы.
export function mountApp(root) {
  const header = createHeader();
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
