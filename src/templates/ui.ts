/**
 * Template gallery (FILE-018): one kind at a time behind tabs — progressive
 * disclosure — and a search through all of them.
 */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import type { UserTemplate } from '../storage/recent';
import { TEMPLATES, type Template } from './catalog';
import type { SourceTemplate, TemplateSource } from './sources';

/** A template kept in the open folder (FOLDER-020). */
export interface FolderTemplateChoice {
  name: string;
  path: string;
}

/** FILE-030: a template of a repository or a cloud folder. */
export interface SourceTemplateChoice {
  source: TemplateSource;
  template: SourceTemplate;
}

/** FILE-030: the repositories and cloud folders of templates, and how to manage them. */
export interface TemplateSources {
  list: TemplateSource[];
  load(source: TemplateSource): Promise<SourceTemplate[]>;
  add(): Promise<TemplateSource | null>;
  remove(source: TemplateSource): void;
}

/** Each kind, its tab and the emoji of the tab. */
const GROUPS: [MessageKey, string, (tpl: Template) => boolean][] = [
  ['tpl.documents', '📄', (tpl) => tpl.kind === 'document' && !tpl.example],
  ['tpl.spreadsheets', '📊', (tpl) => tpl.kind === 'spreadsheet' && !tpl.example],
  ['tpl.presentations', '📽️', (tpl) => tpl.kind === 'presentation' && !tpl.example],
  ['tpl.drawings', '🎨', (tpl) => tpl.kind === 'picture' && !tpl.example],
  ['tpl.examples', '💡', (tpl) => !!tpl.example],
];

