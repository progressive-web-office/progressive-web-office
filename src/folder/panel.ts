/**
 * The folder side panel (FOLDER-001, FOLDER-002, FOLDER-004): the file
 * explorer of `src/fs` over the open folder, and a search across its documents.
 */
import { busyText, button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { basename, dirname, Explorer, walk, type Entry, type ExplorerChange, type SortKey, type StorageProvider } from '../fs';
import '../fs/ui/explorer.css';
import { searchable, type FolderIndex, type SearchHit } from './search';
import { isNote, NoteVault, noteName } from './vault';
import { newNoteId, newNoteText, noteId } from '../document/wiki-links';
import { officeNewFiles } from './new-files';
import { loadTagColours, setTagColour, TAG_COLOURS, type TagColour } from './tags';

/** Files the app opens, by extension. */
export const OPENABLE = /\.(docx|odt|odm|md|markdown|mdz|tex|xlsx|ods|csv|tsv|pptx|odp|pdf|ott|ots|otp|dotx|xltx|potx)$/i;

export interface FolderPanelHooks {
  open(path: string, query?: string): void;
  close(): void;
  changed(change: ExplorerChange): void | Promise<void>;
  error(message: string): void;
  prompt(message: string, value: string): Promise<string | null>;
  confirm(message: string): Promise<boolean>;
  /** Buttons added next to the folder's name (e.g. download an archive, FILE-021). */
  actions?: HTMLElement[];
  /** The colours of the tags changed (FOLDER-023). */
  tagsChanged?(): void;
  /** Notes rewritten by the panel (a tag renamed): the open one may need reloading. */
  notesChanged?(paths: string[]): void | Promise<void>;
}

const ICONS: [RegExp, string][] = [
  [/\.(docx|odt|odm|md|markdown|mdz|tex|ott|dotx)$/i, '📝'],
  [/\.(xlsx|ods|csv|tsv|ots|xltx)$/i, '📊'],
  [/\.(pptx|odp|otp|potx)$/i, '📽️'],
  [/\.pdf$/i, '📕'],
  [/\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i, '🖼️'],
  [/\.(zip|7z|rar|tar|gz|tgz|xz|bz2)$/i, '🗜️'],
  [/\.(txt|log|csv|json|ya?ml|toml|ini|cfg|xml|bib)$/i, '📃'],
  [/\.(c|h|cpp|cc|cxx|hpp|py|java|js|mjs|ts|tsx|jsx|cs|go|rs|rb|php|sh|r|m|jl|kt|swift|sql|html?|css|scss|lua|hs|f90|pas|ml|scala|dart|ipynb)$|(^|\/)(makefile|dockerfile)$/i, '🧾'],
];
const SORT_KEY = 'pwo.folder.sort';
const savedSort = (): SortKey | undefined => {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return v === 'name' || v === 'date' || v === 'size' || v === 'type' ? v : undefined;
  } catch {
    return undefined;
  }
};

/** Lower case, without accents. */
const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const iconOf = (path: string): string => ICONS.find(([re]) => re.test(path))?.[1] ?? '📄';

