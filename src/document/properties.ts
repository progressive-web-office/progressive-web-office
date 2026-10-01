/** "Document properties" dialog (DOC-017). */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { cleanMeta, META_FIELDS, type DocumentMeta } from './model';

const LABELS: Record<(typeof META_FIELDS)[number], MessageKey> = {
  title: 'meta.title',
  author: 'meta.author',
  date: 'meta.date',
  subject: 'meta.subject',
  description: 'meta.description',
  keywords: 'meta.keywords',
  language: 'meta.language',
  license: 'meta.license',
};

const HINTS: Partial<Record<(typeof META_FIELDS)[number], MessageKey>> = {
  date: 'meta.dateHint',
  keywords: 'meta.keywordsHint',
  language: 'meta.languageHint',
  license: 'meta.licenseHint',
};

/** Resolves to the new properties, or null when cancelled. */
export function editProperties(host: HTMLElement, meta: DocumentMeta): Promise<DocumentMeta | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog properties-dialog', 'aria-labelledby': 'props-title' });
    const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
    const form = h('form', { class: 'properties-form' });
    for (const field of META_FIELDS) {
      const value = field === 'keywords' ? (meta.keywords ?? []).join(', ') : (meta[field] ?? '');
      const id = `prop-${field}`;
      const input = field === 'description' ? h('textarea', { id, rows: 3 }) : h('input', { id, type: 'text', spellcheck: field === 'title' || field === 'subject' ? 'true' : 'false' });
      input.value = value;
      inputs.set(field, input);
      const hint = HINTS[field];
      form.append(h('label', { for: id }, t(LABELS[field])), input, hint ? h('small', { class: 'hint' }, t(hint)) : h('span'));
    }
    const finish = (value: DocumentMeta | null): void => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const save = (): void => {
      const get = (f: string): string => inputs.get(f)!.value;
      finish(
        cleanMeta({
          title: get('title'),
          author: get('author'),
          date: get('date'),
          subject: get('subject'),
          description: get('description'),
          keywords: get('keywords').split(','),
          language: get('language'),
          license: get('license'),
        }),
      );
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });
    dialog.append(
      h('h2', { id: 'props-title' }, t('meta.dialogTitle')),
      h('p', { class: 'hint' }, t('meta.intro')),
      form,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), button(t('common.ok'), save, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    inputs.get('title')?.focus();
  });
}
