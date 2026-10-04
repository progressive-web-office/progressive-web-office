/**
 * DOC-050: a field changed where it stands — what it shows, how a date or a
 * time is written, today's or a fixed one — with its value previewed.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { FIELD_FORMATS, FIELD_KINDS, fieldValue, type FieldContext, type FieldFormat, type FieldKind, type FieldRun } from './model';

export type FieldChoice = { action: 'update'; run: FieldRun } | { action: 'freeze' } | { action: 'delete' } | null;

const todayIso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nowTime = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function editField(host: HTMLElement, run: FieldRun, ctx: FieldContext): Promise<FieldChoice> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog field-dialog', 'aria-labelledby': 'field-title' });
    const kind = h('select', { 'aria-label': t('field.kind') }, ...FIELD_KINDS.map((k) => h('option', { value: k, selected: k === run.field }, t(`field.${k}`))));
    const format = h('select', { 'aria-label': t('field.format') });
    const today = h('input', { type: 'radio', name: 'field-when', checked: !run.fixed });
    const fixed = h('input', { type: 'radio', name: 'field-when', checked: !!run.fixed });
    const fixedValue = h('input', { type: 'date', 'aria-label': t('field.fixedValue') });
    const preview = h('output', { class: 'field-preview', 'aria-live': 'polite' });
    const timed = h('div', { class: 'field-timed' });
    const current = (): FieldRun => {
      const k = kind.value as FieldKind;
      const out: FieldRun = { field: k };
      if (k === 'date' || k === 'time') {
        if (format.value) out.format = format.value as FieldFormat;
        if (fixed.checked && fixedValue.value) out.fixed = fixedValue.value;
      }
      return out;
    };
    const fillFormats = (): void => {
      const k = kind.value as FieldKind;
      const chosen = format.value || run.format || '';
      const example = (f: FieldFormat | undefined): string => fieldValue(k, ctx, f ? { format: f } : {});
      // Each format with an example; the default first (long date, short time).
      const formats = k === 'time' ? (['short', 'medium', 'iso'] as const) : FIELD_FORMATS.filter((f) => f !== 'long');
      format.replaceChildren(h('option', { value: '' }, `${t('field.formatDefault')} — ${example(undefined)}`), ...formats.map((f) => h('option', { value: f, selected: f === chosen }, `${t(`field.format.${f}`)} — ${example(f)}`)));
    };
    const sync = (): void => {
      const k = kind.value as FieldKind;
      timed.hidden = k !== 'date' && k !== 'time';
      fixedValue.type = k === 'time' ? 'time' : 'date';
      const now = ctx.now ?? new Date();
      if (!fixedValue.value || (k === 'time') !== fixedValue.value.includes(':')) fixedValue.value = run.fixed && (k === 'time') === run.fixed.includes(':') ? run.fixed : k === 'time' ? nowTime(now) : todayIso(now);
      fixedValue.disabled = !fixed.checked;
      preview.textContent = fieldValue(k, ctx, current()) || `{${k}}`;
    };
    kind.addEventListener('change', () => {
      fillFormats();
      sync();
    });
    for (const el of [format, today, fixed, fixedValue]) el.addEventListener('input', sync);
    for (const el of [today, fixed]) el.addEventListener('change', sync);
    const finish = (value: FieldChoice): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    timed.append(
      h('label', {}, `${t('field.format')} `, format),
      h('fieldset', { class: 'field-when' }, h('legend', {}, t('field.when')), h('label', {}, today, ` ${t('field.today')}`), h('label', {}, fixed, ` ${t('field.fixed')} `), fixedValue),
    );
    dialog.append(
      h('h2', { id: 'field-title' }, t('field.editTitle')),
      h('label', {}, `${t('field.kind')} `, kind),
      timed,
      h('p', {}, `${t('field.preview')} `, preview),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('field.delete'), () => finish({ action: 'delete' })),
        button(t('field.freeze'), () => finish({ action: 'freeze' })),
        button(t('common.cancel'), () => finish(null)),
        button(t('common.ok'), () => finish({ action: 'update', run: current() }), { className: 'primary' }),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    fillFormats();
    sync();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    kind.focus();
  });
}
