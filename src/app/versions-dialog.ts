/** The versions of a document kept in the browser (FILE-025). */
import { button, h } from './dom';
import { t } from '../i18n';
import type { VersionEntry } from '../storage/recent';

export interface VersionChoice {
  action: 'save' | 'open' | 'download' | 'delete' | 'compare';
  version?: VersionEntry;
  label?: string;
}

const size = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} kB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function chooseVersion(host: HTMLElement, name: string, versions: VersionEntry[]): Promise<VersionChoice | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog versions-dialog', 'aria-labelledby': 'versions-title' });
    const finish = (c: VersionChoice | null): void => {
      dialog.close();
      dialog.remove();
      resolve(c);
    };
    const label = h('input', { type: 'text', placeholder: t('versions.labelPlaceholder'), 'aria-label': t('versions.label') });
    const rows = versions.map((v) =>
      h(
        'li',
        {},
        h('span', { class: 'version-when' }, new Date(v.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })),
        v.label ? h('strong', { class: 'version-label' }, v.label) : '',
        h('small', {}, `${v.format.toUpperCase()} · ${size(v.size)}`),
        h(
          'span',
          { class: 'version-actions' },
          button(t('versions.open'), () => finish({ action: 'open', version: v })),
          // VER-001: what changed since this version.
          button(t('versions.compare'), () => finish({ action: 'compare', version: v })),
          button(t('versions.download'), () => finish({ action: 'download', version: v }), { text: '⬇', className: 'icon' }),
          button(t('comment.delete'), () => {
            if (window.confirm(t('versions.deleteConfirm'))) finish({ action: 'delete', version: v });
          }, { text: '✕', className: 'icon' }),
        ),
      ),
    );
    dialog.append(
      h('h2', { id: 'versions-title' }, t('versions.heading', { name })),
      h('p', { class: 'hint' }, t('versions.hint')),
      h('div', { class: 'version-new' }, label, button(t('versions.saveNow'), () => finish({ action: 'save', label: label.value.trim() }), { className: 'primary' })),
      versions.length ? h('ul', { class: 'version-list' }, ...rows) : h('p', { class: 'hint' }, t('versions.none')),
      h('div', { class: 'dialog-actions' }, button(t('common.close'), () => finish(null))),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    label.focus();
  });
}
