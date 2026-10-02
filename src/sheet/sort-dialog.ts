/** "Sort…" dialog of the spreadsheet (SHEET-016). */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { colName } from './address';
import type { Range, SortOptions } from './ops';

/**
 * Choose the key column, the order and whether the first row is a header.
 * `headerNames(c)` is the text of the first row in column `c`, shown when it is a header.
 */
export function chooseSort(host: HTMLElement, range: Range, initial: { col: number; header: boolean }, headerNames: (col: number) => string): Promise<SortOptions | null> {
  return new Promise((resolve) => {
    const column = h('select', { 'aria-label': t('sort.column') });
    const header = h('input', { type: 'checkbox' });
    header.checked = initial.header;
    const fillColumns = (): void => {
      const chosen = column.value || String(initial.col);
      column.replaceChildren(
        ...Array.from({ length: range.c2 - range.c1 + 1 }, (_, i) => {
          const c = range.c1 + i;
          const name = header.checked ? headerNames(c).trim() : '';
          return h('option', { value: String(c) }, name ? `${name} (${colName(c)})` : t('sort.columnName', { name: colName(c) }));
        }),
      );
      column.value = chosen;
    };
    header.addEventListener('change', fillColumns);
    fillColumns();
    const ascending = h('input', { type: 'radio', name: 'sort-order', value: 'asc' });
    const descending = h('input', { type: 'radio', name: 'sort-order', value: 'desc' });
    ascending.checked = true;
    const dialog = h('dialog', { class: 'dialog sort-dialog', 'aria-labelledby': 'sort-title' });
    const finish = (ok: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(ok ? { col: Number(column.value), descending: descending.checked, header: header.checked } : null);
    };
    dialog.append(
      h('h2', { id: 'sort-title' }, t('sort.title')),
      h('p', { class: 'hint' }, t('sort.range', { range: `${colName(range.c1)}${range.r1 + 1}:${colName(range.c2)}${range.r2 + 1}` })),
      h('label', { class: 'field' }, `${t('sort.column')} `, column),
      h('fieldset', { class: 'sort-order' }, h('legend', {}, t('sort.order')), h('label', { class: 'check' }, ascending, ` ${t('sort.ascending')}`), h('label', { class: 'check' }, descending, ` ${t('sort.descending')}`)),
      h('label', { class: 'check' }, header, ` ${t('sort.header')}`),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(t('sort.apply'), () => finish(true), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    column.focus();
  });
}
