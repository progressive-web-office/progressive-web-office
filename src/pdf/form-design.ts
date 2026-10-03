/**
 * Designing a PDF form (FORM-001): fields drawn on the pages — text,
 * paragraph, check box, drop-down list, option buttons — named in a dialog,
 * renamed or removed; they become AcroForm fields when the file is saved.
 */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import type { NewField, NewFieldKind } from './forms';

export const KIND_ICONS: Record<NewFieldKind, string> = { text: '▭', multiline: '☰', checkbox: '☑', dropdown: '▾', radio: '◉' };

/** Default size of a field placed by a click, in points. */
export const DEFAULT_SIZE: Record<NewFieldKind, [number, number]> = { text: [180, 20], multiline: [260, 64], checkbox: [14, 14], dropdown: [140, 20], radio: [14, 14] };

export const kindLabel = (kind: NewFieldKind): string => t(`form.kind.${kind}` as MessageKey);

export interface FieldProps {
  name: string;
  options?: string[];
  option?: string;
  required: boolean;
}

/**
 * Ask the properties of a field: its name (`taken` names refused, except
 * those of `groups` for option buttons, which join the group), choices or
 * value, required.
 */
export function fieldDialog(host: HTMLElement, kind: NewFieldKind, opts: { name: string; taken: Set<string>; groups: string[]; options?: string[]; required?: boolean; submit?: string }): Promise<FieldProps | null> {
  return new Promise((resolve) => {
    const name = h('input', { type: 'text', value: opts.name, required: '', list: 'pwo-radio-groups' });
    const options = h('textarea', { rows: '4', placeholder: 'Oui\nNon' });
    options.value = (opts.options ?? []).join('\n');
    const option = h('input', { type: 'text', value: '' });
    const required = h('input', { type: 'checkbox' });
    required.checked = !!opts.required;
    const error = h('p', { class: 'error', role: 'alert', hidden: '' });
    const groups = h('datalist', { id: 'pwo-radio-groups' }, ...(kind === 'radio' ? opts.groups : []).map((g) => h('option', { value: g })));
    const form = h(
      'form',
      { method: 'dialog' },
      h('h2', {}, `${KIND_ICONS[kind]} ${kindLabel(kind)}`),
      h('label', { class: 'field' }, t('form.name'), name),
      groups,
      ...(kind === 'dropdown' ? [h('label', { class: 'field' }, t('form.options'), options)] : []),
      ...(kind === 'radio' ? [h('p', { class: 'hint' }, t('form.radioHint')), h('label', { class: 'field' }, t('form.option'), option)] : []),
      h('label', { class: 'check' }, required, ` ${t('form.required')}`),
      error,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), h('button', { type: 'submit', class: 'primary' }, opts.submit ?? t('form.add'))),
    );
    const dialog = h('dialog', { class: 'dialog form-field-dialog', 'aria-label': kindLabel(kind) }, form);
    const finish = (value: FieldProps | null): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = name.value.trim();
      const joining = kind === 'radio' && opts.groups.includes(n);
      if (!n || (opts.taken.has(n) && !joining)) {
        error.textContent = n ? t('form.nameTaken') : t('form.nameMissing');
        error.hidden = false;
        name.focus();
        return;
      }
      const list = options.value.split('\n').map((s) => s.trim()).filter(Boolean);
      finish({
        name: n,
        required: required.checked,
        ...(kind === 'dropdown' ? { options: list } : {}),
        ...(kind === 'radio' ? { option: option.value.trim() } : {}),
      });
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    name.select();
  });
}

/** A name not yet taken: "Text 3". */
export function freeName(kind: NewFieldKind, taken: Set<string>): string {
  for (let i = 1; ; i++) {
    const name = `${kindLabel(kind)} ${i}`;
    if (!taken.has(name)) return name;
  }
}

/** The rectangle of a drawn field, from two corners in PDF points (a click gives the default size). */
export function drawnRect(kind: NewFieldKind, a: [number, number], b: [number, number]): NewField['rect'] {
  const w = Math.abs(b[0] - a[0]);
  const hgt = Math.abs(b[1] - a[1]);
  if (w < 6 || hgt < 6) {
    const [dw, dh] = DEFAULT_SIZE[kind];
    return [round(a[0]), round(a[1] - dh), dw, dh];
  }
  return [round(Math.min(a[0], b[0])), round(Math.min(a[1], b[1])), round(w), round(hgt)];
}

const round = (n: number): number => Math.round(n * 10) / 10;
