/** "Data validation…" dialog of the spreadsheet (SHEET-028). */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { parseRange } from './chart';
import { dateToSerial, serialToDate } from './model';
import { VALIDATION_OPS, type Validation, type ValidationKind, type ValidationOp, type ValidationRule } from './validation';

const isoOf = (serial: number): string => serialToDate(serial).toISOString().slice(0, 10);
const serialOf = (iso: string): number | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? dateToSerial(Number(m[1]), Number(m[2]), Number(m[3])) : undefined;
};

/** The rule in words: "a whole number between 1 and 10", "one of: yes, no". */
export function describeRule(rule: ValidationRule, items: string[] = rule.kind === 'list' ? (rule.items ?? []) : []): string {
  if (rule.kind === 'list') return t('validation.rule.list', { items: items.join(', ') || rule.source || '' });
  const show = (n: number): string => (rule.kind === 'date' ? isoOf(n) : String(n));
  const what = t(`validation.what.${rule.kind}` as MessageKey);
  const op = t(`validation.op.${rule.op}` as MessageKey);
  const two = rule.op === 'between' || rule.op === 'notBetween';
  return two ? t('validation.rule.between', { what, op, a: show(rule.a), b: show(rule.b ?? rule.a) }) : t('validation.rule.compare', { what, op, a: show(rule.a) });
}

