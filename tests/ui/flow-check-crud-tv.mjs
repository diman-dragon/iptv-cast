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

// ---------- проверка плейлистов
store.addSources([{ name: 'Alpha', url: 'https://t.test/a.m3u', type: 'sport' }, { name: 'Beta', url: 'https://t.test/b.m3u', type: 'news' }, { name: 'Gamma', url: 'https://t.test/c.m3u', type: 'movies' }]);
await wait(50);
ok('3 playlists in library', store.customSources().length === 3);
btn(/^Check$/).click(); await wait(1500);
ok('modal shows decision with 2 failed', /Valid: 1, not working: 2/.test(q('.chk-summary')[0]?.textContent), q('.chk-summary')[0]?.textContent);
ok('alive stream found -> Alpha valid (stops early)', probed.some((u) => u.includes('alive')));
ok('dead playlist reason shown', q('.chk-row .fsub').some((n) => /none of \d+ tested channels responds \(timeout\)/.test(n.textContent)), q('.chk-row .fsub').map((n) => n.textContent));
ok('unreachable playlist reason shown', q('.chk-row .fsub').some((n) => /Cannot be loaded/.test(n.textContent)));
ok('library cards got badges', store.getChecks()[store.customSources()[0].id]?.ok === true);
// Повторить Beta — всё ещё мёртв
const betaRow = q('.chk-row').find((r) => /Beta/.test(r.textContent));
btn(/^Retry$/, betaRow).click(); await wait(800);
ok('retry keeps dead playlist in the list', q('.chk-row').some((r) => /Beta/.test(r.textContent)));
// Удалить Gamma по одному
btn(/^Delete$/, q('.chk-row').find((r) => /Gamma/.test(r.textContent))).click(); await wait(100);
ok('single delete removes Gamma', !store.customSources().some((s) => s.name === 'Gamma') && store.customSources().length === 2);
// Удалить все нерабочие с подтверждением
btn(/Delete all not working/).click(); await wait(50);
ok('mass delete asks for confirmation', /Delete 1 playlists without a stream\?/.test(document.querySelector('.chk-confirm')?.textContent ?? ''), document.querySelector('.chk-confirm')?.textContent);
btn(/^Yes, delete$/).click(); await wait(150);
ok('after confirm only Alpha remains', store.customSources().length === 1 && store.customSources()[0].name === 'Alpha', store.customSources().map((s) => s.name));
ok('modal shows nothing left that fails', /nothing left/.test(q('.chk-summary')[0]?.textContent ?? ''), q('.chk-summary')[0]?.textContent);
btn(/^Done$/).click();

// ---------- CRUD плейлистов
const alpha = store.customSources()[0];
const card = () => q('.src').find((n) => /Alpha|Renamed/.test(n.textContent));
ok('Alpha card shows valid badge', /valid/.test(card().textContent), card().textContent);
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
btn(/^Load$/).click(); await wait(30);
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

// ---------- ТВ: DLNA
const ch = { name: 'Chan X', url: 'http://x/y.m3u8', group: 'g', logo: '' };
await castChannel(ch, [ch]); await wait(300);
ok('no TV selected -> TV dialog opens with DLNA device', q('.tv-row').some((r) => /Living Room TV/.test(r.textContent)), q('.modal').length);
q('.tv-row').find((r) => /Living Room TV/.test(r.textContent)).click(); await wait(100);
ok('pending channel goes to the DLNA TV (direct, no proxy)', dlna[0]?.[0] === 'play' && dlna[0][1] === ch.url && dlna[0][2] === false, dlna);
ok('state: on TV, playing, header shows TV name', getPlayback().onTv && getPlayback().tvPlaying && /Living Room TV/.test(q('.cast-name')[0]?.textContent), q('.cast-name')[0]?.textContent);
await togglePlay(); ok('pause goes to the TV', dlna.at(-1)[0] === 'pause' && getPlayback().tvPlaying === false, dlna);
await togglePlay(); ok('resume goes to the TV', dlna.at(-1)[0] === 'play');
Iptv.dlnaPlay = async () => { throw new Error('UPnP SetAVTransportURI: HTTP 701'); };
await castChannel({ ...ch, url: 'http://x/z.m3u8' }); await wait(50);
ok('TV failure shows toast + status', !!q('.toast')[0] && getPlayback().tvError.includes('701'), q('.toast')[0]?.textContent);
navigate('player'); await wait(50);
ok('player tab: TV panel + error status', /The TV could not play/.test(q('.now-status')[0]?.textContent) && !q('.tv-panel')[0].hidden, q('.now-status')[0]?.textContent);
// ключи proxy
Iptv.dlnaPlay = async (a) => { dlna.push(['play', a.url, a.proxy]); };
await castChannel({ ...ch, url: 'http://x/ua.m3u8', ua: 'X' }); await wait(50);
ok('DLNA with User-Agent goes through the phone proxy', dlna.at(-1)[2] === true, dlna.at(-1));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED', '| errors:', errs);
process.exit(fails ? 1 : 0);
