import './styles/index.css';
import { initLanguage } from './i18n/language.js';
import { initTheme } from './theme/theme.js';
import { mountApp } from './app/app.js';
import { initBack } from './app/back.js';
import { initPlayback } from './iptv/playback.js';

initLanguage();
initTheme();
mountApp(document.getElementById('app'));
initBack();
initPlayback();
