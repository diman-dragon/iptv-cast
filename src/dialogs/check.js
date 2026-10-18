import { el, button } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { checkPlaylist, undoRemoved } from '../iptv/check.js';
import { dropSourceData } from '../iptv/playlist.js';
import { nameOf } from '../iptv/sources.js';
import { removeSource, setCheck } from '../iptv/store.js';
import { closeModal, openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

// Проверка всех каналов выбранных плейлистов. Не давшие поток удаляются автоматически; удалённое можно вернуть.
export function openCheckDialog(sources, { onDone } = {}) {
  const targets = sources.filter((s) => !s.virtual);
  if (!targets.length) return toast(t('chk.nothing'));
  const ctrl = new AbortController();
  let closed = false;
  const view = el('div', 'check');
  openModal(t('chk.title'), [view], {
    onClose: () => {
      closed = true;
      ctrl.abort();
      onDone?.();
    },
  });

  // ---------- ход проверки
  const head = el('div', 'chk-summary', t('chk.loading'));
  const fill = el('div', 'progress-fill');
  const bar = el('div', 'progress');
  bar.append(fill);
  const counters = el('div', 'chk-counters');
  const note = el('div', 'muted small');
  const lines = el('div', 'chk-list');
  const actions = el('div', 'modal-actions');
  actions.append(bindText(button('btn ghost', () => ctrl.abort()), 'chk.stop'));
  view.replaceChildren(head, bar, counters, note, lines, actions);

  const reports = [];
  const finishedLine = (r) => {
    const row = el('div', `chk-row ${r.alive ? 'ok' : 'bad'}`);
    const meta = el('div', 'meta');
    const text = r.offline
      ? t('chk.offline')
      : t('chk.report', { a: r.alive, t: r.total, d: r.removed.length });
    meta.append(el('div', 'fname', nameOf(r.source)), el('div', 'fsub wrap', text));
    row.append(el('span', 'chk-mark', r.offline ? '!' : r.alive ? '✓' : '✗'), meta);
    return row;
  };

  (async () => {
    for (let i = 0; i < targets.length && !ctrl.signal.aborted; i++) {
      const source = targets[i];
      head.textContent = t('chk.playlist', { i: i + 1, n: targets.length, name: nameOf(source) });
      fill.style.width = '0%';
      counters.textContent = '';
      note.textContent = '';
      let report;
      try {
        report = await checkPlaylist(source, {
          signal: ctrl.signal,
          onProgress: (p) => {
            fill.style.width = `${p.total ? Math.round((p.done / p.total) * 100) : 0}%`;
            counters.textContent = `${t('chk.channels', { d: p.done, t: p.total })} · ${t('chk.stats', { a: p.alive, b: p.dead })}`;
            note.textContent = p.phase === 2 ? t('chk.phase2', { n: p.retry }) : '';
          },
        });
      } catch {
        report = { source, total: 0, alive: 0, removed: [], offline: true, aborted: false };
      }
      reports.push(report);
      setCheck(source.id, { total: report.total, alive: report.alive, removed: report.removed.length, offline: report.offline });
      if (!closed) lines.prepend(finishedLine(report));
    }
    if (!closed) finish();
  })();

  // ---------- итог
  function finish() {
    const total = reports.reduce((n, r) => n + r.total, 0);
    const alive = reports.reduce((n, r) => n + r.alive, 0);
    let removed = reports.reduce((n, r) => n + r.removed.length, 0);
    const offline = reports.some((r) => r.offline);
    const summary = el('div', `chk-summary${offline ? '' : ' good'}`);
    const list = el('div', 'chk-list');
    const footer = el('div', 'modal-actions');
    view.replaceChildren(summary, list, footer);

    reports.forEach((r) => list.append(finishedLine(r)));

    // Плейлист, в котором не осталось ни одного рабочего канала, — спрашиваем, что с ним делать.
    const emptied = reports.filter((r) => r.total > 0 && r.alive === 0 && !r.offline);
    const ask = emptied.length ? el('div', 'chk-ask') : null;
    emptied.forEach((r) => {
      const row = el('div', 'chk-row bad');
      const meta = el('div', 'meta');
      meta.append(el('div', 'fname', nameOf(r.source)), el('div', 'fsub wrap', t('chk.emptied')));
      const del = bindText(
        button('btn danger sm', async () => {
          await dropSourceData(r.source.id);
          removeSource(r.source.id);
          row.remove();
          toast(t('cat.removed'));
        }),
        'chk.removeList',
      );
      const keep = bindText(button('btn ghost sm', () => row.remove()), 'chk.keep');
      const acts = el('div', 'chk-acts');
      acts.append(del, keep);
      row.append(el('span', 'chk-mark', '✗'), meta, acts);
      ask.append(row);
    });
    if (ask) view.insertBefore(ask, footer);

    const text = () =>
      (offline ? `${t('chk.offline')} ` : '') +
      t('chk.summaryAll', { t: total, a: alive, d: removed }) +
      (ctrl.signal.aborted ? ` ${t('chk.aborted')}` : '');
    summary.textContent = text();

    const undo = bindText(
      button('btn ghost', async () => {
        undo.disabled = true;
        const n = removed;
        await Promise.all(reports.map(undoRemoved));
        reports.forEach((r) => (r.removed = []));
        removed = 0;
        reports.forEach((r) => setCheck(r.source.id, { total: r.total, alive: r.alive, removed: 0, offline: r.offline }));
        summary.textContent = text();
        undo.hidden = true;
        toast(t('chk.undone', { n }));
      }),
      'chk.undo',
    );
    undo.hidden = !removed;
    footer.append(undo, bindText(button('btn', closeModal), 'chk.done'));
  }
}
