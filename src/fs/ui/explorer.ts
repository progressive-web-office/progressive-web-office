/**
 * A file explorer over any storage provider (FOLDER-004): a lazily loaded
 * tree, and creating, renaming, moving (drag and drop) and deleting files and
 * folders. Plain DOM, no framework; texts and icons are given by the host.
 */
import { basename, checkName, dirname, isInside, join } from '../path';
import { freeName } from '../walk';
import { FsError, type Entry, type StorageProvider } from '../types';

export interface ExplorerStrings {
  tree: string;
  newFile: string;
  newFolder: string;
  rename: string;
  remove: string;
  refresh: string;
  empty: string;
  readOnly: string;
  namePrompt: string;
  folderName: string;
  confirmRemove: (name: string, isFolder: boolean) => string;
  error: (message: string) => string;
}

const DEFAULT_STRINGS: ExplorerStrings = {
  tree: 'Files',
  newFile: 'New file',
  newFolder: 'New folder',
  rename: 'Rename',
  remove: 'Delete',
  refresh: 'Reload',
  empty: 'This folder is empty.',
  readOnly: 'Read-only',
  namePrompt: 'Name:',
  folderName: 'New folder',
  confirmRemove: (name, folder) => `Delete ${folder ? 'the folder' : ''} “${name}”${folder ? ' and everything in it' : ''}?`,
  error: (m) => m,
};

export interface ExplorerChange {
  type: 'create' | 'rename' | 'move' | 'remove';
  path: string;
  /** New path of a renamed or moved entry. */
  to?: string;
  kind: Entry['kind'];
}

export interface NewFileKind {
  label: string;
  /** Default name, e.g. `Untitled.md`. */
  name: string;
  content: () => Blob | Promise<Blob>;
}

export interface ExplorerOptions {
  provider: StorageProvider;
  strings?: Partial<ExplorerStrings>;
  /** Entries shown (default: all but hidden names). */
  filter?: (e: Entry) => boolean;
  /** A decorative icon per entry. */
  icon?: (e: Entry) => string;
  onOpen(entry: Entry): void;
  /** Called after a change made in the explorer (to update links, the open document…). */
  onChange?(change: ExplorerChange): void | Promise<void>;
  /** Kinds of files "New file" offers (default: an empty text file). */
  newFiles?: NewFileKind[];
  /** Dialogs (default: the browser's prompt and confirm). */
  prompt?(message: string, value: string): Promise<string | null>;
  confirm?(message: string): Promise<boolean>;
  onError?(message: string): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(e, rest);
  if (dataset) Object.assign(e.dataset, dataset);
  e.append(...kids);
  return e;
};

const DRAG_TYPE = 'application/x-fs-path';

export class Explorer {
  readonly element: HTMLElement;
  private readonly tree: HTMLElement;
  private readonly toolbar: HTMLElement;
  private readonly strings: ExplorerStrings;
  private readonly expanded = new Set<string>(['']);
  private selected: Entry | undefined;
  private current: string | undefined;

  constructor(private readonly opts: ExplorerOptions) {
    this.strings = { ...DEFAULT_STRINGS, ...opts.strings };
    const writable = opts.provider.capabilities.write;
    const tool = (label: string, text: string, fn: () => void): HTMLButtonElement => {
      const b = el('button', { type: 'button', title: label, textContent: text, className: 'fs-tool' });
      b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      return b;
    };
    this.toolbar = el(
      'div',
      { className: 'fs-toolbar' },
      ...(writable
        ? [
            tool(this.strings.newFile, '＋', () => void this.createFile()),
            tool(this.strings.newFolder, '📁＋', () => void this.createFolder()),
            tool(this.strings.rename, '✎', () => void this.renameSelected()),
            tool(this.strings.remove, '🗑', () => void this.removeSelected()),
          ]
        : [el('span', { className: 'fs-readonly', textContent: this.strings.readOnly })]),
      tool(this.strings.refresh, '↻', () => void this.refresh()),
    );
    this.toolbar.setAttribute('role', 'toolbar');
    this.toolbar.setAttribute('aria-label', this.strings.tree);
    this.tree = el('nav', { className: 'fs-tree' });
    this.tree.setAttribute('aria-label', this.strings.tree);
    this.tree.addEventListener('keydown', (e) => {
      if (!writable || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'F2') {
        e.preventDefault();
        void this.renameSelected();
      } else if (e.key === 'Delete') {
        e.preventDefault();
        void this.removeSelected();
      }
    });
    if (writable) this.dropTarget(this.tree, '');
    this.element = el('div', { className: 'fs-explorer' }, this.toolbar, this.tree);
  }

