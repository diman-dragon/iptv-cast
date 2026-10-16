const MIN_DIST = 60; // минимальная длина свайпа, px
const RATIO = 1.5; // горизонталь должна явно побеждать вертикаль
const EDGE = 24; // у краёв экрана живут системные жесты — не трогаем

// Горизонтальный свайп: влево → onSwipe(+1), вправо → onSwipe(-1).
export function initSwipe(node, onSwipe) {
  let startX = 0;
  let startY = 0;
  let blocked = false; // свайп начался внутри своей прокрутки (страницы настроек): вкладки не переключаем

  node.addEventListener(
    'touchstart',
    (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      blocked = Boolean(e.target.closest?.('[data-noswipe]'));
    },
    { passive: true },
  );

  node.addEventListener(
    'touchend',
    (e) => {
      if (blocked) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const nearEdge = startX < EDGE || startX > window.innerWidth - EDGE;
      if (nearEdge || Math.abs(dx) < MIN_DIST || Math.abs(dx) < Math.abs(dy) * RATIO) return;
      onSwipe(dx < 0 ? 1 : -1);
    },
    { passive: true },
  );
}
