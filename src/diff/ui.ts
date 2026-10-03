/**
 * VER-001: two versions side by side in one column — lines added, removed
 * or changed (their words struck through or underlined), unchanged lines
 * folded around the changes; for workbooks, the cells that changed.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { diffLines, diffSheets, type LineRow } from './diff';
import type { VersionView } from './views';

/** Unchanged lines kept around a change. */
const CONTEXT = 2;

function lineElement(row: LineRow): HTMLElement {
  if (row.kind === 'changed') {
    return h('div', { class: 'diff-line changed' }, h('span', { class: 'diff-mark', 'aria-hidden': 'true' }, '~'), h('span', { class: 'diff-text' }, ...row.words!.map((w) => (w.op === 'eq' ? w.text : h(w.op === 'ins' ? 'ins' : 'del', {}, w.text)))));
  }
  const text = (row.kind === 'removed' ? row.before : row.after) ?? '';
  const mark = row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' ';
  return h('div', { class: `diff-line ${row.kind}` }, h('span', { class: 'diff-mark', 'aria-hidden': 'true' }, mark), h('span', { class: 'diff-text' }, row.kind === 'added' ? h('ins', {}, text) : row.kind === 'removed' ? h('del', {}, text) : text));
}

/** The comparison of two versions, as an element; `summary` counts what changed. */
export function diffElement(before: VersionView, after: VersionView): { element: HTMLElement; changes: number } {
  if (before.kind === 'text' && after.kind === 'text') {
    const rows = diffLines(before.text, after.text);
    const changes = rows.filter((r) => r.kind !== 'same').length;
    const out: HTMLElement[] = [];
    const keep = rows.map((r, i) => r.kind !== 'same' || rows.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).some((x) => x.kind !== 'same'));
    for (let i = 0; i < rows.length; ) {
      if (keep[i]) {
        out.push(lineElement(rows[i]!));
        i++;
        continue;
      }
      let j = i;
      while (j < rows.length && !keep[j]) j++;
      const hidden = rows.slice(i, j);
      const fold = button(t('diff.unchanged', { n: hidden.length }), () => fold.replaceWith(...hidden.map(lineElement)), { className: 'diff-fold' });
      out.push(fold);
      i = j;
    }
    const summary = h('p', { class: 'diff-summary' }, changes ? t('diff.summary', { added: rows.filter((r) => r.kind === 'added').length, removed: rows.filter((r) => r.kind === 'removed').length, changed: rows.filter((r) => r.kind === 'changed').length }) : t('diff.same'));
    return { element: h('div', { class: 'diff' }, summary, h('div', { class: 'diff-lines', role: 'document' }, ...out)), changes };
  }
  if (before.kind === 'sheet' && after.kind === 'sheet') {
    const cells = diffSheets(before.workbook, after.workbook);
    const table = h(
      'table',
      { class: 'diff-cells' },
      h('thead', {}, h('tr', {}, h('th', {}, t('diff.sheet')), h('th', {}, t('diff.cell')), h('th', {}, t('diff.before')), h('th', {}, t('diff.after')))),
      h('tbody', {}, ...cells.map((c) => h('tr', {}, h('td', {}, c.sheet), h('td', {}, c.ref), h('td', {}, c.before ? h('del', {}, c.before) : ''), h('td', {}, c.after ? h('ins', {}, c.after) : '')))),
    );
    return { element: h('div', { class: 'diff' }, h('p', { class: 'diff-summary' }, cells.length ? t('diff.cellsChanged', { n: cells.length }) : t('diff.same')), cells.length ? table : ''), changes: cells.length };
  }
  return { element: h('div', { class: 'diff' }, h('p', { class: 'hint' }, t('diff.cannot'))), changes: 0 };
}

/** The comparison in a window. */
export function showDiff(host: HTMLElement, title: string, labels: [string, string], before: VersionView, after: VersionView): Promise<void> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog diff-dialog', 'aria-labelledby': 'diff-title' });
    const close = (): void => {
      dialog.close();
      dialog.remove();
      resolve();
    };
    dialog.append(
      h('h2', { id: 'diff-title' }, title),
      h('p', { class: 'diff-legend' }, h('del', {}, labels[0]), ' → ', h('ins', {}, labels[1])),
      diffElement(before, after).element,
      h('div', { class: 'dialog-actions' }, button(t('common.close'), close, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
}
