import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'https://localhost/', pretendToBeVisual: true });
const w = dom.window; w.open = () => {};
Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Option: w.Option, Event: w.Event, AbortController: w.AbortController, matchMedia: () => ({ matches: true }), __APP_VERSION__: 'x', requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout });
w.matchMedia = globalThis.matchMedia;
const list = (name, kinds) => `#EXTM3U\n${kinds.map((k, i) => `#EXTINF:-1 group-title="G",${name} ${k}${i}\nhttp://${name}.example/${k}${i}.m3u8\n`).join('')}`;
const PLAYLISTS = {
  '/a.m3u': list('A', ['alive', 'alive', 'alive', 'dead', 'dead', 'flaky', 'soft']),
  '/b.m3u': list('B', ['dead', 'dead', 'dead', 'dead', 'dead']),
  '/d.m3u': list('D', ['soft', 'soft', 'soft', 'soft', 'soft', 'soft', 'soft', 'soft', 'soft', 'soft']),
};
globalThis.fetch = async (u) => { const k = Object.keys(PLAYLISTS).find((x) => String(u).endsWith(x)); return k ? new Response(PLAYLISTS[k]) : new Response('nope', { status: 404 }); };
const errs = []; process.on('unhandledRejection', (e) => errs.push('REJ ' + e));
const root = '/home/claude/proj/iptv-cast/src/';
const { initLanguage } = await import(root + 'i18n/language.js'); const { initTheme } = await import(root + 'theme/theme.js');
const { mountApp } = await import(root + 'app/app.js');
const { Iptv } = await import(root + 'iptv/native.js');
const { initPlayback } = await import(root + 'iptv/playback.js');
const { loadSource } = await import(root + 'iptv/playlist.js');
const { openCheckDialog } = await import(root + 'dialogs/check.js');
const store = await import(root + 'iptv/store.js');
const calls = []; let flakySeen = 0;
Iptv.probe = async ({ url }) => {
  calls.push(url);
  if (url.includes('alive')) return { ok: true, reason: 'ok' };
  if (url.includes('flaky')) return ++flakySeen === 1 ? { ok: false, reason: 'timeout' } : { ok: true, reason: 'ok' };
  if (url.includes('soft')) return { ok: false, reason: 'timeout' };
  return { ok: false, reason: 'http', code: 404 };
};
initLanguage(); initTheme(); mountApp(document.getElementById('app')); await initPlayback();
const q = (s) => [...document.querySelectorAll(s)]; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const btn = (re, scope = document) => [...scope.querySelectorAll('button')].find((b) => re.test(b.textContent));
let fails = 0; const ok = (n, c, i = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + i)); if (!c) fails++; };
const waitFor = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(40); } return false; };

store.addSources([{ name: 'Alpha', url: 'https://t.test/a.m3u', type: 'sport' }, { name: 'Beta', url: 'https://t.test/b.m3u', type: 'news' }, { name: 'Local', type: 'mix', local: true }]);
const [A, B, L] = store.customSources();
['alive1', 'dead1', 'dead2'].forEach((k) => store.saveLocalChannel(L.id, { name: 'L ' + k, url: `http://L.example/${k}.m3u8`, group: 'g' }));

// ---------- проверка КАЖДОГО канала всех плейлистов
openCheckDialog(store.customSources());
ok('finishes with summary', await waitFor(() => /Channels checked/.test(q('.chk-summary').map((n) => n.textContent).join(' '))), q('.chk-summary').map((n) => n.textContent));
const summary = q('.chk-summary')[0].textContent;
ok('summary totals: 15 checked, 5 working, 10 deleted', /checked: 15\. Working: 5\. Dead ones deleted: 10/.test(summary), summary);
ok('EVERY channel was probed (7+5+3, flaky twice, soft twice)', calls.length === 15 + 2, calls.length);
const a = await loadSource(A);
ok('Alpha: dead + still-timeouting removed, flaky kept after retry', a.channels.length === 4 && a.removed === 3 && a.channels.some((c) => c.url.includes('flaky')), a.channels.map((c) => c.name) + ' removed=' + a.removed);
ok('Alpha hidden dead persisted (reload keeps them hidden)', (await loadSource(A, { force: false })).channels.length === 4);
ok('Local playlist: dead channels physically deleted', store.localChannels(L.id).length === 1 && store.localChannels(L.id)[0].url.includes('alive1'), store.localChannels(L.id));
const b = await loadSource(B);
ok('Beta: all channels dead -> list empty', b.channels.length === 0 && b.removed === 5);
ok('asks what to do with the emptied playlist', q('.chk-ask .chk-row').length === 1 && /Beta/.test(q('.chk-ask')[0].textContent) && !!btn(/^Delete playlist$/));
ok('card badge data saved', store.getChecks()[A.id].alive === 4 && store.getChecks()[A.id].removed === 3);

// ---------- вернуть удалённые
btn(/^Restore deleted$/).click(); await wait(300);
ok('undo restores Alpha (7) and Local (3)', (await loadSource(A)).channels.length === 7 && store.localChannels(L.id).length === 3, (await loadSource(A)).channels.length + '/' + store.localChannels(L.id).length);
ok('undo message', /Dead ones deleted: 0/.test(q('.chk-summary')[0].textContent), q('.chk-summary')[0].textContent);
btn(/^Done$/).click(); await wait(50);

// ---------- повторная проверка пропускает уже проверенные рабочие
calls.length = 0; flakySeen = 5;
openCheckDialog([store.customSources()[0]]);
await waitFor(() => /Channels checked/.test(q('.chk-summary')[0]?.textContent ?? ''));
ok('re-run skips channels verified within 24h (only the 4 restored/unverified are probed)', calls.length <= 5 && !calls.some((u) => u.includes('alive')), calls);
btn(/^Done$/).click(); await wait(50);

// ---------- «скрыто нерабочих» + «Вернуть» в списке каналов
const { setView } = await import(root + 'iptv/view-state.js');
setView({ sourceId: A.id }); await wait(300);
ok('channels view shows "Dead channels hidden" + Restore', /Dead channels hidden: \d/.test(q('.hidden-bar')[0]?.textContent ?? '') && !q('.hidden-bar')[0].hidden, q('.hidden-bar')[0]?.textContent);
btn(/^Restore$/, q('.hidden-bar')[0]).click(); await wait(400);
ok('Restore brings every channel back into the list', q('.channels .item').length === 7, q('.channels .item').length);
setView({ sourceId: null });

// ---------- нет интернета: ничего не удалять
store.addSources([{ name: 'Delta', url: 'https://t.test/d.m3u', type: 'fun' }]);
const D = store.customSources().find((x) => x.name === 'Delta');
openCheckDialog([D]);
await waitFor(() => /Channels checked|No connection/.test(q('.chk-summary').map((n) => n.textContent).join(' ')), 10000);
ok('all timeouts = offline: shows warning and deletes NOTHING', (await loadSource(D)).channels.length === 10 && (await loadSource(D)).removed === 0 && /No connection/.test(q('.chk-summary')[0].textContent), q('.chk-summary')[0]?.textContent);
btn(/^Done$/).click();

console.log(fails ? fails + ' FAILED' : 'ALL PASSED', '| errors:', errs);
process.exit(fails ? 1 : 0);
