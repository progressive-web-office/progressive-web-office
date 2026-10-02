/** The values shown in a column of an autofilter (SHEET-018). */
import { button, h } from '../app/dom';
import { t } from '../i18n';

/**
 * Check the values to show. Resolves to the chosen values, `undefined` to show
 * everything, or `null` when cancelled.
 */
export function chooseFilterValues(host: HTMLElement, title: string, values: string[], shown: string[] | undefined): Promise<string[] | undefined | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog filter-dialog', 'aria-labelledby': 'filter-title' });
    const search = h('input', { type: 'search', 'aria-label': t('filter.search'), placeholder: t('filter.search') });
    const all = h('input', { type: 'checkbox' });
    const boxes = values.map((v) => {
      const box = h('input', { type: 'checkbox', value: v });
      box.checked = !shown || shown.includes(v);
      const label = h('label', { class: 'check' }, box, ` ${v === '' ? t('filter.empty') : v}`);
      return { v, box, label };
    });
    const syncAll = (): void => {
      const checked = boxes.filter((b) => b.box.checked).length;
      all.checked = checked === boxes.length;
      all.indeterminate = checked > 0 && checked < boxes.length;
    };
    syncAll();
    all.addEventListener('change', () => {
      for (const b of boxes) if (!b.label.hidden) b.box.checked = all.checked;
      syncAll();
    });
    for (const b of boxes) b.box.addEventListener('change', syncAll);
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const b of boxes) b.label.hidden = !!q && !b.v.toLowerCase().includes(q);
    });
    const finish = (result: string[] | undefined | null): void => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    const apply = (): void => {
      const chosen = boxes.filter((b) => b.box.checked).map((b) => b.v);
      finish(chosen.length === boxes.length ? undefined : chosen);
    };
    dialog.append(
      h('h2', { id: 'filter-title' }, title),
      search,
      h('label', { class: 'check filter-all' }, all, ` ${t('filter.all')}`),
      h('div', { class: 'filter-values', role: 'group', 'aria-label': t('filter.values') }, ...boxes.map((b) => b.label)),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('filter.clear'), () => finish(undefined)),
        button(t('common.cancel'), () => finish(null)),
        button(t('filter.apply'), apply, { className: 'primary' }),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    search.focus();
  });
}
