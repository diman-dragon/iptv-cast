import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'https://localhost/', pretendToBeVisual: true });
const w = dom.window; w.open = () => {};
// у stage есть размеры, как на экране телефона
w.Element.prototype.getBoundingClientRect = function () { return this.classList?.contains('stage') ? { left: 16, top: 120, width: 360, height: 203, right: 376, bottom: 323 } : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; };
Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Option: w.Option, Event: w.Event, AbortController: w.AbortController, matchMedia: () => ({ matches: true }), __APP_VERSION__: '0.4.2', requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout });
w.matchMedia = globalThis.matchMedia;
globalThis.fetch = async (u) => (String(u).endsWith('/a.m3u') ? new Response('#EXTM3U\n#EXTINF:-1 group-title="G",One\nhttp://a/1.m3u8\n#EXTINF:-1 group-title="G",Two\nhttp://a/2.m3u8\n#EXTINF:-1 group-title="G",Three\nhttp://a/3.m3u8\n') : new Response('no', { status: 404 }));
const errs = []; process.on('unhandledRejection', (e) => errs.push('REJ ' + e));
const root = '/home/claude/proj/iptv-cast/src/';
const { initLanguage } = await import(root + 'i18n/language.js'); const { initTheme } = await import(root + 'theme/theme.js');
const { mountApp } = await import(root + 'app/app.js'); const { navigate, getScreen } = await import(root + 'app/router.js');
const { Iptv } = await import(root + 'iptv/native.js');
const pb = await import(root + 'iptv/playback.js'); const store = await import(root + 'iptv/store.js');
const embed = []; const sleeps = []; const zaps = []; const plays = []; const tvp = [];
Iptv.embedShow = async (r) => embed.push(['show', r]); Iptv.embedHide = async () => embed.push(['hide']);
const nativeState = { loaded: true, playing: true, loading: false, url: 'http://a/1.m3u8', title: 'Chan One', hasPrev: false, hasNext: true };
Iptv.sleep = async ({ minutes }) => { sleeps.push(minutes); return { ...nativeState, sleepLeft: minutes * 60 }; };
Iptv.zap = async ({ step }) => { zaps.push(step); return { moved: true, playing: true, loaded: true, url: 'http://a/2.m3u8', title: 'Two', hasPrev: true, hasNext: true }; };
Iptv.play = async (a) => { plays.push(a); return {}; };
Iptv.stop = async () => ({ loaded: false });
Iptv.tvPicker = async (a) => { tvp.push(a); };
initLanguage(); initTheme(); mountApp(document.getElementById('app')); await pb.initPlayback();
const q = (s) => [...document.querySelectorAll(s)]; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const btn = (re, scope = document) => [...scope.querySelectorAll('button')].find((b) => re.test(b.textContent));
let fails = 0; const ok = (n, c, i = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + i)); if (!c) fails++; };

// ---------- Библиотека: «Мои» сверху → поиск + проверка → библиотека; кнопки «Загрузить» нет
const lib = q('.catalog')[0].children[0];
ok('library order: Mine buttons, then search+check, then chips/list', [...lib.children].map((n) => n.className.split(' ')[0]).slice(0, 3).join() === 'mine-row,cat-top,chips', [...lib.children].map((n) => n.className));
ok('Mine row = Favorites, History, My channels', q('.mine-btn').map((b) => b.querySelector('.mine-name').textContent).join() === 'Favorites,History,My channels');
ok('no "Load" button in the Library', !q('.catalog button').some((b) => /^Load$/.test(b.textContent)));
ok('no "Mine" chip among genre chips', !q('.chips .chip').some((c) => /Mine/.test(c.textContent)));
ok('empty library points to Settings', /Open settings/.test(q('.catalog .empty')[0]?.textContent ?? ''));
ok('check button hidden while there are no playlists', q('.check-btn')[0].hidden);

// ---------- Настройки → Данные: пять кнопок; загрузка ведёт в библиотеку
navigate('settings'); await wait(80);
const data = q('.data-actions')[0];
ok('Settings > Data has the 5 buttons in order', [...data.children].map((b) => b.textContent).join('|') === 'Load playlists|Clear history|Delete all playlists|Check connections|TV diagnostics', [...data.children].map((b) => b.textContent));
btn(/^Load playlists$/, data).click(); await wait(40);
const url = q('.modal input[type=url]')[0]; url.value = 'https://t.test/a.m3u';
btn(/^Add$/, q('.modal')[0]).click(); await wait(500);
ok('after loading a playlist the app goes to the Library', getScreen() === 'library' && store.customSources().length === 1, getScreen());
ok('check button appears, playlist shows in the Library (opened inside)', q('.channels .item').length === 3);
// назад к списку
const { setView } = await import(root + 'iptv/view-state.js'); setView({ sourceId: null }); await wait(50);
ok('Library lists the playlist with check button visible', q('.src').length === 1 && !q('.check-btn')[0].hidden);
btn(/^Clear history$/, (navigate('settings'), q('.data-actions')[0])); 