  get provider(): StorageProvider {
    return this.opts.provider;
  }

  private visible(e: Entry): boolean {
    return this.opts.filter ? this.opts.filter(e) : !e.name.startsWith('.');
  }

  /** Reload the tree, keeping open folders open. */
  async refresh(): Promise<void> {
    try {
      this.tree.replaceChildren(await this.renderDir(''));
    } catch (err) {
      this.fail(err);
    }
  }

  /** Mark the entry being edited by the host. */
  setCurrent(path: string | undefined): void {
    this.current = path;
    for (const b of this.tree.querySelectorAll<HTMLElement>('[data-path]')) {
      if (b.dataset.path === path) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
  }

  /** Open the folders leading to `path`. */
  async reveal(path: string): Promise<void> {
    for (let d = dirname(path); d; d = dirname(d)) this.expanded.add(d);
    await this.refresh();
  }

  private async renderDir(path: string): Promise<HTMLElement> {
    const entries = (await this.opts.provider.list(path)).filter((e) => this.visible(e));
    const list = el('ul', { className: 'fs-list' });
    list.setAttribute('role', 'list');
    if (!entries.length && !path) list.append(el('li', { className: 'fs-empty', textContent: this.strings.empty }));
    for (const e of entries) list.append(await this.renderEntry(e));
    return list;
  }

  private async renderEntry(e: Entry): Promise<HTMLElement> {
    const icon = this.opts.icon?.(e) ?? (e.kind === 'directory' ? '📁' : '📄');
    const row = el('button', { type: 'button', className: `fs-entry fs-${e.kind}`, title: e.path, dataset: { path: e.path, icon } }, e.name);
    if (e.path === this.current) row.setAttribute('aria-current', 'page');
    if (this.selected?.path === e.path) row.classList.add('fs-selected');
    row.addEventListener('focus', () => this.select(e, row));
    row.addEventListener('click', () => {
      this.select(e, row);
      if (e.kind === 'file') this.opts.onOpen(e);
      else void this.toggle(e, row);
    });
    if (this.opts.provider.capabilities.write) {
      row.draggable = true;
      row.addEventListener('dragstart', (ev) => {
        ev.dataTransfer?.setData(DRAG_TYPE, e.path);
        ev.dataTransfer?.setData('text/plain', e.path);
      });
      if (e.kind === 'directory') this.dropTarget(row, e.path);
    }
    const li = el('li', {}, row);
    if (e.kind === 'directory') {
      const open = this.expanded.has(e.path);
      row.setAttribute('aria-expanded', String(open));
      if (open) li.append(await this.renderDir(e.path));
    }
    return li;
  }

  private select(e: Entry, row: HTMLElement): void {
    this.selected = e;
    for (const r of this.tree.querySelectorAll('.fs-selected')) r.classList.remove('fs-selected');
    row.classList.add('fs-selected');
  }

  private async toggle(e: Entry, row: HTMLElement): Promise<void> {
    const li = row.parentElement!;
    if (this.expanded.has(e.path)) {
      this.expanded.delete(e.path);
      li.querySelector(':scope > ul')?.remove();
      row.setAttribute('aria-expanded', 'false');
    } else {
      this.expanded.add(e.path);
      row.setAttribute('aria-expanded', 'true');
      try {
        li.append(await this.renderDir(e.path));
      } catch (err) {
        this.fail(err);
      }
    }
  }

  private dropTarget(target: HTMLElement, dir: string): void {
    target.addEventListener('dragover', (ev) => {
      if (!ev.dataTransfer?.types.includes(DRAG_TYPE)) return;
      ev.preventDefault();
      ev.stopPropagation();
      target.classList.add('fs-drop');
    });
    target.addEventListener('dragleave', () => target.classList.remove('fs-drop'));
    target.addEventListener('drop', (ev) => {
      target.classList.remove('fs-drop');
      const from = ev.dataTransfer?.getData(DRAG_TYPE);
      if (!from) return;
      ev.preventDefault();
      ev.stopPropagation();
      void this.moveInto(from, dir);
    });
  }

  /** The folder new entries go to: the selected folder, or the selected file's folder. */
  private targetDir(): string {
    const s = this.selected;
    if (!s) return '';
    return s.kind === 'directory' ? s.path : dirname(s.path);
  }

  private prompt(message: string, value: string): Promise<string | null> {
    return this.opts.prompt ? this.opts.prompt(message, value) : Promise.resolve(window.prompt(message, value));
  }

  private confirm(message: string): Promise<boolean> {
    return this.opts.confirm ? this.opts.confirm(message) : Promise.resolve(window.confirm(message));
  }

  private fail(err: unknown): void {
    const message = this.strings.error(err instanceof Error ? err.message : String(err));
    if (this.opts.onError) this.opts.onError(message);
    else console.error(message);
  }

  private async changed(change: ExplorerChange): Promise<void> {
    if (change.type !== 'remove') await this.reveal(change.to ?? change.path);
    else await this.refresh();
    await this.opts.onChange?.(change);
  }

  async createFile(kind: NewFileKind = this.opts.newFiles?.[0] ?? { label: this.strings.newFile, name: 'Untitled.txt', content: () => new Blob([]) }): Promise<Entry | undefined> {
    const dir = this.targetDir();
    const name = await this.prompt(this.strings.namePrompt, await freeName(this.provider, dir, kind.name));
    if (!name) return undefined;
    try {
      const path = join(dir, checkName(name));
      if ((await this.provider.list(dir)).some((e) => e.name.toLowerCase() === basename(path).toLowerCase())) throw new FsError('Exists', path, `“${basename(path)}” already exists.`);
      await this.provider.write(path, await kind.content());
      const entry: Entry = { name: basename(path), path, kind: 'file' };
      this.selected = entry;
      await this.changed({ type: 'create', path, kind: 'file' });
      this.opts.onOpen(entry);
      return entry;
    } catch (err) {
      this.fail(err);
      return undefined;
    }
  }

  async createFolder(): Promise<void> {
    const dir = this.targetDir();
    const name = await this.prompt(this.strings.namePrompt, await freeName(this.provider, dir, this.strings.folderName));
    if (!name) return;
    try {
      const path = join(dir, checkName(name));
      await this.provider.mkdir(path);
      this.expanded.add(path);
      this.selected = { name: basename(path), path, kind: 'directory' };
      await this.changed({ type: 'create', path, kind: 'directory' });
    } catch (err) {
      this.fail(err);
    }
  }

  async renameSelected(): Promise<void> {
    const s = this.selected;
    if (!s) return;
    const name = await this.prompt(this.strings.namePrompt, s.name);
    if (!name || name === s.name) return;
    try {
      const to = join(dirname(s.path), checkName(name));
      await this.provider.move(s.path, to);
      this.rebaseExpanded(s.path, to);
      this.selected = { ...s, name: basename(to), path: to };
      await this.changed({ type: 'rename', path: s.path, to, kind: s.kind });
    } catch (err) {
      this.fail(err);
    }
  }

  async moveInto(from: string, dir: string): Promise<void> {
    const to = join(dir, basename(from));
    if (to === from || dirname(from) === dir) return;
    if (isInside(dir, from)) return this.fail(new FsError('Invalid', to, `Cannot move ${from} into itself`));
    try {
      const kind = (await this.provider.list(dirname(from))).find((e) => e.path === from)?.kind ?? 'file';
      await this.provider.move(from, to);
      this.rebaseExpanded(from, to);
      this.expanded.add(dir);
      await this.changed({ type: 'move', path: from, to, kind });
    } catch (err) {
      this.fail(err);
    }
  }

  async removeSelected(): Promise<void> {
    const s = this.selected;
    if (!s || !(await this.confirm(this.strings.confirmRemove(s.name, s.kind === 'directory')))) return;
    try {
      await this.provider.remove(s.path, { recursive: true });
      this.selected = undefined;
      await this.changed({ type: 'remove', path: s.path, kind: s.kind });
    } catch (err) {
      this.fail(err);
    }
  }

  private rebaseExpanded(from: string, to: string): void {
    for (const d of [...this.expanded]) {
      if (d && isInside(d, from)) {
        this.expanded.delete(d);
        this.expanded.add(to + d.slice(from.length));
      }
    }
  }
}
