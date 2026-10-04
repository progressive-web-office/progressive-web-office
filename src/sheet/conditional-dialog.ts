/** "Conditional formatting…" dialog of the spreadsheet (SHEET-029). */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { VALIDATION_OPS, type ValidationOp } from './validation';
import type { CondKind, CondRule, CondStyle, ConditionalFormat } from './conditional';

/** Looks to choose from, as in other spreadsheets. */
const PRESETS: { key: string; style: CondStyle }[] = [
  { key: 'red', style: { fill: '#ffc7ce', color: '#9c0006' } },
  { key: 'yellow', style: { fill: '#ffeb9c', color: '#9c5700' } },
  { key: 'green', style: { fill: '#c6efce', color: '#006100' } },
  { key: 'bold', style: { bold: true } },
  { key: 'redText', style: { color: '#c00000' } },
];

const KINDS: CondKind[] = ['cellIs', 'containsText', 'duplicate', 'unique', 'aboveAverage', 'belowAverage', 'top', 'bottom', 'colorScale', 'dataBar'];

const swatch = (style: CondStyle): HTMLElement =>
  h(
    'span',
    {
      class: 'cf-swatch',
      style: `${style.fill ? `background:${style.fill};` : ''}${style.color ? `color:${style.color};` : ''}${style.bold ? 'font-weight:bold;' : ''}${style.italic ? 'font-style:italic;' : ''}${style.underline ? 'text-decoration:underline;' : ''}`,
    },
    'AaBb 123',
  );

/** The rule in words, for the list of the formats of the selection. */
export function describeCondRule(rule: CondRule): string {
  const op = (o: ValidationOp): string => t(`validation.op.${o}` as MessageKey);
  const show = (v: number | string): string => (typeof v === 'string' ? `“${v}”` : String(v));
  switch (rule.kind) {
    case 'cellIs':
      return rule.op === 'between' || rule.op === 'notBetween'
        ? t('cf.rule.between', { op: op(rule.op), a: show(rule.a), b: show(rule.b ?? rule.a) })
        : t('cf.rule.compare', { op: op(rule.op), a: show(rule.a) });
    case 'containsText':
      return t('cf.rule.contains', { text: rule.text });
    case 'top':
    case 'bottom':
      return t(`cf.rule.${rule.kind}${rule.percent ? 'Percent' : ''}` as MessageKey, { n: rule.rank });
    default:
      return t(`cf.kind.${rule.kind}` as MessageKey);
  }
}

export interface CondChoice {
  /** The rule to add to the selection. */
  add?: CondRule;
  /** The indexes of the formats to remove. */
  remove: number[];
}

