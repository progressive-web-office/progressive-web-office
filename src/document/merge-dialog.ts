/** "Mail merge…" dialog (DOC-036): what to make of the rows of the table. */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import type { MergeTable } from './merge';

export type MergeOutput = 'zip' | 'folder' | 'single';

export interface MergeChoice {
  output: MergeOutput;
  format: 'odt' | 'docx' | 'md';
  /** Field naming the files, if any. */
  nameField?: string;
}

export function chooseMerge(host: HTMLElement, fields: string[], table: MergeTable, source: string, canWriteFolder: boolean, format: MergeChoice['format']): Promise<MergeChoice | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog merge-dialog', 'aria-labelledby': 'merge-title' });
    const missing = fields.filter((f) => !table.fields.includes(f));
    const outputs: MergeOutput[] = ['zip', ...(canWriteFolder ? (['folder'] as const) : []), 'single'];
    const radios = outputs.map((o, i) => {
      const r = h('input', { type: 'radio', name: 'merge-output', value: o });
      r.checked = i === 0;
      return h('label', { class: 'check' }, r, ` ${t(`merge.out.${o}`)}`);
    });
    const fmt = h('select', {}, ...(['odt', 'docx', 'md'] as const).map((f) => h('option', { value: f }, `.${f}`)));
    fmt.value = format;
    const name = h('select', {}, h('option', { value: '' }, t('merge.nameNumber')), ...table.fields.map((f) => h('option', { value: f }, f)));
    name.value = table.fields.find((f) => /name|nom/i.test(f)) ?? table.fields[0] ?? '';
    const finish = (r: MergeChoice | null): void => {
      dialog.close();
      dialog.remove();
      resolve(r);
    };
    const output = (): MergeOutput => (dialog.querySelector<HTMLInputElement>('input[name="merge-output"]:checked')?.value as MergeOutput) ?? 'zip';
    dialog.append(
      h('h2', { id: 'merge-title' }, t('merge.title')),
      h('p', {}, t('merge.summary', { n: table.rows.length, source })),
      h('p', { class: 'hint' }, t('merge.fields', { fields: fields.join(', ') })),
      missing.length ? h('p', { class: 'hint merge-missing', role: 'alert' }, t('merge.missing', { fields: missing.join(', ') })) : '',
      h('fieldset', { class: 'merge-outputs' }, h('legend', {}, t('merge.output')), ...radios),
      h('label', { class: 'field' }, t('merge.format'), fmt),
      h('label', { class: 'field' }, t('merge.nameField'), name),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => finish(null)),
        Object.assign(button(t('merge.generate'), () => finish({ output: output(), format: fmt.value as MergeChoice['format'], ...(name.value ? { nameField: name.value } : {}) }), { className: 'primary' }), { disabled: !table.rows.length }),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector<HTMLInputElement>('input[name="merge-output"]')?.focus();
  });
}