export class FolderPanel {
  readonly element: HTMLElement;
  readonly explorer: Explorer;
  /** Links between the folder's Markdown notes (FOLDER-005). */
  readonly vault: NoteVault;
  private readonly backlinks: HTMLElement;
  private readonly results: HTMLElement;
  private readonly search: HTMLInputElement;
  /** FOLDER-017: the tags of the notes. */
  private readonly tagSection: HTMLDetailsElement;
  private readonly tagList = h('div', { class: 'folder-tags' });
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
        confirmRemoveMany: (n) => t('folder.confirmRemoveMany', { n }),
        noUndo: t('folder.noUndo'),
        deleted: (n) => t('folder.deleted', { n }),
        undo: t('folder.undo'),
        importFiles: t('folder.import'),
        sortBy: t('folder.sortBy'),
        sortNames: { name: t('folder.sortName'), date: t('folder.sortDate'), size: t('folder.sortSize'), type: t('folder.sortType') },
        open: t('folder.openEntry'),
        duplicate: t('folder.duplicate'),
        copy: t('folder.copy'),
        cut: t('folder.cut'),
        paste: t('folder.paste'),
        download: t('folder.download'),
        copyPath: t('folder.copyPath'),
        menu: t('folder.menu'),
        collapseAll: t('folder.collapseAll'),
        showCurrent: t('folder.showCurrent'),
        error: (message) => t('folder.error', { message }),
      },
      // Every file is listed: documents, text and source files, pictures, archives; others can be downloaded (FILE-021).
      filter: (e: Entry) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__MACOSX',
      icon: (e: Entry) => (e.kind === 'directory' ? (/\.zip$/i.test(e.name) ? '🗜️' : '📁') : iconOf(e.name)),
      onOpen: (e) => hooks.open(e.path),
      onChange: async (change) => {
        await this.reindex();
        await hooks.changed(change);
      },
      newFiles: [
        { label: t('folder.newFile'), name: `${t('folder.untitled')}.md`, content: () => new Blob([`# ${t('folder.untitled')}\n`]) },
        // FOLDER-024: a note named and marked with an identifier from the date and time.
        {
          label: t('folder.newNoteId'),
          icon: '🆔',
          name: () => `${newNoteId()} ${t('folder.untitled')}.md`,
          content: (name) => {
            const stem = name.replace(/\.(md|markdown)$/i, '');
            const id = noteId(name) ?? newNoteId();
            return new Blob([newNoteText(id, stem.slice(stem.startsWith(id) ? id.length : 0).trim() || id)]);
          },
        },
        // GIT-015: documents made right here (in a repository, saving is a commit).
        ...officeNewFiles(),
      ],
      prompt: hooks.prompt,
      confirm: hooks.confirm,
      onError: hooks.error,
      // FOLDER-008: the order chosen is kept for the next folders.
      ...(savedSort() ? { sort: savedSort() } : {}),
      // FOLDER-014: a file as it is, folders or several entries as a ZIP archive.
      download: (entries) => this.download(entries),
      onSort: (key) => {
        try {
          localStorage.setItem(SORT_KEY, key);
        } catch {
          /* not kept */
        }
      },
    });
    this.search = h('input', { type: 'search', class: 'folder-search', 'aria-label': t('folder.search'), placeholder: t('folder.search') });
    this.search.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => void this.runSearch(), 250);
    });
    this.results = h('section', { class: 'folder-results', 'aria-label': t('folder.results'), 'aria-live': 'polite', hidden: true });
    this.tagSection = h('details', { class: 'folder-tag-section' }, h('summary', {}, t('folder.tags')), this.tagList) as HTMLDetailsElement;
    this.tagSection.addEventListener('toggle', () => {
      if (this.tagSection.open) void this.renderTags();
    });
    this.element = h(
      'aside',
      { class: 'folder-panel', 'aria-label': t('folder.panel') },
      h('div', { class: 'folder-head' }, h('h2', { title: provider.label }, `📁 ${provider.label}`), ...(hooks.actions ?? []), button(t('folder.graph'), () => void this.showGraph(), { text: '🕸', className: 'icon', title: t('folder.graphTitle') }), button(t('folder.close'), () => hooks.close(), { text: '✕', className: 'icon' })),
      provider.capabilities.write ? '' : h('p', { class: 'folder-readonly' }, t('folder.readOnlyHint')),
      this.search,
      this.results,
      this.explorer.element,
      this.indexStatus,
      this.tagSection,
      this.backlinks,
    );
  }

  private async download(entries: Entry[]): Promise<void> {
    const save = (blob: Blob, name: string): void => {
      const a = h('a', { href: URL.createObjectURL(blob), download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    };
    const [only] = entries;
    if (entries.length === 1 && only!.kind === 'file') return save(await this.provider.read(only!.path), only!.name);
    const { writeZip } = await import('../core/zip');
    const files: { path: string; data: Uint8Array }[] = [];
    for (const e of entries) {
      // Paths in the archive start at the folder holding the entry.
      const base = dirname(e.path);
      const rel = (path: string): string => (base ? path.slice(base.length + 1) : path);
      if (e.kind === 'file') files.push({ path: rel(e.path), data: new Uint8Array(await (await this.provider.read(e.path)).arrayBuffer()) });
      else for await (const f of walk(this.provider, e.path, { skip: () => false })) files.push({ path: rel(f.path), data: new Uint8Array(await (await this.provider.read(f.path)).arrayBuffer()) });
    }
    const name = entries.length === 1 ? only!.name : this.provider.label;
    save(new Blob([writeZip(files) as BlobPart], { type: 'application/zip' }), `${name}.zip`);
  }

  /** Names of the notes to link to (but `from`) or tags used in the folder, for completion (FOLDER-021). */
  async completions(kind: 'link' | 'tag', from?: string): Promise<string[]> {
    const notes = this.notes();
    if (kind === 'tag') return [...(await this.vault.tags()).keys()];
    // A note by its name; by its path without extension when the name is not unique.
    const names = notes.map((n) => noteName(n));
    return notes.flatMap((n, i) => (n === from ? [] : [names.indexOf(names[i]!) === names.lastIndexOf(names[i]!) ? names[i]! : n.replace(/\.(md|markdown)$/i, '')]));
  }

  /** FOLDER-023: the colour of a tag (CSS), if it has one. */
  tagColour(tag: string): string | undefined {
    const c = loadTagColours(this.provider.id)[tag.toLowerCase()];
    return c ? TAG_COLOURS[c] : undefined;
  }

  private colourPicker(tag: string): HTMLSelectElement {
    const current = loadTagColours(this.provider.id)[tag.toLowerCase()] ?? '';
    const select = h(
      'select',
      { class: 'folder-tag-colour', 'aria-label': t('folder.tagColour', { tag }), title: t('folder.tagColour', { tag }) },
      h('option', { value: '' }, t('folder.colourNone')),
      ...(Object.keys(TAG_COLOURS) as TagColour[]).map((c) => h('option', { value: c, style: `color: ${TAG_COLOURS[c]}` }, `● ${t(`colour.${c}` as MessageKey)}`)),
    ) as HTMLSelectElement;
    select.value = current;
    const paint = (): void => select.style.setProperty('--tag-colour', select.value ? TAG_COLOURS[select.value as TagColour] : 'transparent');
    paint();
    select.addEventListener('change', () => {
      setTagColour(this.provider.id, tag, (select.value || undefined) as TagColour | undefined);
      paint();
      void this.renderTags();
      this.hooks.tagsChanged?.();
    });
    return select;
  }

  private notes(): string[] {
    return this.paths.filter(isNote);
  }

  /** The tags of the notes, the most used first; a click lists their notes (FOLDER-017). */
  private async renderTags(): Promise<void> {
    const tags = await this.vault.tags();
    this.tagList.replaceChildren(
      ...(tags.size
        ? [...tags].map(([tag, notes]) =>
            h(
              'span',
              { class: 'folder-tag', style: `--tag-colour: ${this.tagColour(tag) ?? 'currentColor'}` },
              button(`#${tag}`, () => {
                this.search.value = `#${tag}`;
                void this.runSearch();
              }, { className: 'link', title: t('folder.tagNotes', { n: notes.length }) }),
              h('span', { class: 'folder-tag-count' }, String(notes.length)),
              this.colourPicker(tag),
              this.provider.capabilities.write ? button(t('folder.renameTag', { tag }), () => void this.renameTag(tag), { text: '✎', className: 'icon folder-tag-rename' }) : '',
            ),
          )
        : [h('p', { class: 'hint' }, t('folder.noTags'))]),
    );
  }

  private async showTag(tag: string): Promise<void> {
    const tags = await this.vault.tags();
    const notes = [...tags].find(([t]) => t.toLowerCase() === tag.toLowerCase())?.[1] ?? [];
    if (`#${tag}` !== this.search.value.trim()) return;
    this.results.replaceChildren(
      h('p', { class: 'hint' }, notes.length ? t('folder.tagNotes', { n: notes.length }) : t('folder.notFound')),
      h('ul', { role: 'list' }, ...notes.map((p) => h('li', {}, button(p, () => this.hooks.open(p), { className: 'folder-file', icon: iconOf(p) })))),
    );
  }

  private async renameTag(tag: string): Promise<void> {
    const name = (await this.hooks.prompt(t('folder.renameTagPrompt', { tag }), tag))?.trim().replace(/^#/, '');
    if (!name || name === tag || /\s/.test(name)) return;
    try {
      const changed = await this.vault.renameTag(tag, name);
      await this.renderTags();
      await this.hooks.notesChanged?.(changed);
    } catch (err) {
      this.hooks.error((err as Error).message);
    }
  }

  /** The notes and the links between them, as a graph; a click opens a note (FOLDER-018). */
  private async showGraph(): Promise<void> {
    const { notesGraphDialog } = await import('./graph');
    const notes = (await this.vault.indexed()).notes().slice(0, 200);
    const keep = new Set(notes);
    const links = (await this.vault.links()).filter((l) => keep.has(l.from) && keep.has(l.to));
    const path = await notesGraphDialog(document.body, notes, links);
    if (path) this.hooks.open(path);
  }

  private current: string | undefined;
  private indexing = false;
  private readonly indexStatus = h('p', { class: 'hint folder-index-status', role: 'status', hidden: true });

  /** FOLDER-025: read the notes changed since the last time, the progress shown, the page left responsive. */
  private async indexNotes(): Promise<void> {
    this.indexing = true;
    let shown = false;
    const timer = setTimeout(() => {
      shown = true;
      this.indexStatus.hidden = false;
    }, 400);
    try {
      await this.vault.sync((done, total) => {
        if (shown || total > 200) {
          this.indexStatus.hidden = false;
          this.indexStatus.replaceChildren(...busyText(t('vault.indexingCount', { done, total })));
        }
      });
    } catch (err) {
      this.hooks.error((err as Error).message);
    } finally {
      clearTimeout(timer);
      this.indexing = false;
      this.indexStatus.hidden = true;
    }
  }

  /** The files of the folder, listed once for the panel and the index of the notes. */
  private entries: Entry[] = [];

  private async reindex(): Promise<void> {
    const entries: Entry[] = [];
    for await (const e of walk(this.provider, '', { maxDepth: 32, maxEntries: 100_000 })) entries.push(e);
    this.entries = entries;
    this.paths = entries.map((e) => e.path).filter((p) => OPENABLE.test(p));
  }

  async refresh(): Promise<void> {
    await this.reindex();
    await this.explorer.refresh();
    // FOLDER-025: the index of the notes, brought up to date in the background (only what changed is read);
    // the notes of a server are read when first needed (backlinks, tags, graph), not each one at once.
    this.vault.listed(this.entries);
    if (this.vault.started || !/^(git|webdav):/.test(this.provider.id)) void this.indexNotes();
    if (this.tagSection.open) await this.renderTags();
    if (this.search.value.trim()) await this.runSearch();
  }

  /** Paths of the openable files. */
  files(): string[] {
    return this.paths;
  }

  setCurrent(path: string | undefined): void {
    this.current = path;
    this.explorer.setCurrent(path);
    if (!path) this.backlinks.hidden = true;
  }

  /** The notes linking to the open note (FOLDER-005). */
  async showBacklinks(path: string): Promise<void> {
    if (!isNote(path)) {
      this.backlinks.hidden = true;
      return;
    }
    this.backlinks.hidden = false;
    if (this.indexing) this.backlinks.replaceChildren(h('p', { class: 'hint' }, ...busyText(t('vault.indexing'))));
    const from = await this.vault.backlinks(path);
    if (this.current !== path) return;
    this.backlinks.replaceChildren(
      h('h3', {}, t('vault.backlinksCount', { n: from.length })),
      from.length
        ? h(
            'ul',
            { role: 'list', class: 'folder-backlink-list' },
            // FOLDER-025: each with the words around the link.
            ...from.map((b) => h('li', {}, button(b.from, () => this.hooks.open(b.from), { className: 'folder-file', icon: '↩' }), h('p', { class: 'folder-snippet' }, b.context))),
          )
        : h('p', { class: 'hint' }, t('vault.noBacklinks')),
    );
    // FOLDER-019: notes sharing its tags or linked with it.
    const related = await this.vault.related(path);
    if (!related.length || this.current !== path) return;
    this.backlinks.append(
      h('h3', {}, t('vault.related')),
      h(
        'ul',
        { role: 'list', class: 'folder-related' },
        ...related.map((r) =>
          h(
            'li',
            {},
            button(r.path, () => this.hooks.open(r.path), { className: 'folder-file', icon: iconOf(r.path) }),
            h('span', { class: 'folder-related-why' }, [...r.tags.map((tag) => `#${tag}`), ...(r.linked ? [t('vault.linked')] : [])].join(' · ')),
          ),
        ),
      ),
    );
  }

  private async runSearch(): Promise<void> {
    const query = this.search.value.trim();
    this.results.hidden = !query;
    this.explorer.element.hidden = !!query;
    if (!query) return;
    // FOLDER-017: `#tag` lists the notes with that tag.
    if (/^#[^\s#]+$/.test(query)) return this.showTag(query.slice(1));
    const all = this.entries.map((e) => e.path);
    if (query !== this.search.value.trim()) return;
    // FOLDER-008: files whose name matches come first, at once.
    const q = fold(query);
    const named = all.filter((p) => fold(basename(p)).includes(q)).slice(0, 100);
    const names = named.length
      ? h('section', { class: 'folder-names' }, h('h3', {}, t('folder.byName')), h('ul', { role: 'list' }, ...named.map((p) => h('li', {}, button(p, () => this.hooks.open(p), { className: 'folder-file', icon: iconOf(p) })))))
      : '';
    const inDocs = named.length ? h('h3', {}, t('folder.inDocuments')) : '';
    this.results.replaceChildren(names, inDocs, h('p', { class: 'hint' }, ...busyText(t('folder.searching'))));
    const hits: SearchHit[] = await this.index.search(query, all.filter((p) => OPENABLE.test(p) || searchable(p)));
    if (query !== this.search.value.trim()) return;
    this.results.replaceChildren(
      names,
      inDocs,
      h('p', { class: 'hint' }, hits.length ? t('folder.found', { n: hits.reduce((s, x) => s + x.count, 0), files: hits.length }) : t('folder.notFound')),
      h(
        'ul',
        { role: 'list' },
        ...hits.map((hit) =>
          h(
            'li',
            {},
            OPENABLE.test(hit.path) || searchable(hit.path) ? button(hit.path, () => this.hooks.open(hit.path, query), { className: 'folder-file', icon: iconOf(hit.path) }) : h('span', { class: 'folder-file' }, hit.path),
            ...hit.snippets.map((s) => h('p', { class: 'folder-snippet' }, s)),
          ),
        ),
      ),
    );
  }
}