/** Add a format to the selection, or remove the ones it has; null when cancelled. */
export function chooseConditional(host: HTMLElement, rangeLabel: string, existing: { index: number; format: ConditionalFormat; where: string }[]): Promise<CondChoice | null> {
  return new Promise((resolve) => {
    const remove = new Set<number>();
    const kind = h('select', {}, ...KINDS.map((k) => h('option', { value: k }, t(`cf.kind.${k}` as MessageKey))));
    const op = h('select', {}, ...VALIDATION_OPS.map((o) => h('option', { value: o }, t(`validation.op.${o}` as MessageKey))));
    op.value = 'greaterThan';
    const a = h('input', { type: 'text', inputmode: 'decimal' });
    const b = h('input', { type: 'text', inputmode: 'decimal' });
    const text = h('input', { type: 'text' });
    const rank = h('input', { type: 'number', min: '1', value: '10' });
    const percent = h('input', { type: 'checkbox' });
    const low = h('input', { type: 'color', value: '#f8696b' });
    const mid = h('input', { type: 'color', value: '#ffeb84' });
    const high = h('input', { type: 'color', value: '#63be7b' });
    const three = h('input', { type: 'checkbox', checked: true });
    const bar = h('input', { type: 'color', value: '#638ec6' });
    const preset = h('select', {}, ...PRESETS.map((p) => h('option', { value: p.key }, t(`cf.preset.${p.key}` as MessageKey))), h('option', { value: 'custom' }, t('cf.preset.custom')));
    const fill = h('input', { type: 'color', value: '#ffc7ce' });
    const useFill = h('input', { type: 'checkbox', checked: true });
    const color = h('input', { type: 'color', value: '#9c0006' });
    const useColor = h('input', { type: 'checkbox', checked: true });
    const bold = h('input', { type: 'checkbox' });
    const italic = h('input', { type: 'checkbox' });
    const preview = h('span', { class: 'cf-preview' });
    const problem = h('p', { class: 'error', role: 'alert', hidden: '' });

    const field = (label: MessageKey, control: HTMLElement): HTMLElement => h('label', { class: 'field' }, t(label), control);
    const check = (control: HTMLInputElement, label: MessageKey): HTMLElement => h('label', { class: 'check' }, control, ` ${t(label)}`);
    const bLabel = h('label', { class: 'field' }, t('validation.max'), b);
    const aLabel = h('span', {}, t('validation.value'));
    const comparePart = h('div', { class: 'cf-row' }, field('validation.op', op), h('label', { class: 'field' }, aLabel, a), bLabel);
    const textPart = field('cf.text', text);
    const rankPart = h('div', { class: 'cf-row' }, field('cf.rank', rank), check(percent, 'cf.percent'));
    const midLabel = h('label', { class: 'field' }, t('cf.middle'), mid);
    const scalePart = h('div', {}, h('div', { class: 'cf-row' }, h('label', { class: 'field' }, t('cf.lowest'), low), midLabel, h('label', { class: 'field' }, t('cf.highest'), high)), check(three, 'cf.threeColours'));
    const barPart = field('cf.barColour', bar);
    const customPart = h('div', { class: 'cf-row' }, h('label', { class: 'check' }, useFill, ` ${t('cf.fill')} `, fill), h('label', { class: 'check' }, useColor, ` ${t('cf.textColour')} `, color), check(bold, 'cf.bold'), check(italic, 'cf.italic'));
    const stylePart = h('fieldset', { class: 'cf-style' }, h('legend', {}, t('cf.look')), h('div', { class: 'cf-row' }, preset, preview), customPart);

    const style = (): CondStyle => {
      const p = PRESETS.find((x) => x.key === preset.value);
      if (p) return p.style;
      const s: CondStyle = {};
      if (useFill.checked) s.fill = fill.value;
      if (useColor.checked) s.color = color.value;
      if (bold.checked) s.bold = true;
      if (italic.checked) s.italic = true;
      return s;
    };
    const sync = (): void => {
      const k = kind.value as CondKind;
      comparePart.hidden = k !== 'cellIs';
      textPart.hidden = k !== 'containsText';
      rankPart.hidden = k !== 'top' && k !== 'bottom';
      scalePart.hidden = k !== 'colorScale';
      barPart.hidden = k !== 'dataBar';
      stylePart.hidden = k === 'colorScale' || k === 'dataBar';
      customPart.hidden = preset.value !== 'custom';
      midLabel.hidden = !three.checked;
      const two = op.value === 'between' || op.value === 'notBetween';
      bLabel.hidden = !two;
      aLabel.textContent = t(two ? 'validation.min' : 'validation.value');
      preview.replaceChildren(swatch(style()));
    };
    for (const el of [kind, op, preset, three, fill, useFill, color, useColor, bold, italic]) el.addEventListener(el instanceof HTMLSelectElement ? 'change' : 'input', sync);
    sync();

    // A number when it reads as one, else a text.
    const value = (input: HTMLInputElement): number | string | undefined => {
      const v = input.value.trim();
      if (!v) return undefined;
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) ? n : v;
    };
    const build = (): CondRule | string => {
      const k = kind.value as CondKind;
      switch (k) {
        case 'cellIs': {
          const o = op.value as ValidationOp;
          const two = o === 'between' || o === 'notBetween';
          const av = value(a);
          const bv = two ? value(b) : undefined;
          if (av === undefined || (two && bv === undefined)) return t('validation.needValues');
          return { kind: 'cellIs', op: o, a: av, ...(two ? { b: bv } : {}), style: style() };
        }
        case 'containsText':
          return text.value ? { kind: 'containsText', text: text.value, style: style() } : t('cf.needText');
        case 'top':
        case 'bottom': {
          const n = Math.round(Number(rank.value));
          return n >= 1 ? { kind: k, rank: n, ...(percent.checked ? { percent: true } : {}), style: style() } : t('validation.needValues');
        }
        case 'colorScale':
          return { kind: 'colorScale', colors: three.checked ? [low.value, mid.value, high.value] : [low.value, high.value] };
        case 'dataBar':
          return { kind: 'dataBar', color: bar.value };
        default:
          return { kind: k, style: style() };
      }
    };

    const list = h(
      'ul',
      { class: 'cf-list' },
      ...existing.map(({ index, format, where }) => {
        const li = h('li', {}, 'style' in format.rule ? swatch(format.rule.style) : h('span', { class: 'cf-swatch', style: format.rule.kind === 'dataBar' ? `background: linear-gradient(to right, ${format.rule.color} 60%, transparent 60%)` : `background: linear-gradient(to right, ${format.rule.colors.join(', ')})` }, ' '), h('span', {}, `${describeCondRule(format.rule)} — ${where}`));
        li.append(
          button(t('cf.delete'), () => {
            remove.add(index);
            li.remove();
            if (!list.children.length) existingPart.hidden = true;
          }),
        );
        return li;
      }),
    );
    const existingPart = h('div', { hidden: existing.length ? undefined : '' }, h('h3', {}, t('cf.existing')), list);

    const dialog = h('dialog', { class: 'dialog cf-dialog', 'aria-labelledby': 'cf-title' });
    const finish = (result: CondChoice | null): void => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    const add = (): void => {
      const rule = build();
      if (typeof rule === 'string') {
        problem.textContent = rule;
        problem.hidden = false;
        return;
      }
      finish({ add: rule, remove: [...remove] });
    };
    dialog.append(
      h('h2', { id: 'cf-title' }, t('cf.title')),
      h('p', { class: 'hint' }, t('validation.range', { range: rangeLabel })),
      existingPart,
      h('h3', {}, t('cf.new')),
      field('cf.when', kind),
      comparePart,
      textPart,
      rankPart,
      scalePart,
      barPart,
      stylePart,
      problem,
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => finish(null)),
        existing.length ? button(t('cf.saveRemovals'), () => finish({ remove: [...remove] })) : null,
        button(t('cf.add'), add, { className: 'primary' }),
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
