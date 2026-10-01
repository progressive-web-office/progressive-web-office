/** Paragraph spacing dialog (DOC-020): indents in cm, spacing in points, line spacing. */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import type { ParagraphLayout } from './model';

const CM = 72 / 2.54;
const round = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;

export const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];

export function editParagraphLayout(host: HTMLElement, initial: ParagraphLayout): Promise<ParagraphLayout | null> {
  return new Promise((resolve) => {
    const num = (label: string, value: number | undefined, unit: string, step: string, min?: string): HTMLInputElement =>
      h('input', { type: 'number', step, ...(min !== undefined ? { min } : {}), value: value === undefined ? '' : String(value), 'aria-label': `${label} (${unit})`, placeholder: '—' });
    const indent = num(t('para.indent'), initial.indent ? round(initial.indent / CM) : undefined, 'cm', '0.1', '0');
    const firstLine = num(t('para.firstLine'), initial.firstLine ? round(initial.firstLine / CM) : undefined, 'cm', '0.1');
    const before = num(t('para.spaceBefore'), initial.spaceBefore, 'pt', '1', '0');
    const after = num(t('para.spaceAfter'), initial.spaceAfter, 'pt', '1', '0');
    const line = h(
      'select',
      { 'aria-label': t('para.lineSpacing') },
      h('option', { value: '' }, t('para.default')),
      ...LINE_SPACINGS.map((v) => h('option', { value: String(v), selected: initial.lineHeight === v }, String(v))),
    );
    if (initial.lineHeight && !LINE_SPACINGS.includes(initial.lineHeight)) line.append(h('option', { value: String(initial.lineHeight), selected: true }, String(initial.lineHeight)));
    const dialog = h('dialog', { class: 'dialog para-dialog', 'aria-labelledby': 'para-title' });
    const finish = (ok: boolean): void => {
      dialog.close();
      dialog.remove();
      if (!ok) return resolve(null);
      const value = (el: HTMLInputElement, factor = 1): number | undefined => (el.value.trim() === '' || !Number.isFinite(Number(el.value)) ? undefined : round(Number(el.value) * factor, 1));
      const out: ParagraphLayout = {};
      const i = value(indent, CM);
      const f = value(firstLine, CM);
      const b = value(before);
      const a = value(after);
      if (i) out.indent = i;
      if (f) out.firstLine = f;
      if (b !== undefined) out.spaceBefore = b;
      if (a !== undefined) out.spaceAfter = a;
      if (line.value) out.lineHeight = Number(line.value);
      resolve(out);
    };
    const row = (label: string, input: HTMLElement, unit: string): HTMLElement => h('label', { class: 'para-row' }, h('span', {}, label), input, h('span', { class: 'hint' }, unit));
    dialog.append(
      h('h2', { id: 'para-title' }, t('para.title')),
      h('fieldset', {}, h('legend', {}, t('para.indentation')), row(t('para.indent'), indent, 'cm'), row(t('para.firstLine'), firstLine, t('para.firstLineHint'))),
      h('fieldset', {}, h('legend', {}, t('para.spacing')), row(t('para.spaceBefore'), before, 'pt'), row(t('para.spaceAfter'), after, 'pt'), row(t('para.lineSpacing'), line, '×')),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(t('common.ok'), () => finish(true), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).localName === 'input') {
        e.preventDefault();
        finish(true);
      }
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTimeout(() => indent.focus(), 0);
  });
}
