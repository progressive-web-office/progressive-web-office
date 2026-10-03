/** Template gallery (FILE-018): cards grouped by kind, then the examples. */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import type { UserTemplate } from '../storage/recent';
import { TEMPLATES, type Template } from './catalog';

/** A template kept in the open folder (FOLDER-020). */
export interface FolderTemplateChoice {
  name: string;
  path: string;
}

const GROUPS: [MessageKey, (tpl: Template) => boolean][] = [
  ['tpl.documents', (tpl) => tpl.kind === 'document' && !tpl.example],
  ['tpl.spreadsheets', (tpl) => tpl.kind === 'spreadsheet' && !tpl.example],
  ['tpl.presentations', (tpl) => tpl.kind === 'presentation' && !tpl.example],
  ['tpl.examples', (tpl) => !!tpl.example],
];

/**
 * Resolves to the chosen template, built-in or of the user (FILE-019), or
 * null when cancelled. `remove` deletes a template of the user. The templates
 * of the open folder (FOLDER-020), when given, come first.
 */
export function chooseTemplate(
  host: HTMLElement,
  mine: UserTemplate[] = [],
  remove?: (id: string) => Promise<void>,
  folder?: { label: string; items: FolderTemplateChoice[] },
): Promise<Template | UserTemplate | FolderTemplateChoice | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog template-dialog', 'aria-labelledby': 'tpl-title' });
    const finish = (tpl: Template | UserTemplate | FolderTemplateChoice | null): void => {
      dialog.close();
      dialog.remove();
      resolve(tpl);
    };
    const card = (tpl: Template): HTMLElement =>
      h(
        'li',
        {},
        button(t(tpl.name), () => finish(tpl), { className: 'template-card', icon: tpl.icon, title: t(tpl.description) }),
        h('p', { class: 'hint' }, t(tpl.description)),
      );
    const own = (tpl: UserTemplate): HTMLElement => {
      const li = h(
        'li',
        {},
        button(tpl.name, () => finish(tpl), { className: 'template-card', icon: '⭐', title: tpl.name }),
        h(
          'p',
          { class: 'hint' },
          `${tpl.format.toUpperCase()} · ${new Date(tpl.savedAt).toLocaleDateString()} `,
          remove
            ? button(t('tpl.delete', { name: tpl.name }), () => {
                if (!window.confirm(t('tpl.deleteConfirm', { name: tpl.name }))) return;
                void remove(tpl.id).then(() => li.remove());
              }, { text: '✕', className: 'link' })
            : '',
        ),
      );
      return li;
    };
    // The user's templates come first; while there are none, a hint at the end says how to make one.
    const mineSection = h(
      'section',
      { class: 'template-group', 'aria-label': t('tpl.mine') },
      h('h3', {}, t('tpl.mine')),
      mine.length ? h('ul', { class: 'template-list', role: 'list' }, ...mine.map(own)) : h('p', { class: 'hint' }, t('tpl.mineEmpty')),
    );
    const inFolder = (tpl: FolderTemplateChoice): HTMLElement =>
      h('li', {}, button(tpl.name, () => finish(tpl), { className: 'template-card', icon: '📁', title: tpl.path }), h('p', { class: 'hint' }, tpl.path));
    const folderSection = folder?.items.length
      ? [h('section', { class: 'template-group', 'aria-label': t('tpl.folder', { name: folder.label }) }, h('h3', {}, t('tpl.folder', { name: folder.label })), h('ul', { class: 'template-list', role: 'list' }, ...folder.items.map(inFolder)))]
      : [];
    dialog.append(
      h('h2', { id: 'tpl-title' }, t('tpl.title')),
      h('p', { class: 'hint' }, t('tpl.intro')),
      ...folderSection,
      ...(mine.length ? [mineSection] : []),
      ...GROUPS.flatMap(([label, keep]) => {
        const items = TEMPLATES.filter(keep);
        return items.length ? [h('section', { class: 'template-group', 'aria-label': t(label) }, h('h3', {}, t(label)), h('ul', { class: 'template-list', role: 'list' }, ...items.map(card)))] : [];
      }),
      ...(mine.length ? [] : [mineSection]),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null))),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector<HTMLButtonElement>('.template-card')?.focus();
  });
}
