import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'https://localhost/', pretendToBeVisual: true });
const w = dom.window; w.open = () => {};
Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Option: w.Option, Event: w.Event, AbortController: w.AbortController, matchMedia: () => ({ matches: true }), __APP_VERSION__: 'x', requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout });
w.matchMedia = globalThis.matchMedia;
const M3U = (kind) => `#EXTM3U\n${[1, 2, 3, 4, 5].map((i) => `#EXTINF:-1 group-title="G",Chan ${kind}${i}\nhttp://${kind}.example/${kind}${i}.m3u8\n`).join('')}`;
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.endsWith('/a.m3u')) return new Response(M3U('alive'));
  if (u.endsWith('/b.m3u')) return new Response(M3U('dead'));
  return new Response('nope', { status: 404 });
};
const errs = []; process.on('unhandledRejection', (e) => errs.push('REJ ' + e));
const root = '/home/claude/proj/iptv-cast/src/';
const { initLanguage } = await import(root + 'i18n/language.js'); const { initTheme } = await import(root + 'theme/theme.js');
const { mountApp } = await import(root + 'app/app.js'); const { navigate } = await import(root + 'app/router.js');
const { Iptv } = await import(root + 'iptv/native.js');
const { initPlayback, castChannel, togglePlay, getPlayback } = await import(root + 'iptv/playback.js');
const store = await import(root + 'iptv/store.js');
const probed = [], dlna = [];
Iptv.probe = async ({ url }) => { probed.push(url); return url.includes('alive') ? { ok: true, reason: 'ok' } : { ok: false, reason: 'timeout' }; };
Iptv.dlnaScan = async () => ({ devices: [{ name: 'Living Room TV', location: 'http://tv/d.xml', controlUrl: 'http://tv/ctl', serviceType: 'urn:x:AVTransport:1' }] });
Iptv.dlnaPlay = async (a) => { dlna.push(['play', a.url, a.proxy]); };
Iptv.dlnaControl = async (a) => { dlna.push([a.action]); };
initLanguage(); initTheme(); mountApp(document.getElementById('app')); await initPlayback();
const q = (s) => [...document.querySelectorAll(s)]; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const btn = (re, scope = document) => [...scope.querySelectorAll('button')].find((b) => re.test(b.textContent) || re.test(b.getAttribute('aria-label') || ''));
let fails = 0; const ok = (n, c, i = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + i)); if (!c) fails++; };

// ---------- подготовка: один плейлист с результатом проверки
store.addSources([{ name: 'Alpha', url: 'https://t.test/a.m3u', type: 'sport' }]);
store.setCheck(store.customSources()[0].id, { total: 5, alive: 4, removed: 1, offline: false });
await wait(50);
// ---------- CRUD плейлистов
const alpha = store.customSources()[0];
const card = () => q('.src').find((n) => /Alpha|Renamed/.test(n.textContent));
ok('Alpha card shows check badge', /4 working/.test(card().textContent), card().textContent);
btn(/^Edit playlist$/, card()).click(); await wait(30);
const nameInput = q('.modal input')[0]; nameInput.value = 'Renamed'; 
q('.modal select')[0].value = 'music';
btn(/^Save$/).click(); await wait(100);
ok('edit playlist: name+genre updated', store.customSources()[0].name === 'Renamed' && store.customSources()[0].type === 'music');
// смена адреса сбрасывает результат проверки
btn(/^Edit playlist$/, card()).click(); await wait(30);
q('.modal input[type=url]')[0].value = 'https://t.test/a2.m3u'; btn(/^Save$/).click(); await wait(100);
ok('url change clears old check result', store.getChecks()[alpha.id] === undefined && store.customSources()[0].url.endsWith('a2.m3u'));
// создать свой плейлист
(await import(root + 'dialogs/add.js')).openAddDialog(); await wait(30);
btn(/^New$/).click(); await wait(30);
q('.modal input')[0].value = 'My list'; btn(/^Add$/).click(); await wait(200);
const mine = store.customSources().find((s) => s.name === 'My list');
ok('create local playlist', mine?.local === true);
ok('opened inside library with "add channel" button', q('.channels .icon-btn').some((b) => b.getAttribute('aria-label') === 'Add channel' && !b.hidden));
btn(/^Add channel$/).click(); await wait(30);
const ins = q('.modal input'); ins[0].value = 'News One'; ins[1].value = 'http://x/one.m3u8'; btn(/^Save$/).click(); await wait(100);
ok('create channel in local playlist', store.localChannels(mine.id).length === 1 && q('.channels .item').length === 1);
btn(/^Edit channel$/, q('.channels .item')[0]).click(); await wait(30);
q('.modal input')[0].value = 'News Two'; btn(/^Save$/).click(); await wait(100);
ok('edit channel', store.localChannels(mine.id)[0].name === 'News Two' && /News Two/.test(q('.channels .item')[0].textContent), store.localChannels(mine.id));
btn(/^Delete channel$/, q('.channels .item')[0]).click(); await wait(100);
ok('delete channel', store.localChannels(mine.id).length === 0 && q('.channels .item').length === 0);
// удалить плейлист с подтверждением
btn(/^Back$|My list/, q('.channels')[0])?.click(); await wait(50);
const myCard = q('.src').find((n) => /My list/.test(n.textContent));
btn(/^Delete$/, myCard).click(); await wait(30);
btn(/^Delete$/, q('.modal')[0]).click(); await wait(100);
ok('delete playlist (confirm) removes it and its data', !store.customSources().some((s) => s.id === mine.id));

