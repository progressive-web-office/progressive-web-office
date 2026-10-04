/**
 * Designing a PDF form (FORM-001, FORM-005): fields drawn on the pages —
 * text, paragraph, check box, drop-down list, option buttons — with their
 * properties in a window, changed, renamed or removed; they become AcroForm
 * fields when the file is saved.
 */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { checkValue, DATE_PATTERNS, FORMAT_KINDS, userRegex, type FieldFormat, type FormatKind } from './field-format';
import type { FieldSettings, NewField, NewFieldKind } from './forms';

export const KIND_ICONS: Record<NewFieldKind, string> = { text: '▭', multiline: '☰', checkbox: '☑', dropdown: '▾', radio: '◉' };

/** Default size of a field placed by a click, in points. */
export const DEFAULT_SIZE: Record<NewFieldKind, [number, number]> = { text: [180, 20], multiline: [260, 64], checkbox: [14, 14], dropdown: [140, 20], radio: [14, 14] };

export const kindLabel = (kind: NewFieldKind): string => t(`form.kind.${kind}` as MessageKey);

export interface FieldProps {
  name: string;
  options?: string[];
  option?: string;
  required: boolean;
  /** FORM-005: its other properties. */
  settings: FieldSettings;
}

const FORMAT_LABELS: Record<FormatKind | 'none', MessageKey> = {
  none: 'form.format.none',
  number: 'form.format.number',
  integer: 'form.format.integer',
  date: 'form.format.date',
  email: 'form.format.email',
  phone: 'form.format.phone',
  regex: 'form.format.regex',
};

/**
 * FORM-001, FORM-005: the properties of a field, as in the forms of PDF
 * readers — its name (`taken` names refused, except those of `groups` for
 * option buttons, which join the group), tooltip, required, read-only; its
 * value at first; for a text its length, boxes, alignment, size and format
 * (checked as the user types a value to try); for a list its choices.
 */