// ---------- Вкладка «Плеер»: окно + ряд кнопок
const ch = { name: 'Chan One', url: 'http://a/1.m3u8', group: 'G', logo: '' };
const list = [ch, { name: 'Two', url: 'http://a/2.m3u8', group: 'G', logo: '' }, { name: 'Three', url: 'http://a/3.m3u8', group: 'G', logo: '' }];
navigate('player'); await wait(60);
ok('empty player: only the window and the button row (no history, no cards)', q('.player')[0].children.length === 2 && q('.stage').length === 1 && q('.pc-row .pc').length === 5 && /Nothing is playing/.test(q('.stage-ph')[0].textContent));
ok('buttons disabled with nothing selected', q('.pc')[2].disabled && q('.pc')[4].disabled);
await pb.playChannel(ch, list, { open: false }); await wait(60);
ok('start from the tab plays in the window (video:false) with the list as queue', plays.at(-1).video === false && plays.at(-1).queue.length === 3 && plays.at(-1).index === 0, plays.at(-1));
// имитируем состояние «играет» из нативной части
const { Iptv: I2 } = await import(root + 'iptv/native.js');
pb.getPlayback().playing = true; pb.getPlayback().hasNext = true; pb.getPlayback().hasPrev = false; pb.getPlayback().sleepDeadline = 0;
document.dispatchEvent(new w.Event('langchange')); await wait(300);
const shows = embed.filter((e) => e[0] === 'show');
ok('native video is placed exactly over the window rect (CSS px)', shows.length >= 1 && shows.at(-1)[1].x === 16 && shows.at(-1)[1].y === 120 && shows.at(-1)[1].w === 360 && shows.at(-1)[1].h === 203, shows.at(-1));
ok('play button shows STOP while playing; prev disabled, next enabled', q('.pc')[2].getAttribute('aria-label') === 'Stop' && q('.pc')[1].disabled && !q('.pc')[3].disabled, [q('.pc')[2].getAttribute('aria-label'), q('.pc')[1].disabled, q('.pc')[3].disabled]);
// сон: подменю выдвигается, значения, видео прячется на время
q('.pc')[0].click(); await wait(300);
ok('sleep: submenu opens with 5 values', !q('.pc-pop')[0].hidden && q('.pc-chip').map((c) => c.textContent).join() === 'Off,15′,30′,60′,90′', q('.pc-chip').map((c) => c.textContent));
ok('native video steps aside while the submenu is open', embed.at(-1)[0] === 'hide', embed.at(-1));
q('.pc-chip')[2].click(); await wait(300);
ok('choosing 30 sets the timer and closes the submenu', sleeps.at(-1) === 30 && q('.pc-pop')[0].hidden, sleeps);
ok('video comes back after the submenu closes', embed.at(-1)[0] === 'show', embed.at(-1));
// следующий / стоп
q('.pc')[3].click(); await wait(60); ok('next goes through the native queue', zaps.at(-1) === 1, zaps);
q('.pc')[2].click(); await wait(60); ok('stop keeps the channel selected', pb.getPlayback().channel !== null && pb.getPlayback().onTv === false);
pb.getPlayback().playing = false; document.dispatchEvent(new w.Event('langchange')); await wait(300);
ok('after stop the window shows the stopped hint and the video is hidden', /Press ▶/.test(q('.stage-ph')[0].textContent) && embed.at(-1)[0] === 'hide', q('.stage-ph')[0].textContent);
q('.pc')[3].click(); await wait(60);
ok('next while stopped starts the neighbour in the window (no full screen)', plays.at(-1).video === false && plays.at(-1).url === 'http://a/3.m3u8', plays.at(-1));
q('.pc')[4].click(); await wait(60);
ok('TV button opens the native TV picker with the current channel', tvp.length === 1 && tvp[0].url === 'http://a/3.m3u8' && tvp[0].active === false, tvp);
// уйти с вкладки — видео убирается
pb.getPlayback().playing = true; document.dispatchEvent(new w.Event('langchange')); await wait(250);
navigate('library'); await wait(300);
ok('leaving the Player tab hides the native video', embed.at(-1)[0] === 'hide', embed.at(-1));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED', '| errors:', errs);
process.exit(fails ? 1 : 0);
