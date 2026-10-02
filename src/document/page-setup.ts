/** Header and footer: dialog, on-screen preview and print CSS (DOC-024). */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { cleanPageSetup, formatPageNumber, PAGE_FIELDS, PAGE_NUMBER_FORMATS, zoneParts, type PageField, type PageNumberFormat, type PageSetup, type PageZones } from './model';

const ZONES = ['left', 'center', 'right'] as const;
const FIELD_LABEL: Record<PageField, MessageKey> = { page: 'hf.page', pages: 'hf.pages', title: 'hf.title', date: 'hf.date' };

/** A zone's text as shown on screen: fields replaced by examples (the first page's number, DOC-029). */
export function zonePreview(text: string, title: string, page?: PageSetup): string {
  const first = formatPageNumber(page?.startAt ?? 1, page?.numberFormat);
  return zoneParts(text)
    .map((p) => (typeof p === 'string' ? p : p.field === 'page' ? first : p.field === 'pages' ? '1' : p.field === 'title' ? title : new Date().toLocaleDateString()))
    .join('');
}

/** Ready-made page numbers for the footer centre (DOC-029). */
export const NUMBER_PRESETS = [
  { label: '1', value: '{page}' },
  { label: '1/10', value: '{page}/{pages}' },
  { label: '- 1 -', value: '- {page} -' },
] as const;

const cssString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ')}"`;

/** @page margin boxes printing the header and footer, with page counters. */
export function pageSetupCss(page: PageSetup | undefined, title: string): string {
  const setup = cleanPageSetup(page);
  if (!setup) return '';
  const boxes: string[] = [];
  const firstBoxes: string[] = [];
  // DOC-029: number style of the page counter.
  const style = setup.numberFormat ? `, ${setup.numberFormat}` : '';
  for (const [kind, edge] of [['header', 'top'], ['footer', 'bottom']] as const) {
    for (const zone of ZONES) {
      const text = setup[kind]?.[zone];
      if (!text) continue;
      const content = zoneParts(text)
        .map((p) => (typeof p === 'string' ? cssString(p) : p.field === 'page' ? `counter(page${style})` : p.field === 'pages' ? 'counter(pages)' : cssString(p.field === 'title' ? title : new Date().toLocaleDateString())))
        .join(' ');
      boxes.push(`@${edge}-${zone} { content: ${content}; font-family: Calibri, Carlito, sans-serif; font-size: 9pt; color: #444; }`);
      firstBoxes.push(`@${edge}-${zone} { content: none; }`);
    }
  }
  // The first page's number, and a title page without header and footer.
  const first = [setup.startAt !== undefined ? `counter-set: page ${setup.startAt};` : '', ...(setup.hideOnFirstPage ? firstBoxes : [])].filter(Boolean);
  return `@page { ${boxes.join(' ')} }${first.length ? ` @page :first { ${first.join(' ')} }` : ''}`;
}

export function editPageSetup(host: HTMLElement, initial: PageSetup | undefined): Promise<PageSetup | null> {
  return new Promise((resolve) => {
    const inputs = new Map<string, HTMLInputElement>();
    let last: HTMLInputElement | undefined;
    const row = (kind: 'header' | 'footer'): HTMLElement =>
      h(
        'fieldset',
        { class: 'hf-row' },
        h('legend', {}, t(kind === 'header' ? 'hf.header' : 'hf.footer')),
        ...ZONES.map((zone) => {
          const input = h('input', { type: 'text', value: initial?.[kind]?.[zone] ?? '', 'aria-label': `${t(kind === 'header' ? 'hf.header' : 'hf.footer')} — ${t(`hf.${zone}`)}`, placeholder: t(`hf.${zone}`) });
          input.addEventListener('focus', () => (last = input));
          inputs.set(`${kind}.${zone}`, input);
          return input;
        }),
      );
    const fields = h(
      'div',
      { class: 'hf-fields' },
      h('span', { class: 'hint' }, t('hf.insert')),
      ...PAGE_FIELDS.map((f) =>
        button(t(FIELD_LABEL[f]), () => {
          const input = last ?? inputs.get('footer.center')!;
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? start;
          input.value = `${input.value.slice(0, start)}{${f}}${input.value.slice(end)}`;
          input.focus();
          input.setSelectionRange(start + f.length + 2, start + f.length + 2);
        }),
      ),
    );
    // DOC-029: ready-made page numbers, their style, the first number, a title page.
    const presets = h(
      'div',
      { class: 'hf-fields' },
      h('span', { class: 'hint' }, t('hf.presets')),
      ...[...NUMBER_PRESETS.map((p) => ({ label: p.label, value: p.value })), { label: t('hf.pageOfPagesLabel'), value: t('hf.pageOfPagesValue') }].map((p) =>
        button(p.label, () => {
          inputs.get('footer.center')!.value = p.value;
        }, { title: t('hf.presetTitle', { example: p.label }) }),
      ),
    );
    const format = h('select', { 'aria-label': t('hf.numberFormat') }, ...PAGE_NUMBER_FORMATS.map((f) => h('option', { value: f }, t(`hf.format.${f}`))));
    format.value = initial?.numberFormat ?? 'decimal';
    const start = h('input', { type: 'number', min: '0', step: '1', value: String(initial?.startAt ?? 1), 'aria-label': t('hf.startAt'), class: 'hf-start' });
    const hideFirst = h('input', { type: 'checkbox' });
    hideFirst.checked = !!initial?.hideOnFirstPage;
    const numbering = h(
      'fieldset',
      { class: 'hf-numbering' },
      h('legend', {}, t('hf.numbering')),
      h('label', { class: 'field' }, `${t('hf.numberFormat')} `, format),
      h('label', { class: 'field' }, `${t('hf.startAt')} `, start),
      h('label', { class: 'check' }, hideFirst, ` ${t('hf.hideOnFirstPage')}`),
    );
    const dialog = h('dialog', { class: 'dialog hf-dialog', 'aria-labelledby': 'hf-title' });
    const finish = (ok: boolean): void => {
      dialog.close();
      dialog.remove();
      if (!ok) return resolve(null);
      const zones = (kind: 'header' | 'footer'): PageZones => Object.fromEntries(ZONES.map((z) => [z, inputs.get(`${kind}.${z}`)!.value]));
      const first = Math.round(Number(start.value));
      resolve(
        cleanPageSetup({
          header: zones('header'),
          footer: zones('footer'),
          numberFormat: format.value as PageNumberFormat,
          ...(Number.isFinite(first) && first >= 0 ? { startAt: first } : {}),
          hideOnFirstPage: hideFirst.checked,
        }) ?? {},
      );
    };
    dialog.append(
      h('h2', { id: 'hf-title' }, t('hf.title_')),
      row('header'),
      row('footer'),
      fields,
      presets,
      numbering,
      h('p', { class: 'hint' }, t('hf.hint')),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(t('common.ok'), () => finish(true), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTimeout(() => inputs.get('header.left')!.focus(), 0);
  });
}