/** The emoji of a template kept as a file: what its type makes. */
export function fileIcon(name: string): string {
  const ext = /\.([^./]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
  if (/^(ods|ots|xlsx|xltx|csv)$/.test(ext)) return '📊';
  if (/^(odp|otp|pptx|potx)$/.test(ext)) return '📽️';
  if (/^(md|markdown|mdz)$/.test(ext)) return '📝';
  if (ext === 'tex' || ext === 'zip') return '📐';
  if (ext === 'svg') return '🎨';
  if (/^(png|jpe?g|image)$/.test(ext)) return '🖼️';
  if (ext === 'pdf') return '📕';
  if (ext === 'jl' || ext === 'py' || ext === 'marimo') return '🧪';
  return '📄';
}

const fold = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

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
  sources?: TemplateSources,
): Promise<Template | UserTemplate | FolderTemplateChoice | SourceTemplateChoice | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog template-dialog', 'aria-labelledby': 'tpl-title' });
    const finish = (tpl: Template | UserTemplate | FolderTemplateChoice | SourceTemplateChoice | null): void => {
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
        button(tpl.name, () => finish(tpl), { className: 'template-card', icon: fileIcon(`.${tpl.format}`), title: tpl.name }),
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
    const inFolder = (tpl: FolderTemplateChoice): HTMLElement =>
      h('li', {}, button(tpl.name, () => finish(tpl), { className: 'template-card', icon: fileIcon(tpl.path), title: tpl.path }), h('p', { class: 'hint' }, tpl.path));
    // One panel per kind, behind tabs; the folder's or the user's templates first when there are some.
    const panels: { label: string; icon: string; body: HTMLElement; cards: { el: HTMLElement; words: string }[]; load?: () => Promise<void> }[] = [];
    const panel = (label: string, icon: string, items: HTMLElement[], words: string[], empty?: HTMLElement): void => {
      const list = h('ul', { class: 'template-list', role: 'list' }, ...items);
      panels.push({ label, icon, body: h('div', { class: 'template-panel', role: 'tabpanel', 'aria-label': label }, items.length ? list : (empty ?? list)), cards: items.map((el, i) => ({ el, words: fold(words[i] ?? '') })) });
    };
    // FILE-030: a repository or a cloud folder of templates, read when its tab is first chosen.
    const sourcePanel = (source: TemplateSource): void => {
      const body = h('div', { class: 'template-panel', role: 'tabpanel', 'aria-label': source.label }, h('p', { class: 'hint' }, t('git.loading')));
      const entry: (typeof panels)[number] = { label: source.label, icon: source.kind === 'git' ? '🗃️' : '☁️', body, cards: [] };
      entry.load = async () => {
        entry.load = undefined;
        const forget = button(t('tpl.sourceRemove', { name: source.label }), () => {
          if (!window.confirm(t('tpl.sourceRemoveConfirm', { name: source.label }))) return;
          sources!.remove(source);
          const i = panels.indexOf(entry);
          panels.splice(i, 1);
          tabs.splice(i, 1)[0]!.remove();
          select(0);
        }, { text: `✕ ${t('tpl.sourceRemove', { name: source.label })}`, className: 'link' });
        try {
          const items = await sources!.load(source);
          const cards = items.map((tpl) => h('li', {}, button(tpl.name, () => finish({ source, template: tpl }), { className: 'template-card', icon: fileIcon(tpl.path), title: tpl.path }), h('p', { class: 'hint' }, tpl.path)));
          entry.cards = cards.map((el, i) => ({ el, words: fold(`${items[i]!.name} ${items[i]!.path}`) }));
          body.replaceChildren(cards.length ? h('ul', { class: 'template-list', role: 'list' }, ...cards) : h('p', { class: 'hint' }, t('tpl.sourceEmpty')), h('p', {}, forget));
        } catch (err) {
          body.replaceChildren(h('p', { class: 'error', role: 'alert' }, t('tpl.sourceError', { message: (err as Error).message })), h('p', {}, forget));
        }
      };
      panels.push(entry);
    };
    if (folder?.items.length) panel(t('tpl.folder', { name: folder.label }), '📁', folder.items.map(inFolder), folder.items.map((f) => `${f.name} ${f.path}`));
    if (mine.length) panel(t('tpl.mine'), '⭐', mine.map(own), mine.map((m) => m.name));
    for (const [label, icon, keep] of GROUPS) {
      const items = TEMPLATES.filter(keep);
      if (items.length) panel(t(label), icon, items.map(card), items.map((tpl) => `${t(tpl.name)} ${t(tpl.description)}`));
    }
    if (!mine.length) panel(t('tpl.mine'), '⭐', [], [], h('p', { class: 'hint' }, t('tpl.mineEmpty')));
    for (const source of sources?.list ?? []) sourcePanel(source);
    const makeTab = (p: (typeof panels)[number]): HTMLButtonElement => {
      const tab = h('button', { type: 'button', role: 'tab', class: 'template-tab', 'aria-selected': 'false', tabindex: '-1', 'data-icon': p.icon }, p.label);
      tab.addEventListener('click', () => select(panels.indexOf(p)));
      tab.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = (panels.indexOf(p) + step + panels.length) % panels.length;
        select(next);
        tabs[next]!.focus();
      });
      return tab;
    };
    const tabs = panels.map(makeTab);
    // FILE-030: another repository or cloud folder of templates.
    const addTab = sources
      ? button(t('tpl.sourceAdd'), () => {
          void sources.add().then((source) => {
            if (!source) return;
            sourcePanel(source);
            const tab = makeTab(panels[panels.length - 1]!);
            tabs.push(tab);
            tablist.insertBefore(tab, addTab);
            select(panels.length - 1);
          });
        }, { className: 'template-tab template-add', text: `＋ ${t('tpl.sourceAdd')}`, title: t('tpl.sourceAddTitle') })
      : null;
    const tablist = h('div', { class: 'template-tabs', role: 'tablist', 'aria-label': t('tpl.categories') }, ...tabs, ...(addTab ? [addTab] : []));
    const stage = h('div', { class: 'template-stage' });
    const results = h('ul', { class: 'template-list', role: 'list', 'aria-label': t('tpl.search') });
    const noMatch = h('p', { class: 'hint' }, t('tpl.noMatch'));
    let current = 0;
    function select(i: number): void {
      current = i;
      tabs.forEach((tab, j) => {
        tab.setAttribute('aria-selected', String(j === i));
        tab.tabIndex = j === i ? 0 : -1;
      });
      stage.replaceChildren(panels[i]!.body);
      void panels[i]!.load?.();
    }
    // A search shows every match, whatever its kind.
    const search = h('input', { type: 'search', class: 'template-search', placeholder: t('tpl.search'), 'aria-label': t('tpl.search') });
    search.addEventListener('input', () => {
      const words = fold(search.value).split(/\s+/).filter(Boolean);
      tablist.hidden = words.length > 0;
      if (!words.length) return select(current);
      const found = panels.flatMap((p) => p.cards.filter((c) => words.every((w) => c.words.includes(w))).map((c) => c.el));
      results.replaceChildren(...found);
      stage.replaceChildren(found.length ? results : noMatch);
    });
    dialog.append(
      h('h2', { id: 'tpl-title' }, t('tpl.title')),
      h('p', { class: 'hint' }, t('tpl.intro')),
      search,
      tablist,
      stage,
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null))),
    );
    select(0);
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
