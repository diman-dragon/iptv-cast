import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'https://localhost/', pretendToBeVisual: true });
const w = dom.window; const realFetch = globalThis.fetch; const opened = [];
w.open = (u) => opened.push(u);
Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, HTMLElement: w.HTMLElement, Option: w.Option, Event: w.Event, matchMedia: () => ({ matches: true }), __APP_VERSION__: 'x', requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout });
w.matchMedia = globalThis.matchMedia;
const P = '/home/claude/proj/iptv-cast/playlists/';
globalThis.fetch = async (u, o) => {
  u = String(u);
  if (u === 'https://t.test/sport.json') return new Response(readFileSync(P + 'sport.json', 'utf8'));
  if (u === 'https://t.test/all.json') return new Response(readFileSync(P + 'all.json', 'utf8'));
  if (u === 'https://t.test/my.m3u') return new Response('#EXTM3U\n#EXTINF:-1 group-title="Z",Chan A\nhttp://a/1.m3u8\n#EXTINF:-1,Chan B\nhttp://a/2.m3u8\n');
  if (u === 'https://t.test/page') return new Response('<html>oops</html>');
  return realFetch(u.replace('https://iptv-org.github.io/iptv/', 'https://raw.githubusercontent.com/iptv-org/iptv/gh-pages/'), o);
};
const errs = []; process.on('unhandledRejection', (e) => errs.push('REJ ' + e));
const root = '/home/claude/proj/iptv-cast/src/';
const { initLanguage } = await import(root + 'i18n/language.js'); const { initTheme } = await import(root + 'theme/theme.js');
const { mountApp } = await import(root + 'app/app.js'); const { initPlayback } = await import(root + 'iptv/playback.js');
const { openAddDialog } = await import(root + 'dialogs/add.js'); const { customSources } = await import(root + 'iptv/store.js');
initLanguage(); initTheme(); mountApp(document.getElementById('app')); await initPlayback();
const q = (s) => [...document.querySelectorAll(s)]; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
console.log('tabs:', q('.tab-label').map((n) => n.textContent));
console.log('built-in playlists:', customSources().length, '| cards:', q('.src').map((n) => n.querySelector('.fname').textContent), '| onboarding:', q('.empty-title').map((n) => n.textContent));
async function load(link) {
  openAddDialog(); const input = q('.modal input[type=url]')[0]; input.value = link;
  q('.modal .btn').filter((b) => !b.classList.contains('ghost'))[0].click(); await wait(800);
  const err = q('.form-error')[0]?.textContent; if (q('.modal').length) q('.modal .btn.ghost')[0].click(); return err;
}
console.log('bad page ->', await load('https://t.test/page'));
console.log('pack sport ->', 'sources:', (await load('https://t.test/sport.json'), customSources().length));
console.log('pack all (dedupe) ->', (await load('https://t.test/all.json'), customSources().length), '(75 expected)');
await load('https://t.test/my.m3u'); await wait(300);
console.log('m3u link opened inside library: items =', q('.channels .item').length, '| title =', q('.src-chip-name')[0]?.textContent);
q('.channels .item')[0].click(); await wait(100);
console.log('tap channel ->', opened);
console.log('errors:', errs); process.exit(0);
