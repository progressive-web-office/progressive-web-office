/** The accessibility check of a document, with a way to each issue (DOC-030). */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import type { Issue } from './a11y';

const MESSAGES: Record<Issue['kind'], MessageKey> = {
  alt: 'a11y.alt',
  altFileName: 'a11y.altFileName',
  headingSkip: 'a11y.headingSkip',
  headingEmpty: 'a11y.headingEmpty',
  tableHeader: 'a11y.tableHeader',
  linkText: 'a11y.linkText',
  contrast: 'a11y.contrast',
  title: 'a11y.title',
  language: 'a11y.language',
};

/** Resolves to the issue to show or fix, or null when closed. */
export function showAccessibility(host: HTMLElement, issues: Issue[]): Promise<{ issue: Issue; fix: boolean } | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog a11y-dialog', 'aria-labelledby': 'a11y-title' });
    const finish = (r: { issue: Issue; fix: boolean } | null): void => {
      dialog.close();
      dialog.remove();
      resolve(r);
    };
    const item = (issue: Issue): HTMLElement =>
      h(
        'li',
        {},
        h('span', {}, t(MESSAGES[issue.kind], { detail: issue.detail ?? '' })),
        ' ',
        issue.pos !== undefined ? button(t('a11y.show'), () => finish({ issue, fix: false }), { className: 'link' }) : '',
        issue.kind === 'alt' || issue.kind === 'altFileName' || issue.kind === 'title' || issue.kind === 'language' || issue.kind === 'tableHeader'
          ? button(t('a11y.fix'), () => finish({ issue, fix: true }), { className: 'link' })
          : '',
      );
    dialog.append(
      h('h2', { id: 'a11y-title' }, t('a11y.heading')),
      issues.length ? h('p', {}, t('a11y.found', { n: issues.length })) : h('p', { role: 'status' }, `✅ ${t('a11y.none')}`),
      issues.length ? h('ul', { class: 'a11y-list' }, ...issues.map(item)) : '',
      h('p', { class: 'hint' }, t('a11y.hint')),
      h('div', { class: 'dialog-actions' }, button(t('common.close'), () => finish(null), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector<HTMLButtonElement>('button')?.focus();
  });
}
