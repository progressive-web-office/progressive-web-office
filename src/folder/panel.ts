/**
 * The folder side panel (FOLDER-001, FOLDER-002, FOLDER-004): the file
 * explorer of `src/fs` over the open folder, and a search across its documents.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { Explorer, listFiles, type Entry, type ExplorerChange, type StorageProvider } from '../fs';
import '../fs/ui/explorer.css';
import type { FolderIndex, SearchHit } from './search';
import { isNote, NoteVault } from './vault';

/** Files the app opens, by extension. */
export const OPENABLE = /\.(docx|odt|odm|md|markdown|mdz|tex|xlsx|ods|csv|tsv|pptx|odp|pdf|ott|ots|otp|dotx|xltx|potx)$/i;

export interface FolderPanelHooks {
  open(path: string, query?: string): void;
  close(): void;
  changed(change: ExplorerChange): void | Promise<void>;
  error(message: string): void;
  prompt(message: string, value: string): Promise<string | null>;
  confirm(message: string): Promise<boolean>;
}

const ICONS: [RegExp, string][] = [
  [/\.(docx|odt|odm|md|markdown|mdz|tex|ott|dotx)$/i, '📝'],
  [/\.(xlsx|ods|csv|tsv|ots|xltx)$/i, '📊'],
  [/\.(pptx|odp|otp|potx)$/i, '📽️'],
  [/\.pdf$/i, '📕'],
];
export const iconOf = (path: string): string => ICONS.find(([re]) => re.test(path))?.[1] ?? '📄';

export class FolderPanel {
  readonly element: HTMLElement;
  readonly explorer: Explorer;
  /** Links between the folder's Markdown notes (FOLDER-005). */
  readonly vault: NoteVault;
  private readonly backlinks: HTMLElement;
  private readonly results: HTMLElement;
  private readonly search: HTMLInputElement;
  private paths: string[] = [];
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly provider: StorageProvider,
    private readonly index: FolderIndex,
    private readonly hooks: FolderPanelHooks,
  ) {
    this.vault = new NoteVault(provider);
    this.backlinks = h('section', { class: 'folder-backlinks', 'aria-label': t('vault.backlinks'), hidden: true });
    this.explorer = new Explorer({
      provider,
      strings: {
        tree: t('folder.files'),
        newFile: t('folder.newFile'),
        newFolder: t('folder.newFolder'),
        rename: t('folder.rename'),
        remove: t('folder.remove'),
        refresh: t('folder.refresh'),
        empty: t('folder.empty'),
        readOnly: t('folder.readOnly'),
        namePrompt: t('folder.namePrompt'),
        folderName: t('folder.newFolderName'),
        confirmRemove: (name, folder) => t(folder ? 'folder.confirmRemoveFolder' : 'folder.confirmRemove', { name }),
        error: (message) => t('folder.error', { message }),
      },
      filter: (e: Entry) => !e.name.startsWith('.') && e.name !== 'node_modules' && (e.kind === 'directory' || OPENABLE.test(e.name)),
      icon: (e: Entry) => (e.kind === 'directory' ? '📁' : iconOf(e.name)),
      onOpen: (e) => hooks.open(e.path),
      onChange: async (change) => {
        await this.reindex();
        await hooks.changed(change);
      },
      newFiles: [{ label: t('folder.newFile'), name: `${t('folder.untitled')}.md`, content: () => new Blob([`# ${t('folder.untitled')}\n`]) }],
      prompt: hooks.prompt,
      confirm: hooks.confirm,
      onError: hooks.error,
    });
    this.search = h('input', { type: 'search', class: 'folder-search', 'aria-label': t('folder.search'), placeholder: t('folder.search') });
    this.search.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => void this.runSearch(), 250);
    });
    this.results = h('section', { class: 'folder-results', 'aria-label': t('folder.results'), 'aria-live': 'polite', hidden: true });
    this.element = h(
      'aside',
      { class: 'folder-panel', 'aria-label': t('folder.panel') },
      h('div', { class: 'folder-head' }, h('h2', { title: provider.label }, `📁 ${provider.label}`), button(t('folder.close'), () => hooks.close(), { text: '✕', className: 'icon' })),
      provider.capabilities.write ? '' : h('p', { class: 'folder-readonly' }, t('folder.readOnlyHint')),
      this.search,
      this.results,
      this.explorer.element,
      this.backlinks,
    );
  }

  private async reindex(): Promise<void> {
    this.paths = (await listFiles(this.provider)).filter((p) => OPENABLE.test(p));
  }

  async refresh(): Promise<void> {
    await this.reindex();
    await this.explorer.refresh();
    if (this.search.value.trim()) await this.runSearch();
  }

  /** Paths of the openable files. */
  files(): string[] {
    return this.paths;
  }

  setCurrent(path: string | undefined): void {
    this.explorer.setCurrent(path);
    if (!path) this.backlinks.hidden = true;
  }

  /** The notes linking to the open note (FOLDER-005). */
  async showBacklinks(path: string): Promise<void> {
    if (!isNote(path)) {
      this.backlinks.hidden = true;
      return;
    }
    this.vault.clear();
    const from = await this.vault.backlinks(path, this.paths.filter(isNote));
    this.backlinks.hidden = false;
    this.backlinks.replaceChildren(
      h('h3', {}, t('vault.backlinksCount', { n: from.length })),
      from.length
        ? h('ul', { role: 'list' }, ...from.map((p) => h('li', {}, button(p, () => this.hooks.open(p), { className: 'folder-file', icon: '↩' }))))
        : h('p', { class: 'hint' }, t('vault.noBacklinks')),
    );
  }

  private async runSearch(): Promise<void> {
    const query = this.search.value.trim();
    this.results.hidden = !query;
    this.explorer.element.hidden = !!query;
    if (!query) return;
    this.results.replaceChildren(h('p', { class: 'hint' }, t('folder.searching')));
    const all = await listFiles(this.provider);
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