export function fieldDialog(
  host: HTMLElement,
  kind: NewFieldKind,
  opts: { name: string; taken: Set<string>; groups: string[]; options?: string[]; option?: string; required?: boolean; settings?: FieldSettings; submit?: string },
): Promise<FieldProps | null> {
  return new Promise((resolve) => {
    const s = opts.settings ?? {};
    const isText = kind === 'text' || kind === 'multiline';
    const field = (label: string, control: HTMLElement, hint?: string): HTMLElement => h('label', { class: 'field' }, label, control, hint ? h('span', { class: 'hint' }, hint) : null);
    const check = (on: boolean | undefined): HTMLInputElement => {
      const box = h('input', { type: 'checkbox' });
      box.checked = !!on;
      return box;
    };
    const checkRow = (box: HTMLInputElement, label: string): HTMLElement => h('label', { class: 'check' }, box, ` ${label}`);

    // General
    const name = h('input', { type: 'text', value: opts.name, required: '', list: 'pwo-radio-groups' });
    const tooltip = h('input', { type: 'text', value: s.tooltip ?? '', placeholder: t('form.tooltipPlaceholder') });
    const required = check(opts.required ?? s.required);
    const readOnly = check(s.readOnly);
    const groups = h('datalist', { id: 'pwo-radio-groups' }, ...(kind === 'radio' ? opts.groups : []).map((g) => h('option', { value: g })));
    // Choices
    const options = h('textarea', { rows: '4', placeholder: 'Oui\nNon' });
    options.value = (opts.options ?? s.options ?? []).join('\n');
    const editable = check(s.editable);
    const sorted = check(s.sorted);
    const option = h('input', { type: 'text', value: opts.option ?? '' });
    // Value at first
    const defaultValue = h('input', { type: 'text', value: s.defaultValue ?? '' });
    const checked = check(s.checked);
    // Text
    const maxLength = h('input', { type: 'number', min: '0', step: '1', value: s.maxLength ? String(s.maxLength) : '', placeholder: t('form.noLimit') });
    const comb = check(s.comb);
    const align = h('select', {}, ...(['left', 'center', 'right'] as const).map((a) => h('option', { value: a, selected: (s.align ?? 'left') === a }, t(`form.align.${a}` as MessageKey))));
    const fontSize = h('input', { type: 'number', min: '0', max: '72', step: '0.5', value: s.fontSize ? String(s.fontSize) : '', placeholder: t('form.fontAuto') });
    // Format
    const format = h('select', {}, ...(['none', ...FORMAT_KINDS] as const).map((k) => h('option', { value: k, selected: (s.format?.kind ?? 'none') === k }, t(FORMAT_LABELS[k]))));
    const decimals = h('input', { type: 'number', min: '0', max: '6', step: '1', value: String(s.format?.kind === 'number' ? s.format.decimals : 2) });
    const datePattern = h('select', {}, ...DATE_PATTERNS.map((p) => h('option', { value: p, selected: s.format?.kind === 'date' && s.format.pattern === p }, p)));
    const pattern = h('input', { type: 'text', value: s.format?.kind === 'regex' ? s.format.pattern : '', placeholder: '[A-Z]{2}\\d{3}', spellcheck: 'false', autocomplete: 'off' });
    const message = h('input', { type: 'text', value: s.format?.kind === 'regex' ? (s.format.message ?? '') : '', placeholder: t('form.regexMessagePlaceholder') });
    const trial = h('input', { type: 'text', placeholder: t('form.tryPlaceholder'), spellcheck: 'false', autocomplete: 'off' });
    const verdict = h('span', { class: 'form-try-verdict', 'aria-live': 'polite' });
    const decimalsRow = field(t('form.decimals'), decimals);
    const dateRow = field(t('form.datePattern'), datePattern);
    const patternRow = field(t('form.regex'), pattern, t('form.regexHint'));
    const messageRow = field(t('form.regexMessage'), message);
    const tryRow = h('label', { class: 'field' }, t('form.try'), h('span', { class: 'form-try' }, trial, verdict));

    const currentFormat = (): FieldFormat | undefined => {
      const k = format.value as FormatKind | 'none';
      if (k === 'none') return undefined;
      if (k === 'number') return { kind: 'number', decimals: Math.max(0, Math.min(6, Number(decimals.value) || 0)) };
      if (k === 'date') return { kind: 'date', pattern: datePattern.value };
      if (k === 'regex') return { kind: 'regex', pattern: pattern.value, ...(message.value.trim() ? { message: message.value.trim() } : {}) };
      return { kind: k };
    };
    const showFormat = (): void => {
      const k = format.value;
      decimalsRow.hidden = k !== 'number';
      dateRow.hidden = k !== 'date';
      patternRow.hidden = messageRow.hidden = k !== 'regex';
      tryRow.hidden = k === 'none';
      const f = currentFormat();
      const bad = f?.kind === 'regex' && !userRegex(f.pattern);
      pattern.setAttribute('aria-invalid', String(bad));
      verdict.textContent = bad ? t('form.regexInvalid') : trial.value ? (checkValue(f, trial.value) ? '✓' : `✗ ${f?.kind === 'regex' && f.message ? f.message : t('form.valueInvalid')}`) : '';
      verdict.classList.toggle('error', bad || (!!trial.value && !checkValue(f, trial.value)));
    };
    for (const el of [format, decimals, datePattern, pattern, message, trial]) el.addEventListener('input', showFormat);
    showFormat();

    const section = (legend: string, ...kids: (HTMLElement | null)[]): HTMLElement => h('fieldset', { class: 'form-props-section' }, h('legend', {}, legend), ...kids);
    const error = h('p', { class: 'error', role: 'alert', hidden: '' });
    const form = h(
      'form',
      { method: 'dialog' },
      h('h2', {}, `${KIND_ICONS[kind]} ${kindLabel(kind)}`),
      section(
        t('form.general'),
        field(t('form.name'), name),
        groups,
        field(t('form.tooltip'), tooltip, t('form.tooltipHint')),
        checkRow(required, t('form.required')),
        checkRow(readOnly, t('form.readOnly')),
      ),
      kind === 'dropdown' ? section(t('form.choices'), field(t('form.options'), options), checkRow(editable, t('form.editable')), checkRow(sorted, t('form.sorted'))) : null,
      kind === 'radio' ? section(t('form.choices'), h('p', { class: 'hint' }, t('form.radioHint')), field(t('form.option'), option)) : null,
      isText || kind === 'dropdown' ? section(t('form.value'), field(t('form.defaultValue'), defaultValue)) : null,
      kind === 'checkbox' ? section(t('form.value'), checkRow(checked, t('form.checkedByDefault'))) : null,
      isText
        ? section(
            t('form.text'),
            field(t('form.maxLength'), maxLength),
            kind === 'text' ? checkRow(comb, t('form.comb')) : null,
            field(t('form.align'), align),
            field(t('form.fontSize'), fontSize),
          )
        : null,
      isText ? section(t('form.formatTitle'), field(t('form.format'), format), decimalsRow, dateRow, patternRow, messageRow, tryRow) : null,
      error,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), h('button', { type: 'submit', class: 'primary' }, opts.submit ?? t('form.add'))),
    );
    const dialog = h('dialog', { class: 'dialog form-field-dialog', 'aria-label': kindLabel(kind) }, form);
    const finish = (value: FieldProps | null): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const refuse = (text: string, el: HTMLElement): void => {
      error.textContent = text;
      error.hidden = false;
      el.focus();
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = name.value.trim();
      const joining = kind === 'radio' && opts.groups.includes(n);
      if (!n || (opts.taken.has(n) && !joining)) return refuse(n ? t('form.nameTaken') : t('form.nameMissing'), name);
      const list = options.value.split('\n').map((x) => x.trim()).filter(Boolean);
      const settings: FieldSettings = { tooltip: tooltip.value.trim(), readOnly: readOnly.checked };
      if (isText) {
        const max = Math.max(0, Math.floor(Number(maxLength.value) || 0));
        const f = currentFormat();
        if (f?.kind === 'regex' && (!f.pattern || !userRegex(f.pattern))) return refuse(t('form.regexInvalid'), pattern);
        if (comb.checked && !max) return refuse(t('form.combNeedsLength'), maxLength);
        const value = defaultValue.value;
        if (max && value.length > max) return refuse(t('form.defaultTooLong', { n: max }), defaultValue);
        if (!checkValue(f, value)) return refuse(t('form.defaultInvalid'), defaultValue);
        Object.assign(settings, { maxLength: max, comb: kind === 'text' && comb.checked, align: align.value as FieldSettings['align'], fontSize: Math.max(0, Number(fontSize.value) || 0), defaultValue: value, format: f });
      } else if (kind === 'dropdown') {
        Object.assign(settings, { editable: editable.checked, sorted: sorted.checked, defaultValue: defaultValue.value.trim() });
        if (settings.defaultValue && !settings.editable && !list.includes(settings.defaultValue)) return refuse(t('form.defaultNotAChoice'), defaultValue);
      } else if (kind === 'checkbox') settings.checked = checked.checked;
      finish({
        name: n,
        required: required.checked,
        settings,
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
