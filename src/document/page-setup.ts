/** Header and footer: dialog, on-screen preview and print CSS (DOC-024). */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { cleanPageSetup, PAGE_FIELDS, zoneParts, type PageField, type PageSetup, type PageZones } from './model';

const ZONES = ['left', 'center', 'right'] as const;
const FIELD_LABEL: Record<PageField, MessageKey> = { page: 'hf.page', pages: 'hf.pages', title: 'hf.title', date: 'hf.date' };

/** A zone's text as shown on screen: fields replaced by examples. */
export function zonePreview(text: string, title: string): string {
  return zoneParts(text)
    .map((p) => (typeof p === 'string' ? p : p.field === 'page' ? '1' : p.field === 'pages' ? '1' : p.field === 'title' ? title : new Date().toLocaleDateString()))
    .join('');
}

const cssString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ')}"`;

/** @page margin boxes printing the header and footer, with page counters. */
export function pageSetupCss(page: PageSetup | undefined, title: string): string {
  const setup = cleanPageSetup(page);
  if (!setup) return '';
  const boxes: string[] = [];
  for (const [kind, edge] of [['header', 'top'], ['footer', 'bottom']] as const) {
    for (const zone of ZONES) {
      const text = setup[kind]?.[zone];
      if (!text) continue;
      const content = zoneParts(text)
        .map((p) => (typeof p === 'string' ? cssString(p) : p.field === 'page' ? 'counter(page)' : p.field === 'pages' ? 'counter(pages)' : cssString(p.field === 'title' ? title : new Date().toLocaleDateString())))
        .join(' ');
      boxes.push(`@${edge}-${zone} { content: ${content}; font-family: Calibri, Carlito, sans-serif; font-size: 9pt; color: #444; }`);
    }
  }
  return `@page { ${boxes.join(' ')} }`;
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
      button(t('hf.pageOfPages'), () => {
        inputs.get('footer.center')!.value = t('hf.pageOfPagesValue');
      }),
    );
    const dialog = h('dialog', { class: 'dialog hf-dialog', 'aria-labelledby': 'hf-title' });
    const finish = (ok: boolean): void => {
      dialog.close();
      dialog.remove();
      if (!ok) return resolve(null);
      const zones = (kind: 'header' | 'footer'): PageZones => Object.fromEntries(ZONES.map((z) => [z, inputs.get(`${kind}.${z}`)!.value]));
      resolve(cleanPageSetup({ header: zones('header'), footer: zones('footer') }) ?? {});
    };
    dialog.append(
      h('h2', { id: 'hf-title' }, t('hf.title_')),
      row('header'),
      row('footer'),
      fields,
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
