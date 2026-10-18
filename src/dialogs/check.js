import { el, button } from '../core/dom.js';
import { bindText } from '../i18n/bind.js';
import { t } from '../i18n/i18n.js';
import { checkAll, checkSource } from '../iptv/check.js';
import { dropSourceData } from '../iptv/playlist.js';
import { nameOf } from '../iptv/sources.js';
import { removeSource, setCheck } from '../iptv/store.js';
import { closeModal, openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

const REASONS = ['http', 'timeout', 'network', 'ssl', 'html', 'empty', 'format', 'hls', 'segment', 'scheme'];

// Человеческое описание результата проверки.
export function resultText(r) {
  const why = REASONS.includes(r.detail) ? t(`pr.${r.detail}`) : r.detail || '?';
  if (r.kind === 'ok') return t('chk.ok', { n: r.tried });
  if (r.kind === 'empty') return t('chk.empty');
  if (r.kind === 'load') return t('chk.load', { d: r.detail });
  return t('chk.dead', { n: r.tried, d: why });
}

function createRow(source, r) {
  const row = el('div', `chk-row ${r.ok ? 'ok' : 'bad'}`);
  const meta = el('div', 'meta');
  meta.append(el('div', 'fname', nameOf(source)), el('div', 'fsub wrap', resultText(r)));
  row.append(el('span', 'chk-mark', r.ok ? '✓' : '✗'), meta);
  return { row, sub: meta.lastChild };
}

// Проверка плейлистов: открываем каждый, пробуем потоки. Нерабочие — спрашиваем, что с ними делать.
export function openCheckDialog(sources) {
  const targets = sources.filter((s) => !s.virtual);
  if (!targets.length) return toast(t('chk.nothing'));
  const ctrl = new AbortController();
  let closed = false;
  const view = el('div', 'check');
  openModal(t('chk.title'), [view], {
    onClose: () => {
      closed = true;
      ctrl.abort();
    },
  });

  // ---------- ход проверки
  const fill = el('div', 'progress-fill');
  const bar = el('div', 'progress');
  bar.append(fill);
  const status = el('div', 'muted small', t('chk.progress', { d: 0, n: targets.length }));
  const rows = el('div', 'chk-list');
  const actions = el('div', 'modal-actions');
  actions.append(bindText(button('btn ghost', () => ctrl.abort()), 'chk.stop'));
  view.replaceChildren(bar, status, rows, actions);

  const failed = [];
  let okCount = 0;
  checkAll(targets, {
    signal: ctrl.signal,
    onResult: (source, r, done) => {
      setCheck(source.id, r);
      if (r.ok) okCount++;
      else failed.push({ source, r });
      rows.prepend(createRow(source, r).row);
      fill.style.width = `${Math.round((done / targets.length) * 100)}%`;
      status.textContent = t('chk.progress', { d: done, n: targets.length });
    },
  }).then(() => {
    if (!closed) finish();
  });

  // ---------- итог и вопрос «что делать»
  function finish() {
    if (!failed.length) {
      const done = el('div', 'modal-actions');
      done.append(bindText(button('btn', closeModal), 'chk.done'));
      view.replaceChildren(el('div', 'chk-summary good', t('chk.allOk', { n: okCount })), done);
      return;
    }
    const summary = el('div', 'chk-summary', t('chk.summary', { ok: okCount, bad: failed.length }));
    const ask = bindText(el('div', 'muted small'), 'chk.ask');
    const list = el('div', 'chk-list');
    const footer = el('div', 'modal-actions');
    view.replaceChildren(summary, ask, list, footer);

    const drawFooter = () => {
      footer.replaceChildren();
      if (!failed.length) {
        summary.textContent = t('chk.allHandled');
        ask.hidden = true;
        footer.append(bindText(button('btn', closeModal), 'chk.done'));
        return;
      }
      summary.textContent = t('chk.summary', { ok: okCount, bad: failed.length });
      footer.append(
        bindText(button('btn ghost', closeModal), 'chk.keep'),
        button('btn danger', confirmAll),
      );
      footer.lastChild.textContent = t('chk.removeAll', { n: failed.length });
    };

    const removeItem = async (item, row) => {
      await dropSourceData(item.source.id);
      removeSource(item.source.id);
      failed.splice(failed.indexOf(item), 1);
      row.remove();
    };

    // Массовое удаление — с подтверждением.
    const confirmAll = () => {
      footer.replaceChildren(
        el('div', 'chk-confirm', t('chk.confirmAll', { n: failed.length })),
        bindText(button('btn ghost', drawFooter), 'lib.cancel'),
        bindText(
          button('btn danger', async () => {
            const n = failed.length;
            await Promise.all([...failed].map((item) => removeItem(item, item.row)));
            toast(t('chk.removed', { n }));
            drawFooter();
          }),
          'chk.yesRemove',
        ),
      );
    };

    failed.forEach((item) => {
      const { row, sub } = createRow(item.source, item.r);
      item.row = row;
      const retry = bindText(
        button('btn ghost sm', async () => {
          row.classList.add('busy');
          sub.textContent = t('chk.checking');
          const r = await checkSource(item.source);
          setCheck(item.source.id, r);
          row.classList.remove('busy');
          if (r.ok) {
            okCount++;
            failed.splice(failed.indexOf(item), 1);
            row.remove();
            toast(t('chk.nowOk', { n: nameOf(item.source) }));
          } else {
            item.r = r;
            sub.textContent = resultText(r);
          }
          drawFooter();
        }),
        'chk.retry',
      );
      const del = bindText(
        button('btn danger sm', async () => {
          await removeItem(item, row);
          toast(t('cat.removed'));
          drawFooter();
        }),
        'cat.remove',
      );
      const acts = el('div', 'chk-acts');
      acts.append(retry, del);
      row.append(acts);
      list.append(row);
    });
    drawFooter();
  }
}
