/** Alternative text and caption of a picture (IMG-003). */
import { button, h } from '../app/dom';
import { t } from '../i18n';

export interface PictureChoice {
  /** null: no alternative text yet; '': decorative. */
  alt: string | null;
  /** A caption to add below, numbered as a figure; '' for none. */
  caption: string;
}

export function editPicture(host: HTMLElement, initial: { alt: string | null; src?: string; withCaption: boolean }): Promise<PictureChoice | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog picture-dialog', 'aria-labelledby': 'picture-title' });
    const alt = h('textarea', { rows: '3', 'aria-describedby': 'picture-alt-hint' });
    alt.value = initial.alt ?? '';
    const decorative = h('input', { type: 'checkbox' });
    decorative.checked = initial.alt === '';
    const sync = (): void => {
      alt.disabled = decorative.checked;
    };
    decorative.addEventListener('change', sync);
    sync();
    const caption = h('input', { type: 'text', placeholder: t('xref.captionPlaceholder') });
    const finish = (choice: PictureChoice | null): void => {
      dialog.close();
      dialog.remove();
      resolve(choice);
    };
    const ok = (): void => finish({ alt: decorative.checked ? '' : alt.value.trim() || null, caption: caption.value.trim() });
    dialog.append(
      h('h2', { id: 'picture-title' }, t('picture.title')),
      initial.src ? h('img', { src: initial.src, alt: '', class: 'picture-preview' }) : '',
      h('label', { class: 'field' }, t('picture.alt'), alt),
      h('p', { id: 'picture-alt-hint', class: 'hint' }, t('picture.altHint')),
      h('label', { class: 'check' }, decorative, ` ${t('picture.decorative')}`),
      initial.withCaption ? h('label', { class: 'field' }, t('picture.caption'), caption) : '',
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), button(t('common.ok'), ok, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    alt.focus();
  });
}
