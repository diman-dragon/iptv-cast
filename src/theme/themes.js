// Две темы: светлая и тёмная (AMOLED). bg — цвет фона для системных панелей.
export const THEMES = [
  { id: 'light', labelKey: 'theme.light', bg: '#eef2f8', light: true },
  { id: 'dark', labelKey: 'theme.dark', bg: '#000000', light: false },
];

export const findTheme = (id) => THEMES.find((t) => t.id === id) ?? THEMES[1];

// Пока пользователь тему не выбирал — следуем теме системы.
export const systemTheme = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
