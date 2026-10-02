/**
 * The folder side panel (FOLDER-001, FOLDER-002): the documents of the open
 * folder as a tree, and a search across them.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import type { ProjectFolder } from '../storage/folder';
import type { FolderIndex, SearchHit } from './search';

/** Files the app opens, by extension. */
export const OPENABLE = /\.(docx|odt|odm|md|markdown|mdz|tex|xlsx|ods|csv|tsv|pptx|odp|pdf)$/i;

export interface FolderPanelHooks {
  open(path: string, query?: string): void;
  close(): void;
}

interface TreeDir {
  dirs: Map<string, TreeDir>;
  files: string[];
}

function tree(paths: string[]): TreeDir {
  const root: TreeDir = { dirs: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split('/');
    let dir = root;
    for (const seg of parts.slice(0, -1)) {
      if (!dir.dirs.has(seg)) dir.dirs.set(seg, { dirs: new Map(), files: [] });
      dir = dir.dirs.get(seg)!;
    }
    dir.files.push(path);
  }
  return root;
}

const ICONS: [RegExp, string][] = [
  [/\.(docx|odt|odm|md|markdown|mdz|tex)$/i, '📝'],
  [/\.(xlsx|ods|csv|tsv)$/i, '📊'],
  [/\.(pptx|odp)$/i, '📽️'],
  [/\.pdf$/i, '📕'],
];
const iconOf = (path: string): string => ICONS.find(([re]) => re.test(path))?.[1] ?? '📄';

export class FolderPanel {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly results: HTMLElement;
  private readonly search: HTMLInputElement;
  private paths: string[] = [];
  private current: string | undefined;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly folder: ProjectFolder,
    private readonly index: FolderIndex,
    private readonly hooks: FolderPanelHooks,
  ) {
    this.search = h('input', { type: 'search', class: 'folder-search', 'aria-label': t('folder.search'), placeholder: t('folder.search') });
    this.search.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => void this.runSearch(), 250);
    });
    this.list = h('nav', { class: 'folder-tree', 'aria-label': t('folder.files') });
    this.results = h('section', { class: 'folder-results', 'aria-label': t('folder.results'), 'aria-live': 'polite', hidden: true });
    this.element = h(
      'aside',
      { class: 'folder-panel', 'aria-label': t('folder.panel') },
      h(
        'div',
        { class: 'folder-head' },
        h('h2', { title: folder.name }, `📁 ${folder.name}`),
        button(t('folder.refresh'), () => void this.refresh(), { text: '↻', className: 'icon' }),
        button(t('folder.close'), () => hooks.close(), { text: '✕', className: 'icon' }),
      ),
      folder.writable ? '' : h('p', { class: 'folder-readonly' }, t('folder.readOnly')),
      this.search,
      this.results,
      this.list,
    );
  }

  async refresh(): Promise<void> {
    this.paths = (await this.folder.list()).filter((p) => OPENABLE.test(p));
    this.render();
    if (this.search.value.trim()) await this.runSearch();
  }

  /** Paths of the openable files. */
  files(): string[] {
    return this.paths;
  }

  setCurrent(path: string | undefined): void {
    this.current = path;
    for (const b of this.list.querySelectorAll<HTMLElement>('button[data-path]')) {
      if (b.dataset.path === path) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
  }

  private fileButton(path: string, label = path.split('/').pop()!): HTMLButtonElement {
    const b = button(label, () => this.hooks.open(path), { className: 'folder-file', icon: iconOf(path), title: path });
    b.dataset.path = path;
    if (path === this.current) b.setAttribute('aria-current', 'page');
    return b;
  }

  private render(): void {
    const renderDir = (dir: TreeDir): HTMLElement =>
      h(
        'ul',
        { role: 'list' },
        ...[...dir.dirs].map(([name, sub]) => h('li', {}, h('details', { open: true }, h('summary', {}, `📁 ${name}`), renderDir(sub)))),
        ...dir.files.map((path) => h('li', {}, this.fileButton(path))),
      );
    this.list.replaceChildren(this.paths.length ? renderDir(tree(this.paths)) : h('p', { class: 'hint' }, t('folder.empty')));
  }

  private async runSearch(): Promise<void> {
    const query = this.search.value.trim();
    this.results.hidden = !query;
    this.list.hidden = !!query;
    if (!query) return;
    this.results.replaceChildren(h('p', { class: 'hint' }, t('folder.searching')));
    const all = await this.folder.list();
    const hits: SearchHit[] = await this.index.search(query, all.filter((p) => OPENABLE.test(p) || /\.(txt|bib)$/i.test(p)));
    if (query !== this.search.value.trim()) return;
    this.results.replaceChildren(
      h('p', { class: 'hint' }, hits.length ? t('folder.found', { n: hits.reduce((s, x) => s + x.count, 0), files: hits.length }) : t('folder.notFound')),
      h(
        'ul',
        { role: 'list' },
        ...hits.map((hit) =>
          h(
            'li',
            {},
            OPENABLE.test(hit.path) ? button(hit.path, () => this.hooks.open(hit.path, query), { className: 'folder-file', icon: iconOf(hit.path) }) : h('span', { class: 'folder-file' }, hit.path),
            ...hit.snippets.map((s) => h('p', { class: 'folder-snippet' }, s)),
          ),
        ),
      ),
    );
  }
}