// ---------- ТВ: кнопка только в окне плеера (нативной), в вебе её нигде нет
const { applyTvStarted, playChannel, syncTvOptions } = await import(root + 'iptv/playback.js');
ok('no cast button in header', q('.cast-btn').length === 0);
navigate('library'); await wait(50);
const adhoc = { name: 'Chan X', url: 'http://x/y.m3u8', group: 'g', logo: '' };
store.saveLocalChannel('mine-channels', adhoc);
const { setView } = await import(root + 'iptv/view-state.js');
setView({ sourceId: 'mine-channels' }); await wait(200);
ok('channel rows have no "Show on TV" button', !q('.channels .item .row-btn').some((b) => /TV/i.test(b.getAttribute('aria-label') || '')), q('.channels .item .row-btn').map((b) => b.getAttribute('aria-label')));
setView({ sourceId: null });
const played = [], opts = [];
Iptv.play = async (a) => { played.push(a); return {}; };
Iptv.setTvOptions = async (o) => { opts.push(o); };
syncTvOptions(); ok('TV options are handed to the native side', opts.length === 1 && opts[0].castProxy === true && opts[0].dlnaProxy === false, opts);

// канал ушёл на ТВ из окна плеера: нативная часть сообщает событием tvStarted
applyTvStarted({ kind: 'dlna', name: 'Living Room TV', location: 'http://tv/d.xml', controlUrl: 'http://tv/ctl', serviceType: 'urn:x:AVTransport:1', title: 'Chan X', url: adhoc.url, sub: 'g', logo: '' });
ok('state: on TV, TV playing, phone not playing', getPlayback().onTv && getPlayback().tvPlaying && !getPlayback().playing && getPlayback().dlna?.name === 'Living Room TV');
navigate('player'); await wait(50);
ok('player tab: placeholder says it plays on the TV', /Playing on TV: Living Room TV/.test(q('.stage-ph')[0].textContent), q('.stage-ph')[0].textContent);
ok('player tab: TV button lit, no old history/TV panel', q('.pc')[4].classList.contains('on') && !q('.tv-panel').length && !q('.player .lib-items').length);
const { startStop } = await import(root + 'iptv/playback.js');
await startStop(); ok('Stop on TV sends stop and keeps the channel', dlna.at(-1)[0] === 'stop' && getPlayback().tvPlaying === false && getPlayback().channel.url === adhoc.url, dlna.at(-1));
await startStop(); ok('Start on TV sends the channel again', dlna.at(-1)[0] === 'play' && dlna.at(-1)[1] === adhoc.url && getPlayback().tvPlaying === true, dlna.at(-1));
// пока ТВ подключён, нажатие на канал сразу идёт на ТВ, а на телефоне ничего не открывается
const next = { name: 'Chan Z', url: 'http://x/z.m3u8', group: 'g', logo: '' };
await playChannel(next, [adhoc, next]); await wait(30);
ok('tap while TV connected: sent to the TV, nothing played on the phone', dlna.at(-1)[0] === 'play' && dlna.at(-1)[1] === next.url && dlna.at(-1)[2] === false && played.length === 0, [dlna.at(-1), played.length]);
// ошибка ТВ видна
Iptv.dlnaPlay = async () => { throw new Error('UPnP SetAVTransportURI: HTTP 701'); };
await playChannel({ ...next, url: 'http://x/bad.m3u8' }); await wait(50);
ok('TV failure shows toast + status', !!q('.toast')[0] && getPlayback().tvError.includes('701'), q('.toast')[0]?.textContent);
ok('player tab shows TV failure in the window', /The TV could not play/.test(q('.stage-ph')[0]?.textContent), q('.stage-ph')[0]?.textContent);
// канал с особым User-Agent идёт через телефон-прокси
Iptv.dlnaPlay = async (a) => { dlna.push(['play', a.url, a.proxy]); };
await playChannel({ ...next, url: 'http://x/ua.m3u8', ua: 'X' }); await wait(30);
ok('DLNA stream needing a User-Agent goes through the phone proxy', dlna.at(-1)[2] === true, dlna.at(-1));
// отключить ТВ → снова воспроизведение на телефоне (окно плеера открывается)
const { disconnectTv } = await import(root + 'iptv/playback.js');
await disconnectTv(); await wait(30);
ok('disconnect: DLNA stop sent, TV forgotten', dlna.at(-1)[0] === 'stop' && getPlayback().dlna === null && getPlayback().onTv === false, dlna.at(-1));
await playChannel(next, [adhoc, next]); await wait(30);
ok('after disconnect a tap plays on the phone and opens the video window', played.length === 1 && played[0].video === true && played[0].url === next.url, played);
console.log(fails ? fails + ' FAILED' : 'ALL PASSED', '| errors:', errs);
process.exit(fails ? 1 : 0);
