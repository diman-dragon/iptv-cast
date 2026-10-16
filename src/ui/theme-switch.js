import { THEMES } from '../theme/themes.js';
import { getTheme, setTheme } from '../theme/theme.js';
import { createSegmented } from './segmented.js';

const items = THEMES.map((th) => ({ id: th.id, labelKey: th.labelKey }));

export const createThemeSwitch = () => createSegmented(items, getTheme, setTheme);