/** Choose the validation of the selection: a new one, 'remove', or null when cancelled. */
export function chooseValidation(host: HTMLElement, rangeLabel: string, initial: Validation | undefined): Promise<Omit<Validation, 'ranges'> | 'remove' | null> {
  return new Promise((resolve) => {
    const kinds: (ValidationKind | 'any')[] = ['any', 'list', 'whole', 'decimal', 'date', 'textLength'];
    const kind = h('select', {}, ...kinds.map((k) => h('option', { value: k }, t(`validation.kind.${k}` as MessageKey))));
    const op = h('select', {}, ...VALIDATION_OPS.map((o) => h('option', { value: o }, t(`validation.op.${o}` as MessageKey))));
    const a = h('input', { type: 'number', step: 'any' });
    const b = h('input', { type: 'number', step: 'any' });
    const items = h('textarea', { rows: '4' });
    const source = h('input', { type: 'text', placeholder: '$E$1:$E$9', spellcheck: 'false' });
    const allowBlank = h('input', { type: 'checkbox' });
    const inputTitle = h('input', { type: 'text' });
    const inputMessage = h('textarea', { rows: '2' });
    const errorStyle = h('select', {}, ...(['stop', 'warning', 'information'] as const).map((s) => h('option', { value: s }, t(`validation.style.${s}` as MessageKey))));
    const errorTitle = h('input', { type: 'text' });
    const errorMessage = h('textarea', { rows: '2' });
    const problem = h('p', { class: 'error', role: 'alert', hidden: '' });

    const rule = initial?.rule;
    kind.value = rule?.kind ?? 'any';
    allowBlank.checked = initial?.allowBlank ?? true;
    if (rule?.kind === 'list') {
      items.value = (rule.items ?? []).join('\n');
      source.value = rule.source ?? '';
    } else if (rule) {
      op.value = rule.op;
      a.value = String(rule.a);
      if (rule.b !== undefined) b.value = String(rule.b);
    }
    inputTitle.value = initial?.input?.title ?? '';
    inputMessage.value = initial?.input?.message ?? '';
    errorStyle.value = initial?.errorStyle ?? 'stop';
    errorTitle.value = initial?.error?.title ?? '';
    errorMessage.value = initial?.error?.message ?? '';

    const field = (label: MessageKey, control: HTMLElement): HTMLElement => h('label', { class: 'field' }, t(label), control);
    const listPart = h('div', {}, field('validation.items', items), field('validation.source', source));
    const aLabel = h('span', {}, t('validation.min'));
    const bField = h('label', { class: 'field' }, t('validation.max'), b);
    const comparePart = h('div', {}, field('validation.op', op), h('label', { class: 'field' }, aLabel, a), bField);
    const details = h('div', {}, listPart, comparePart, h('label', { class: 'check' }, allowBlank, ` ${t('validation.allowBlank')}`));
    const sync = (): void => {
      const k = kind.value;
      details.hidden = k === 'any';
      listPart.hidden = k !== 'list';
      comparePart.hidden = k === 'list' || k === 'any';
      const two = op.value === 'between' || op.value === 'notBetween';
      bField.hidden = !two;
      aLabel.textContent = t(two ? 'validation.min' : 'validation.value');
      // Dates are chosen with the browser's date picker, kept as day numbers.
      for (const input of [a, b]) {
        const date = k === 'date';
        if ((input.type === 'date') === date) continue;
        const n = Number(input.value);
        input.type = date ? 'date' : 'number';
        input.value = date ? (input.value && Number.isFinite(n) ? isoOf(n) : '') : '';
      }
    };
    kind.addEventListener('change', sync);
    op.addEventListener('change', sync);
    if (rule?.kind === 'date') {
      kind.value = 'date';
      sync();
      a.value = isoOf(rule.a);
      if (rule.b !== undefined) b.value = isoOf(rule.b);
    }
    sync();

    const read = (input: HTMLInputElement): number | undefined => {
      if (kind.value === 'date') return serialOf(input.value);
      const n = input.value.trim() === '' ? NaN : Number(input.value);
      return Number.isFinite(n) ? n : undefined;
    };
    const build = (): Omit<Validation, 'ranges'> | string => {
      const k = kind.value as ValidationKind;
      let r: ValidationRule;
      if (k === 'list') {
        const list = items.value.split('\n').map((s) => s.trim()).filter(Boolean);
        const src = source.value.trim().toUpperCase();
        if (!list.length && !src) return t('validation.needItems');
        if (!list.length && !parseRange(src)) return t('validation.badSource');
        r = list.length ? { kind: 'list', items: list } : { kind: 'list', source: src.includes('$') ? src : src.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2') };
      } else {
        const o = op.value as ValidationOp;
        const av = read(a);
        const two = o === 'between' || o === 'notBetween';
        const bv = two ? read(b) : undefined;
        if (av === undefined || (two && bv === undefined)) return t('validation.needValues');
        r = { kind: k, op: o, a: av, ...(two ? { b: bv } : {}) };
      }
      const msg = (title: HTMLInputElement, message: HTMLTextAreaElement): { title?: string; message: string } | undefined =>
        message.value.trim() ? { message: message.value.trim(), ...(title.value.trim() ? { title: title.value.trim() } : {}) } : undefined;
      const input = msg(inputTitle, inputMessage);
      const error = msg(errorTitle, errorMessage);
      return { rule: r, allowBlank: allowBlank.checked, errorStyle: errorStyle.value as Validation['errorStyle'], ...(input ? { input } : {}), ...(error ? { error } : {}) };
    };

    const dialog = h('dialog', { class: 'dialog validation-dialog', 'aria-labelledby': 'validation-title' });
    const finish = (result: Omit<Validation, 'ranges'> | 'remove' | null): void => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    const apply = (): void => {
      if (kind.value === 'any') return finish('remove');
      const result = build();
      if (typeof result === 'string') {
        problem.textContent = result;
        problem.hidden = false;
        return;
      }
      finish(result);
    };
    dialog.append(
      h('h2', { id: 'validation-title' }, t('validation.title')),
      h('p', { class: 'hint' }, t('validation.range', { range: rangeLabel })),
      field('validation.allow', kind),
      details,
      h(
        'details',
        { open: initial?.input ? '' : undefined },
        h('summary', {}, t('validation.inputSection')),
        field('validation.messageTitle', inputTitle),
        field('validation.inputMessage', inputMessage),
      ),
      h(
        'details',
        { open: initial?.error || (initial && initial.errorStyle !== 'stop') ? '' : undefined },
        h('summary', {}, t('validation.errorSection')),
        field('validation.errorStyle', errorStyle),
        field('validation.messageTitle', errorTitle),
        field('validation.errorMessage', errorMessage),
      ),
      problem,
      h(
        'div',
        { class: 'dialog-actions' },
        initial ? button(t('validation.remove'), () => finish('remove')) : null,
        button(t('common.cancel'), () => finish(null)),
        button(t('validation.apply'), apply, { className: 'primary' }),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    kind.focus();
  });
}
