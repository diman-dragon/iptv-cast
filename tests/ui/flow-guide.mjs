import 'fake-indexeddb/auto';
import zlib from 'node:zlib';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'https://localhost/', pretendToBeVisual: true });
const w = dom.window; w.open = () => {};
w.Element.prototype.getBoundingClientRect = function () { return this.classList?.contains('stage') ? { left: 16, top: 120, width: 360, height: 203, right: 376, bottom: 323 } : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; };
Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Option: w.Option, Event: w.Event, AbortController: w.AbortController, matchMedia: () => ({ matches: true }), __APP_VERSION__: '0.4.3', requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout });
w.matchMedia = globalThis.matchMedia;
const p2 = (n) => String(n).padStart(2, '0');
const fmt = (ms, tz = '+0300') => { const d = new Date(ms + 3 * 3600000); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())} ${tz}`; };
const t0 = Date.now(); const MIN = 60000;
const XML = `<?xml version="1.0"?><tv>
<channel id="news.ru"><display-name lang="ru">Новости 24</display-name></channel>
<channel id="sport.1"><display-name>Sport One &amp; Co</display-name></channel>
<programme start="${fmt(t0 - 90 * MIN)}" stop="${fmt(t0 - 30 * MIN)}" channel="news.ru"><title lang="ru">Утро (прошло)</title></programme>
<programme start="${fmt(t0 - 30 * MIN)}" stop="${fmt(t0 + 30 * MIN)}" channel="news.ru"><title lang="ru">Главные новости &amp; погода</title><desc lang="ru">Обзор дня.</desc></programme>
<programme start="${fmt(t0 + 30 * MIN)}" stop="${fmt(t0 + 60 * MIN)}" channel="news.ru"><title>Спорт</title></programme>
<programme start="${fmt(t0 + 60 * MIN)}" stop="${fmt(t0 + 120 * MIN)}" channel="news.ru"><title>Ток-шоу</title></programme>
<programme start="${fmt(t0 - 10 * MIN)}" stop="${fmt(t0 + 50 * MIN)}" channel="sport.1"><title>Match Day</title></programme>
</tv>`;
let hits = 0;
globalThis.fetch = async (u) => {
  u = String(u); hits++;
  if (u.endsWith('/guide.xml')) return new Response(XML);
  if (u.endsWith('/guide.xml.gz')) return new Response(zlib.gzipSync(Buffer.from(XML)));
  return new Response('no', { status: 404 });
};
const errs = []; process.on('unhandledRejection', (e) => errs.push('REJ ' + e));
const root = '/home/claude/proj/iptv-cast/src/';
const epg = await import(root + 'iptv/epg.js'); const store = await import(root + 'iptv/store.js'); const parse = await import(root + 'iptv/parse.js');
let fails = 0; const ok = (n, c, i = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + i)); if (!c) fails++; };

// ---- парсер: tvg-id и адрес программы в заголовке
const m3u = '#EXTM3U x-tvg-url="https://t.test/guide.xml.gz, https://t.test/guide.xml"\n#EXTINF:-1 tvg-id="news.ru" group-title="N",Новости 24\nhttp://a/1.m3u8\n';
const full = parse.parseM3uFull(m3u);
ok('parser reads tvg-id and x-tvg-url (two links)', full.channels[0].id === 'news.ru' && full.epg.length === 2 && full.epg[0].endsWith('guide.xml.gz'), JSON.stringify(full));
ok('xmltv time with zone', epg.parseXmltvTime('20260101120000 +0300') === Date.UTC(2026, 0, 1, 9, 0, 0));

// ---- программа: по tvg-id, now + next, прошедшие отброшены
let g = await epg.getProgram({ name: 'Новости 24', id: 'news.ru', epg: ['https://t.test/guide.xml'] });
ok('now = the show that is on right now (entities decoded), past shows dropped', g.now?.title === 'Главные новости & погода' && g.now.desc === 'Обзор дня.', JSON.stringify(g));
ok('next = following shows in order', g.next.map((x) => x.title).join() === 'Спорт,Ток-шоу', g.next.map((x) => x.title));
// ---- по названию, если у канала нет tvg-id
g = await epg.getProgram({ name: 'Sport One & Co (720p)', id: '', epg: ['https://t.test/guide.xml'] });
ok('matched by channel name when there is no tvg-id (quality tag ignored)', g?.now?.title === 'Match Day', JSON.stringify(g));
// ---- gzip
epg.clearGuideCache();
g = await epg.getProgram({ name: 'Новости 24', id: 'news.ru', epg: ['https://t.test/guide.xml.gz'] });
ok('.xml.gz is unpacked', g?.now?.title === 'Главные новости & погода', JSON.stringify(g));
// ---- свой источник из настроек
store.setPref('epgUrl', 'https://t.test/guide.xml'); epg.clearGuideCache();
g = await epg.getProgram({ name: 'Новости 24', id: 'news.ru' });
ok('guide URL from Settings is used when the playlist has none', g?.now?.title === 'Главные новости & погода', JSON.stringify(g));
// ---- кэш: повторный запрос без скачивания
const before = hits; await epg.getProgram({ name: 'Новости 24', id: 'news.ru' });
ok('second lookup does not download again (cache)', hits === before, hits - before);
// ---- нет программы / нет источника / ошибка
store.setPref('epgUrl', '');
ok('no source at all -> null', (await epg.getProgram({ name: 'X', id: 'x' })) === null);
g = await epg.getProgram({ name: 'Нет такого', id: 'no.such', epg: ['https://t.test/guide.xml'] });
ok('channel not in the guide -> null', g === null, JSON.stringify(g));
g = await epg.getProgram({ name: 'Новости 24', id: 'news.ru', epg: ['https://t.test/missing.xml'] });
ok('download failure is reported', /HTTP 404/.test(g?.error ?? ''), JSON.stringify(g));

// ---- интерфейс: блок «Программа» под кнопками плеера
const { initLanguage } = await import(root + 'i18n/language.js'); const { initTheme } = await import(root + 'theme/theme.js');
const { mountApp } = await import(root + 'app/app.js'); const { navigate } = await import(root + 'app/router.js');
const pb = await import(root + 'iptv/playback.js'); const { Iptv } = await import(root + 'iptv/native.js');
Iptv.play = async () => ({});
initLanguage(); initTheme(); mountApp(document.getElementById('app')); await pb.initPlayback();
const q = (s) => [...document.querySelectorAll(s)]; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
epg.clearGuideCache(); store.setPref('epgUrl', '');
navigate('player'); await wait(50);
await pb.playChannel({ name: 'Новости 24', id: 'news.ru', url: 'http://a/1.m3u8', group: 'N', logo: '', epg: ['https://t.test/guide.xml'] }, undefined, { open: false });
await wait(300);
const guide = q('.guide')[0];
ok('guide sits below the window and the buttons', [...q('.player')[0].children].map((n) => n.className.split(' ')[0]).join() === 'stage,pc-row,guide');
ok('guide shows "Now" with the current show and a progress bar', /Now/.test(guide.textContent) && /Главные новости & погода/.test(guide.textContent) && !!guide.querySelector('.progress-fill'), guide.textContent);
ok('guide lists the next shows with times', guide.querySelectorAll('.guide-row').length === 2 && /Спорт/.test(guide.textContent) && /Ток-шоу/.test(guide.textContent), guide.textContent);
const fill = parseFloat(guide.querySelector('.progress-fill').style.width);
ok('progress is about 50% (30 of 60 minutes passed)', fill > 40 && fill < 60, fill);
console.log(fails ? fails + ' FAILED' : 'ALL PASSED', '| errors:', errs);
process.exit(fails ? 1 : 0);
