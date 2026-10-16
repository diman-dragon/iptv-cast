import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

// Подгоняет системные панели Android и цвет вкладки браузера под тему.
export function syncSystemBars(theme) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
  if (!Capacitor.isNativePlatform()) return;
  // Dark = светлые значки на тёмном фоне, Light = тёмные значки на светлом.
  SystemBars.setStyle({ style: theme.light ? SystemBarsStyle.Light : SystemBarsStyle.Dark });
}
