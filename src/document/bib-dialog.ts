/**
 * Bibliography dialogs (DOC-027): the document's sources (BibTeX import,
 * citation style) and the choice of what a citation cites.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { entrySummary, parseBibtex, type BibEntry } from './bibliography';
import type { CiteRun, References } from './model';

function modal(host: HTMLElement, dialog: HTMLDialogElement, focus: () => HTMLElement | null): void {
  host.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  setTimeout(() => focus()?.focus(), 0);
}

export interface ReferencesChoice {
  references: References;
  /** Insert the list of references at the cursor. */
  insertList: boolean;
}

/** Add BibTeX entries; an entry with the same key replaces the old one. */
export function mergeEntries(entries: BibEntry[], added: BibEntry[]): BibEntry[] {
  const keys = new Set(added.map((e) => e.key));
  return [...entries.filter((e) => !keys.has(e.key)), ...added];
}

/** The document's sources: import or paste BibTeX, remove entries, choose the citation style. */
export function manageReferences(host: HTMLElement, current: References | undefined, cited: Set<string>): Promise<ReferencesChoice | null> {
  return new Promise((resolve) => {
    let entries = [...(current?.entries ?? [])];
    const list = h('ul', { class: 'bib-entries', 'aria-label': t('bib.sources') });
    const count = h('p', { class: 'hint', 'aria-live': 'polite' });
    const render = (): void => {
      list.replaceChildren(
        ...entries.map((e) =>
          h(
            'li',
            {},
            h('span', { class: 'bib-key' }, e.key),
            ' ',
            h('span', {}, entrySummary(e)),
            cited.has(e.key) ? h('span', { class: 'bib-cited', title: t('bib.citedTitle') }, ` ${t('bib.cited')}`) : '',
            button(
              t('bib.remove', { key: e.key }),
              () => {
                entries = entries.filter((x) => x !== e);
                render();
              },
              { text: '✕', className: 'bib-remove' },
            ),
          ),
        ),
      );
      count.textContent = entries.length ? t('bib.count', { n: entries.length }) : t('bib.noSources');
    };
    const paste = h('textarea', { class: 'bib-paste', rows: '4', 'aria-label': t('bib.paste'), placeholder: '@article{key, author = {…}, title = {…}, year = {…}}', spellcheck: 'false' });
    const error = h('p', { class: 'error', role: 'alert' });
    const add = (text: string): void => {
      const added = parseBibtex(text);
      error.textContent = added.length ? '' : t('bib.nothingFound');
      if (!added.length) return;
      entries = mergeEntries(entries, added);
      render();
    };
    const file = h('input', { type: 'file', accept: '.bib,.bibtex,text/x-bibtex,text/plain', hidden: true, 'aria-label': t('bib.importFile') });
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f) void f.text().then(add);
      file.value = '';
    });
    const style = h('select', { 'aria-label': t('bib.style') }, h('option', { value: 'numeric' }, t('bib.numeric')), h('option', { value: 'author-year' }, t('bib.authorYear')));
    style.value = current?.style ?? 'numeric';
    const dialog = h('dialog', { class: 'dialog bib-dialog', 'aria-labelledby': 'bib-title' });
    const finish = (ok: boolean, insertList = false): void => {
      dialog.close();
      dialog.remove();
      const refs: References = { entries, ...(style.value === 'author-year' ? { style: 'author-year' as const } : {}) };
      resolve(ok ? { references: refs, insertList } : null);
    };
    dialog.append(
      h('h2', { id: 'bib-title' }, t('bib.title_')),
      count,
      list,
      h(
        'div',
        { class: 'bib-import' },
        button(t('bib.importFile'), () => file.click()),
        file,
        // BIB-010: a collection of the Zotero library.
        button(t('zotero.importButton'), () =>
          void import('./zotero').then(async ({ pickFromZotero }) => {
            const added = await pickFromZotero(host, 'collection');
            if (added?.length) {
              entries = mergeEntries(entries, added);
              render();
            }
          }),
        ),
      ),
      paste,
      h('div', { class: 'bib-import' }, button(t('bib.add'), () => add(paste.value))),
      error,
      h('label', { class: 'field' }, `${t('bib.style')} `, style),
      h('p', { class: 'hint' }, t('bib.hint')),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => finish(false)),
        button(t('bib.insertList'), () => finish(true, true)),
        button(t('common.ok'), () => finish(true), { className: 'primary' }),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    render();
    modal(host, dialog, () => dialog.querySelector('button'));
  });
}

/** Choose the sources of a citation and its page; no source removes the citation. */
export function pickCitation(host: HTMLElement, entries: BibEntry[], initial?: CiteRun): Promise<CiteRun | null | 'remove' | 'zotero'> {
  return new Promise((resolve) => {
    const chosen = new Set(initial?.cite ?? []);
    const search = h('input', { type: 'search', 'aria-label': t('bib.search'), placeholder: t('bib.search') });
    const list = h('ul', { class: 'bib-choices', 'aria-label': t('bib.sources') });
    const render = (): void => {
      const q = search.value.trim().toLowerCase();
      const shown = entries.filter((e) => !q || `${e.key} ${entrySummary(e)} ${e.fields.author ?? ''}`.toLowerCase().includes(q));
      list.replaceChildren(
        ...shown.map((e) => {
          const box = h('input', { type: 'checkbox', value: e.key });
          box.checked = chosen.has(e.key);
          box.addEventListener('change', () => (box.checked ? chosen.add(e.key) : chosen.delete(e.key)));
          return h('li', {}, h('label', { class: 'check' }, box, ` ${entrySummary(e)}`));
        }),
      );
    };
    search.addEventListener('input', render);
    const locator = h('input', { type: 'text', 'aria-label': t('bib.locator'), placeholder: t('bib.locatorPlaceholder') });
    locator.value = initial?.locator ?? '';
    const dialog = h('dialog', { class: 'dialog cite-dialog', 'aria-labelledby': 'cite-title' });
    const finish = (ok: boolean | 'zotero'): void => {
      dialog.close();
      dialog.remove();
      if (ok === 'zotero') return resolve('zotero');
      if (!ok) return resolve(null);
      // Keep the order of the list, for stable citations.
      const keys = [...(initial?.cite ?? []).filter((k) => chosen.has(k)), ...entries.map((e) => e.key).filter((k) => chosen.has(k) && !initial?.cite.includes(k))];
      if (!keys.length) return resolve(initial ? 'remove' : null);
      const loc = locator.value.trim();
      resolve(loc ? { cite: keys, locator: loc } : { cite: keys });
    };
    dialog.append(
      h('h2', { id: 'cite-title' }, initial ? t('bib.editCite') : t('bib.cite')),
      ...(entries.length ? [search, list, locator] : [h('p', { class: 'hint' }, t('bib.noSourcesHint'))]),
      // BIB-010: or from the Zotero library.
      h('div', { class: 'dialog-actions' }, button(t('zotero.button'), () => finish('zotero'), { title: t('zotero.searchTitle') }), button(t('common.cancel'), () => finish(false)), button(t('common.ok'), () => finish(true), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = list.querySelector<HTMLInputElement>('input[type=checkbox]');
        if (first && !chosen.size) chosen.add(first.value);
        finish(true);
      }
    });
    render();
    modal(host, dialog, () => (entries.length ? search : dialog.querySelector('button.primary')));
  });
}
