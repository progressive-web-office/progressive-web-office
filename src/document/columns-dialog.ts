/**
 * DOC-049: the columns of a part of the document: how many, the gap between
 * them (in millimetres, kept in points) and a line between them.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { cleanColumns, DEFAULT_COLUMN_GAP, type ColumnLayout } from './model';

const MM = 72 / 25.4;
const round = (n: number, d = 1): number => Math.round(n * 10 ** d) / 10 ** d;

/** The layout chosen, `undefined` for a single column, or `null` when cancelled. */
export function columnsDialog(host: HTMLElement, current: ColumnLayout | undefined): Promise<ColumnLayout | undefined | null> {
  return new Promise((resolve) => {
    const count = h('select', { 'aria-label': t('cols.count') }, ...[1, 2, 3, 4, 5, 6].map((n) => h('option', { value: String(n), selected: n === (current?.count ?? 2) }, n === 1 ? t('cols.one') : String(n))));
    const initialGap = String(round((current?.gap ?? DEFAULT_COLUMN_GAP) / MM));
    const gap = h('input', { type: 'number', min: '0', max: '100', step: 'any', value: initialGap, 'aria-label': t('cols.gap') });
    const rule = h('input', { type: 'checkbox', checked: !!current?.rule });
    const preview = h('div', { class: 'columns-preview', 'aria-hidden': 'true' });
    const draw = (): void => {
      const n = Number(count.value);
      preview.replaceChildren(...Array.from({ length: n }, () => h('span')));
      preview.style.columnGap = `${Math.min(24, Number(gap.value) || 0)}px`;
      preview.classList.toggle('ruled', rule.checked && n > 1);
      gap.disabled = rule.disabled = n < 2;
    };
    for (const el of [count, gap, rule]) el.addEventListener('input', draw);
    count.addEventListener('change', draw);
    draw();
    const form = h(
      'form',
      { method: 'dialog' },
      h('h2', { id: 'cols-title' }, t('cols.title')),
      h('label', { class: 'git-row' }, t('cols.count'), ' ', count),
      h('label', { class: 'git-row' }, t('cols.gap'), ' ', gap, ' mm'),
      h('label', { class: 'git-row' }, rule, ` ${t('cols.rule')}`),
      preview,
      h('p', { class: 'hint' }, t('cols.hint')),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), h('button', { type: 'submit', class: 'primary' }, t('common.ok'))),
    );
    const dialog = h('dialog', { class: 'dialog columns-dialog', 'aria-labelledby': 'cols-title' }, form);
    const finish = (value: ColumnLayout | undefined | null): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const g = Number(gap.value);
      // An unchanged gap keeps its points (millimetres are rounded).
      const points = gap.value === initialGap ? (current?.gap ?? DEFAULT_COLUMN_GAP) : Number.isFinite(g) && g >= 0 ? round(g * MM, 2) : DEFAULT_COLUMN_GAP;
      finish(cleanColumns({ count: Number(count.value), gap: points, ...(rule.checked ? { rule: true } : {}) }));
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    count.focus();
  });
}
