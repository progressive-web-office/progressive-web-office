/** "Random variants…" dialog (TEACH-002). */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import type { Definition } from './variants';

export interface VariantsChoice {
  count: number;
  format: 'odt' | 'docx' | 'md';
  seed: number;
  keys: boolean;
}

export function chooseVariants(host: HTMLElement, defs: Definition[], hasSolutions: boolean): Promise<VariantsChoice | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog variants-dialog', 'aria-labelledby': 'variants-title' });
    const count = h('input', { type: 'number', min: '1', max: '200', value: '10' });
    const format = h('select', {}, ...(['odt', 'docx', 'md'] as const).map((f) => h('option', { value: f }, `.${f}`)));
    const seed = h('input', { type: 'number', min: '0', value: String(Math.floor(Math.random() * 100000)) });
    const keys = h('input', { type: 'checkbox' });
    keys.checked = hasSolutions;
    keys.disabled = !hasSolutions;
    const finish = (r: VariantsChoice | null): void => {
      dialog.close();
      dialog.remove();
      resolve(r);
    };
    dialog.append(
      h('h2', { id: 'variants-title' }, t('variants.title')),
      h('p', { class: 'hint' }, t('variants.found', { names: defs.map((d) => `${d.name} = ${d.source}`).join(' ; ') })),
      h('label', { class: 'field' }, t('variants.count'), count),
      h('label', { class: 'field' }, t('variants.format'), format),
      h('label', { class: 'field' }, t('variants.seed'), seed),
      h('p', { class: 'hint' }, t('variants.seedHint')),
      h('label', { class: 'check' }, keys, ` ${t('variants.keys')}`),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => finish(null)),
        button(t('variants.generate'), () => finish({ count: Math.max(1, Math.min(200, Number(count.value) || 1)), format: format.value as VariantsChoice['format'], seed: Number(seed.value) || 0, keys: keys.checked }), { className: 'primary' }),
      ),
    );
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
