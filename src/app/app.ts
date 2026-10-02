/** Application shell: start screen, header toolbar, file open/save flow. */
import { getLocale, LOCALES, setLocale, t, type Locale } from '../i18n';
import {
  detectFormat,
  fileExtension,
  formatKind,
  formatLabel,
  MAX_FILE_SIZE,
  MIME_TYPES,
  saveFormatsFor,
  type DocumentFormat,
  type DocumentKind,
} from '../core/format';
import { defaultFormat, FORMAT_FAMILIES, loadFormatFamily, saveFormatFamily, type FormatFamily } from '../core/format-preference';
import { pickFile, readFileBytes, replaceExtension, saveFile } from '../storage/file-io';
import type { AssistantPanel } from '../ai/panel';
import type { GitAccount } from '../git/accounts';
import type { GitRepo } from '../git/types';
import { versionLabel } from './build-info';
import { button, h } from './dom';
import { applyTheme, loadTheme, nextTheme, saveTheme } from './theme';
import { newView, openView, type EditorView, type ViewContext } from './views';

/** Where a document opened from a git repository lives (GIT-003). */
interface RepoSource {
  account: GitAccount;
  repo: GitRepo;
  branch: string;
  path: string;
  version: string;
}

interface OpenDocument {
  name: string;
  format: DocumentFormat;
  kind: DocumentKind;
  view: EditorView;
  source?: RepoSource;
  /** Opened from a Grist document: Save sends the changes back (GRIST-003). */
  grist?: GristSource;
  /** Opened from or saved to Nextcloud / WebDAV: Save writes it back (DAV-003). */
  dav?: CloudSource;
  /** Path in the open folder: Save writes it back there (FOLDER-001). */
  folderPath?: string;
  /** Shown without allowing changes (FILE-017). */
  readOnly?: boolean;
  /** Its source cannot be written (read-only folder): editing needs a copy. */
  locked?: boolean;
}

interface CloudSource {
  account: import('../webdav/ui').DavAccount;
  path: string;
  /** Version that was read or last written, to detect concurrent changes. */
  etag?: string;
}

interface GristSource {
  account: import('../grist/ui').GristAccount;
  doc: import('../grist/client').GristDoc;
  snapshot: import('../grist/workbook').GristSnapshot;
}


/** Storage for the autosaved draft (FILE-011). */
export interface DraftStore {
  save(draft: { name: string; format: DocumentFormat; bytes: Uint8Array }): Promise<void>;
  load(): Promise<{ name: string; format: DocumentFormat; bytes: Uint8Array; savedAt?: number } | undefined>;
  clear(): Promise<void>;
}

export interface AppOptions {
  drafts?: DraftStore;
  /** Autosave period in milliseconds (default 30 s). */
  autosaveMs?: number;
}

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** AGPL-3.0 §13: offer the source code to every user. */
const SOURCE_URL = 'https://github.com/s-celles/progressive-web-office';

const KIND_KEY = { document: 'kind.document', spreadsheet: 'kind.spreadsheet', presentation: 'kind.presentation', pdf: 'kind.pdf' } as const;

export class App {
  private readonly header: HTMLElement;
  private readonly main: HTMLElement;
  private readonly statusBar: HTMLElement;
  private readonly alert: HTMLElement;
  /** "Read-only" banner with Edit / Edit a copy (FILE-017). */
  private readonly roBanner: HTMLElement;
  private readonly busy: HTMLElement;
  private current: OpenDocument | null = null;
  private dirty = false;
  private busyTimer: ReturnType<typeof setTimeout> | undefined;
  private autosaveTimer: ReturnType<typeof setInterval> | undefined;
  private assistant: AssistantPanel | null = null;
  private unregisterAgentTools: (() => void) | null = null;
  /** Real-time collaboration session on the open document (COLLAB-001). */
  private collab: import('../collab/ui').Collaboration | null = null;
  /** The open folder and its side panel (FOLDER-001). */
  private folder: import('../folder/panel').FolderPanel | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: AppOptions = {},
  ) {
    this.header = h('header', { class: 'app-header' });
    this.main = h('main', { class: 'app-main', id: 'main' });
    this.statusBar = h('footer', { class: 'app-status', 'aria-live': 'polite' });
    this.alert = h('div', { class: 'app-alert', role: 'alert', hidden: true });
    this.roBanner = h('div', { class: 'readonly-banner', role: 'status', hidden: true });
    this.busy = h('div', { class: 'app-busy', role: 'status', hidden: true }, t('app.working'));
    root.replaceChildren(this.header, this.alert, this.roBanner, this.main, this.statusBar, this.busy);
    // Side panels (folder, assistant) start under the header, which wraps on narrow screens.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => root.style.setProperty('--header-h', `${this.header.offsetHeight}px`)).observe(this.header);
    }
    root.classList.add('app');
    root.dataset.dropLabel = t('start.drop');
    this.installDropZone();
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    this.showStart();
  }

  /** Show an error coming from outside the shell (e.g. a damaged document link). */
  notifyError(message: string): void {
    this.showError(message);
  }

  /** Open a user-provided file (picker, drop, file handler, recent list). */
  async openFile(file: File): Promise<void> {
    if (file.size > MAX_FILE_SIZE) {
      this.showError(t('error.tooLarge', { name: file.name, limit: MAX_FILE_SIZE / 1024 / 1024 }));
      return;
    }
    if (!this.confirmDiscard()) return;
    await this.withBusy(async () => {
      const bytes = await readFileBytes(file);
      const format = await this.openBytes(file.name, bytes);
      if (format) this.onFileOpened?.(file, format);
    });
  }

  /** Detect the format and show the matching editor; returns the format on success. */
  private async openBytes(name: string, bytes: Uint8Array, source?: RepoSource): Promise<DocumentFormat | null> {
    try {
      const format = detectFormat(name, bytes);
      if (!format) {
        this.showError(t('error.unsupported', { name }));
        return null;
      }
      const view = await openView(format, bytes, this.viewContext(), name);
      const doc: OpenDocument = { name, format, kind: formatKind(format), view };
      if (source) doc.source = source;
      this.setDocument(doc);
      return format;
    } catch (err) {
      if ((err as Error).name !== 'MdzCancelled') this.showError(t('error.open', { name, message: (err as Error).message }));
      return null;
    }
  }

  /** Open a file from Nextcloud / WebDAV (DAV-002). */
  async openFromCloud(): Promise<void> {
    if (!this.confirmDiscard()) return;
    const { browseCloud } = await import('../webdav/ui');
    const file = await browseCloud(this.root, 'open');
    if (!file) return;
    await this.withBusy(async () => {
      if (!(await this.openBytes(basename(file.path), file.bytes))) return;
      if (this.current) this.current.dav = { account: file.account, path: file.path, ...(file.etag ? { etag: file.etag } : {}) };
      this.renderHeader();
    });
  }

  /**
   * Save to Nextcloud / WebDAV (DAV-003): back to where the document came from,
   * or to a chosen place. Never overwrites a newer version silently (DAV-004).
   */
  async saveToCloud(choose = false): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    const { browseCloud, davClient, davErrorMessage } = await import('../webdav/ui');
    let target = choose ? undefined : doc.dav;
    let format = doc.format;
    if (!target) {
      const chosen = await browseCloud(this.root, 'save', doc.name);
      if (!chosen) return;
      const formats = saveFormatsFor(doc.kind, loadFormatFamily());
      const ext = chosen.path.slice(chosen.path.lastIndexOf('.') + 1).toLowerCase();
      const match = formats.find((f) => fileExtension(f) === ext);
      if (!match) {
        this.showError(t('git.badExtension', { list: formats.map((f) => `.${fileExtension(f)}`).join(', ') }));
        return;
      }
      format = match;
      target = { account: chosen.account, path: chosen.path };
    }
    const location = target;
    await this.withBusy(async () => {
      const client = davClient(location.account);
      const bytes = await doc.view.save!(format);
      let path = location.path;
      let result: { etag?: string };
      try {
        try {
          result = await client.write(path, bytes, location.etag);
        } catch (err) {
          if (!(err instanceof Error && 'conflict' in err && (err as { conflict: boolean }).conflict)) throw err;
          // DAV-004: the file changed (or exists) on the server.
          const overwrite = t('dav.conflictOverwrite');
          const copy = t('dav.conflictCopy');
          const answer = await this.choose(t('dav.conflictTitle'), t(location.etag ? 'dav.conflictChanged' : 'dav.conflictExists', { path }), [copy, overwrite], copy, t('common.continue'));
          if (!answer) return;
          if (answer === copy) {
            const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
            const dot = path.lastIndexOf('.');
            path = dot > path.lastIndexOf('/') ? `${path.slice(0, dot)}-copy-${stamp}${path.slice(dot)}` : `${path}-copy-${stamp}`;
            result = await client.write(path, bytes);
          } else {
            result = await client.write(path, bytes, undefined, true);
          }
        }
      } catch (err) {
        this.showError(davErrorMessage(err));
        return;
      }
      doc.dav = { account: location.account, path, ...(result.etag ? { etag: result.etag } : {}) };
      doc.name = basename(path);
      doc.format = format;
      this.dirty = false;
      this.discardDraft();
      this.renderHeader();
      this.showNotice(t('dav.saved', { path }));
    });
  }

  /** Open a Grist document as a workbook, one sheet per table (GRIST-002). */
  async openFromGrist(): Promise<void> {
    if (!this.confirmDiscard()) return;
    const { pickGristDocument, gristClient, gristErrorMessage } = await import('../grist/ui');
    const choice = await pickGristDocument(this.root);
    if (!choice) return;
    await this.withBusy(async () => {
      try {
        const snapshot = await gristClient(choice.account).readDocument(choice.doc.id);
        await this.showGristDocument({ ...choice, snapshot });
      } catch (err) {
        this.showError(gristErrorMessage(err));
      }
    });
  }

  private async showGristDocument(source: GristSource): Promise<void> {
    const [{ gristToWorkbook }, { writeWorkbook }] = await Promise.all([import('../grist/workbook'), import('../sheet/io')]);
    const format = defaultFormat('spreadsheet') as 'ods' | 'xlsx';
    const bytes = writeWorkbook(gristToWorkbook(source.snapshot), format);
    if (!(await this.openBytes(`${source.doc.name}.${format}`, bytes))) return;
    if (this.current) this.current.grist = source;
    this.dirty = false;
    this.renderHeader();
  }

  /** Send the changes of the open workbook to its Grist document (GRIST-003). */
  async saveToGrist(): Promise<void> {
    const doc = this.current;
    if (!doc?.grist || !doc.view.save) return;
    const source = doc.grist;
    const [{ gristChanges }, { readWorkbook }, { gristClient, gristErrorMessage }] = await Promise.all([import('../grist/workbook'), import('../sheet/io'), import('../grist/ui')]);
    const changes = gristChanges(source.snapshot, readWorkbook('xlsx', await doc.view.save('xlsx')));
    if (!changes.length) {
      this.showNotice(t('grist.noChanges'));
      return;
    }
    const removed = changes.reduce((n, c) => n + c.remove.length, 0);
    if (removed && !window.confirm(t('grist.removeConfirm', { n: removed }))) return;
    await this.withBusy(async () => {
      try {
        const client = gristClient(source.account);
        await client.apply(source.snapshot.docId, changes);
        // Reload: new rows get their ids, formulas their new values.
        const snapshot = await client.readDocument(source.snapshot.docId);
        await this.showGristDocument({ ...source, snapshot });
        const rows = changes.reduce((n, c) => n + c.update.length + c.add.length + c.remove.length, 0);
        this.showNotice(t('grist.saved', { n: rows, name: source.doc.name }));
      } catch (err) {
        this.showError(gristErrorMessage(err));
      }
    });
  }

  /** Open a file from a GitHub/GitLab repository (GIT-002). */
  async openFromRepository(): Promise<void> {
    if (!this.confirmDiscard()) return;
    const { browseRepository } = await import('../git/ui');
    const file = await browseRepository(this.root, 'open');
    if (!file) return;
    const { bytes, ...location } = file;
    await this.withBusy(async () => {
      await this.openBytes(basename(file.path), bytes, location);
    });
  }

  /** Commit the current document to its repository, or to a chosen one (GIT-003..GIT-005). */
  async commitToRepository(): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    const [{ browseRepository, commitDialog }, { clientFor }, { GitConflictError }] = await Promise.all([import('../git/ui'), import('../git/accounts'), import('../git/types')]);
    let format = doc.format;
    let location: Omit<RepoSource, 'version'>;
    let version: string | undefined;
    if (doc.source) {
      ({ version, ...location } = doc.source);
    } else {
      const chosen = await browseRepository(this.root, 'save', doc.name);
      if (!chosen) return;
      const formats = saveFormatsFor(doc.kind, loadFormatFamily());
      const ext = chosen.path.slice(chosen.path.lastIndexOf('.') + 1).toLowerCase();
      const match = formats.find((f) => fileExtension(f) === ext);
      if (!match) {
        this.showError(t('git.badExtension', { list: formats.map((f) => `.${fileExtension(f)}`).join(', ') }));
        return;
      }
      format = match;
      location = chosen;
      version = await this.repoVersion(chosen);
    }
    const choice = await commitDialog(this.root, location.path, location.branch, version !== undefined);
    if (!choice) return;
    const client = clientFor(location.account);
    await this.withBusy(async () => {
      try {
        const bytes = await doc.view.save!(format);
        let { branch, path } = location;
        if (choice.createBranch) await client.createBranch(location.repo.id, branch, choice.branch);
        if (choice.branch !== branch) {
          branch = choice.branch;
          version = await this.repoVersion({ ...location, branch });
        }
        let result: { version: string };
        try {
          result = await client.writeFile(location.repo.id, branch, path, bytes, choice.message, version);
        } catch (err) {
          if (!(err instanceof GitConflictError)) throw err;
          // GIT-004: never overwrite; offer a new branch or a copy.
          const newBranch = t('git.conflictNewBranch');
          const answer = await this.choose(t('git.conflictTitle'), t('git.conflictMessage', { path }), [newBranch, t('git.conflictCopy')], newBranch, t('common.continue'));
          if (!answer) return;
          const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
          if (answer === newBranch) {
            const created = `pwo/${stamp}`;
            await client.createBranch(location.repo.id, branch, created);
            branch = created;
            result = await client.writeFile(location.repo.id, branch, path, bytes, choice.message, await this.repoVersion({ ...location, branch }));
          } else {
            const dot = path.lastIndexOf('.');
            path = dot > path.lastIndexOf('/') ? `${path.slice(0, dot)}-copy-${stamp}${path.slice(dot)}` : `${path}-copy-${stamp}`;
            result = await client.writeFile(location.repo.id, branch, path, bytes, choice.message);
          }
        }
        if (this.current !== doc) return;
        doc.source = { ...location, branch, path, version: result.version };
        doc.name = basename(path);
        doc.format = format;
        this.dirty = false;
        this.discardDraft();
        this.renderHeader();
        this.renderStatus();
        this.showNotice(t('git.committed', { path, branch }));
      } catch (err) {
        this.showError(t('error.git', { message: (err as Error).message }));
      }
    });
  }

  /** Current version of a file in a repository, or undefined when it does not exist. */
  private async repoVersion(location: Omit<RepoSource, 'version'>): Promise<string | undefined> {
    const { clientFor } = await import('../git/accounts');
    try {
      return (await clientFor(location.account).readFile(location.repo.id, location.branch, location.path)).version;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return undefined;
      throw err;
    }
  }

  /** Hook used by the recent-files feature. */
  onFileOpened?: (file: File, format: DocumentFormat) => void;

  async newDocument(kind: Exclude<DocumentKind, 'pdf'>): Promise<void> {
    if (!this.confirmDiscard()) return;
    await this.withBusy(async () => {
      try {
        const format = defaultFormat(kind);
        const view = await newView(kind, this.viewContext(), format);
        this.setDocument({ name: replaceExtension(t('file.untitled', { kind: t(KIND_KEY[kind]) }), fileExtension(format)), format, kind, view });
      } catch (err) {
        this.showError((err as Error).message);
      }
    });
  }

  async save(format?: DocumentFormat): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    // FILE-017: a read-only document is not saved in place; "Save as" makes a copy.
    if (!format && doc.readOnly) return this.showNotice(t('ro.cannotSave'));
    if (!format && doc.source) return this.commitToRepository();
    if (!format && doc.grist) return this.saveToGrist();
    if (!format && doc.dav) return this.saveToCloud();
    if (doc.folderPath && this.folder?.provider.capabilities.write) return this.saveToFolder(format);
    const target = format ?? doc.format;
    try {
      const bytes = await doc.view.save(target);
      const name = replaceExtension(doc.name, fileExtension(target));
      if (await saveFile(bytes, name, target)) {
        doc.name = name;
        doc.format = target;
        this.dirty = false;
        this.discardDraft();
        this.renderHeader();
      }
    } catch (err) {
      this.showError(t('error.save', { message: (err as Error).message }));
    }
  }

  /** Save a copy through one of the view's save variants; the open document is unchanged (PDF-010). */
  async saveCopy(id: string): Promise<void> {
    const doc = this.current;
    const variant = doc?.view.saveVariants?.().find((v) => v.id === id);
    if (!doc || !variant) return;
    try {
      const bytes = await variant.save();
      const dot = doc.name.lastIndexOf('.');
      const stem = dot > 0 ? doc.name.slice(0, dot) : doc.name;
      const name = `${stem}${variant.suffix}.${fileExtension(variant.format)}`;
      if (await saveFile(bytes, name, variant.format)) this.showNotice(t('file.copySaved', { name }));
    } catch (err) {
      this.showError(t('error.save', { message: (err as Error).message }));
    }
  }

  /** Hand the current document to QRShare (SHARE-001, SHARE-002). */
  async sendToDevice(): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    try {
      const bytes = await doc.view.save(doc.format);
      const file = new File([bytes as BlobPart], replaceExtension(doc.name, fileExtension(doc.format)), { type: MIME_TYPES[doc.format] });
      // Links carry text documents as Markdown, much shorter than DOCX (SHARE-009).
      const linkFile = doc.kind === 'document' && doc.format !== 'md' ? new File([(await doc.view.save('md')) as BlobPart], replaceExtension(doc.name, 'md'), { type: MIME_TYPES.md }) : file;
      const { openSendDialog } = await import('../share/ui');
      await openSendDialog(this.root, file, doc.format, (message) => this.showNotice(message), linkFile);
    } catch (err) {
      this.showError(t('error.save', { message: (err as Error).message }));
    }
  }

  /** Open QRShare's receive screen (SHARE-005). */
  async receiveFromDevice(): Promise<void> {
    const { loadShareSettings, receiveUrl } = await import('../share/qrshare');
    const settings = loadShareSettings();
    // QRShare hands the received file back to this address (SHARE-008, see pwa.ts).
    const back = new URL(location.pathname, location.origin);
    back.searchParams.set('handoff', 'qrshare');
    window.open(receiveUrl(settings.url, settings.policy, back.href), '_blank', 'noopener');
  }

  /** Show or hide the AI assistant panel (AI-001). */
  async toggleAssistant(show = !this.root.classList.contains('with-ai')): Promise<void> {
    if (!show) {
      this.root.classList.remove('with-ai');
      this.assistant?.element.remove();
      if (this.current) this.renderHeader();
      return;
    }
    if (!this.current?.view.agentTools) return;
    if (!this.assistant) {
      const { AssistantPanel } = await import('../ai/panel');
      this.assistant = new AssistantPanel({
        context: () => {
          const doc = this.current;
          return doc?.view.agentTools ? { kind: t(KIND_KEY[doc.kind]), name: doc.name, tools: doc.view.agentTools() } : null;
        },
        snapshot: () => this.snapshot(),
        confirm: (title, message) => this.confirmDialog(title, message),
        close: () => void this.toggleAssistant(false),
      });
    }
    this.root.classList.add('with-ai');
    this.root.append(this.assistant.element);
    this.renderHeader();
    this.assistant.focus();
  }

  /** Capture the open document so assistant changes can be undone (AI-003). */
  private async snapshot(): Promise<() => Promise<void>> {
    const doc = this.current;
    if (!doc?.view.save) return async () => undefined;
    const bytes = await doc.view.save(doc.format);
    const wasDirty = this.dirty;
    let restored: OpenDocument | null = doc;
    return async () => {
      // Only restore the document the changes were made to.
      if (!restored || this.current !== restored) return;
      const view = await openView(restored.format, bytes, this.viewContext(), restored.name);
      const again: OpenDocument = { ...restored, view };
      this.setDocument(again, true);
      restored = null;
      this.dirty = wasDirty;
      this.renderHeader();
    };
  }

  /** WebMCP: let in-browser AI agents use the document tools (AI-006). */
  private async exposeAgentTools(doc: OpenDocument): Promise<void> {
    this.unregisterAgentTools?.();
    this.unregisterAgentTools = null;
    const hasApi = !!((document as unknown as { modelContext?: unknown }).modelContext ?? (navigator as unknown as { modelContext?: unknown }).modelContext);
    if (!hasApi || !doc.view.agentTools) return;
    const { registerWebMcpTools } = await import('../ai/webmcp');
    if (this.current !== doc) return;
    this.unregisterAgentTools = registerWebMcpTools(doc.view.agentTools(), (tool, input) =>
      this.confirmDialog(t('ai.webmcpTitle'), t('ai.webmcpMessage', { tool: tool.name, input: JSON.stringify(input).slice(0, 300) }), t('common.allow')),
    );
  }

  /** Modal yes/no question. */
  confirmDialog(title: string, message: string, okLabel = t('common.continue')): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'confirm-title' });
      const finish = (value: boolean): void => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      const ok = button(okLabel, () => finish(true), { className: 'primary' });
      dialog.append(h('h2', { id: 'confirm-title' }, title), h('p', {}, message), h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), ok));
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        finish(false);
      });
      this.root.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      ok.focus();
    });
  }

  /** Print preview for editable documents, native printing otherwise (PRINT-001). */
  async print(): Promise<void> {
    const doc = this.current;
    if (!doc) return;
    const view = doc.view;
    if (view.printContent && doc.kind !== 'pdf') {
      const { openPrintPreview } = await import('../print/preview');
      await openPrintPreview(this.root, doc.kind, (s) => view.printContent!(s));
    } else if (view.print) {
      view.print();
    } else {
      window.print();
    }
  }

  close(): void {
    if (!this.confirmDiscard()) return;
    this.folder?.setCurrent(undefined);
    this.leaveCollaboration();
    this.current?.view.destroy();
    this.current = null;
    this.assistant?.reset();
    void this.toggleAssistant(false);
    this.unregisterAgentTools?.();
    this.unregisterAgentTools = null;
    this.dirty = false;
    this.discardDraft();
    this.renderReadOnly();
    this.showStart();
  }

  isDirty(): boolean {
    return this.dirty;
  }

  // ---------------------------------------------------------------------------

  private viewContext(): ViewContext {
    return {
      changed: () => {
        this.markChanged();
        this.collab?.changed();
      },
      statusChanged: () => {
        this.renderStatus();
        this.collab?.cursorMoved();
      },
      choose: (title, message, options, preselected) => this.choose(title, message, options, preselected),
      openLink: (href) => this.openLink(href),
      folderDocuments: () => this.folderDocuments(),
    };
  }

  private markChanged(): void {
    if (!this.dirty) {
      this.dirty = true;
      this.renderHeader();
    }
    this.renderStatus();
    this.scheduleAutosave();
  }

  // --- real-time collaboration (COLLAB-001..COLLAB-006) ------------------------

  /** Start a session on the open document and show the invitation. */
  async startCollaboration(): Promise<void> {
    const doc = this.current;
    if (!doc?.view.collab || (doc.kind !== 'document' && doc.kind !== 'spreadsheet') || this.collab) return;
    const { newCollabLink } = await import('../collab/link');
    const collab = await this.runCollaboration(newCollabLink(doc.kind), true);
    if (collab) void collab.invite();
  }

  /** Join the session of an invitation link (opens an empty document that fills from the others). */
  async joinCollaboration(link: import('../collab/link').CollabLink): Promise<void> {
    if (this.collab?.link.room === link.room) return;
    if (this.current && !(await this.confirmDialog(t('collab.title'), t('collab.joinConfirm', { kind: t(KIND_KEY[link.kind]) }), t('common.continue')))) {
      history.replaceState(null, '', this.collab ? this.collab.hash : `${location.pathname}${location.search}`);
      return;
    }
    this.leaveCollaboration();
    this.dirty = false;
    const format = defaultFormat(link.kind);
    const view = await newView(link.kind, this.viewContext(), format);
    this.setDocument({ name: replaceExtension(t('file.untitled', { kind: t(KIND_KEY[link.kind]) }), fileExtension(format)), format, kind: link.kind, view });
    await this.runCollaboration(link, false);
  }

  private async runCollaboration(link: import('../collab/link').CollabLink, initiator: boolean): Promise<import('../collab/ui').Collaboration | null> {
    const doc = this.current;
    const adapter = doc?.view.collab?.();
    if (!doc || !adapter) return null;
    try {
      const { Collaboration } = await import('../collab/ui');
      const collab = await Collaboration.start(link, adapter, initiator, {
        dialogHost: this.root,
        onRemote: () => this.markChanged(),
        onLeave: () => this.leaveCollaboration(),
        confirm: (title, message, ok) => this.confirmDialog(title, message, ok),
      });
      if (this.current !== doc) {
        collab.destroy();
        return null;
      }
      this.collab = collab;
      // Keep the invitation in the address: a reload rejoins the session.
      history.replaceState(null, '', `${location.pathname}${location.search}${collab.hash}`);
      this.root.insertBefore(collab.bar, this.main);
      this.renderHeader();
      return collab;
    } catch (err) {
      this.showError(t('collab.failed', { message: (err as Error).message }));
      return null;
    }
  }

  leaveCollaboration(): void {
    if (!this.collab) return;
    this.collab.destroy();
    this.collab = null;
    if (location.hash.startsWith('#collab=')) history.replaceState(null, '', `${location.pathname}${location.search}`);
    this.renderHeader();
  }

  private setDocument(doc: OpenDocument, keepConversation = false): void {
    this.leaveCollaboration();
    this.current?.view.destroy();
    this.current = doc;
    if (!keepConversation) this.assistant?.reset();
    if (!doc.view.agentTools) void this.toggleAssistant(false);
    void this.exposeAgentTools(doc);
    this.dirty = false;
    this.discardDraft();
    this.hideError();
    this.main.replaceChildren(doc.view.element);
    this.main.dataset.kind = doc.kind;
    this.renderReadOnly();
    doc.view.mounted?.();
    this.renderHeader();
    this.renderStatus();
    document.title = `${doc.name} — ${t('app.name')}`;
    doc.view.focus?.();
  }

  private showStart(): void {
    document.title = t('app.name');
    delete this.main.dataset.kind;
    const recent = h('section', { class: 'recent', 'aria-label': t('start.recent') });
    this.main.replaceChildren(
      h(
        'section',
        { class: 'start' },
        h('h1', {}, t('app.name'), ' ', h('span', { class: 'app-version-title' }, versionLabel())),
        h('p', { class: 'tagline' }, t('app.tagline')),
        h(
          'div',
          { class: 'start-actions' },
          button(t('start.newDocument'), () => void this.newDocument('document'), { className: 'card doc', icon: '📝' }),
          button(t('start.newSpreadsheet'), () => void this.newDocument('spreadsheet'), { className: 'card sheet', icon: '📊' }),
          button(t('start.newPresentation'), () => void this.newDocument('presentation'), { className: 'card pres', icon: '📽️' }),
          button(t('start.open'), () => void this.pickAndOpen(), { className: 'card open', icon: '📂' }),
          button(t('folder.open'), () => void this.openFolder(), { className: 'card folder', icon: '📁', title: t('folder.openTitle') }),
          button(t('git.open'), () => void this.openFromRepository(), { className: 'card repo', icon: '🗂️', title: t('git.openTitle') }),
          button(t('share.receive'), () => void this.receiveFromDevice(), { className: 'card share', icon: '📲', title: t('share.receiveTitle') }),
          button(t('dav.open'), () => void this.openFromCloud(), { className: 'card cloud', icon: '☁️', title: t('dav.openCardTitle') }),
          button(t('grist.open'), () => void this.openFromGrist(), { className: 'card grist', icon: '🗃️', title: t('grist.openTitle') }),
        ),
        h('p', { class: 'hint' }, t('start.tip')),
        h('div', { class: 'start-prefs' }, this.languagePicker(), this.formatPicker()),
        h(
          'p',
          { class: 'source-link' },
          // The documentation is published next to the app, under docs/ (see pages.yml).
          h('a', { href: new URL('docs/', document.baseURI).href, target: '_blank', rel: 'noopener' }, t('app.docs')),
          ' · ',
          h('a', { href: SOURCE_URL, target: '_blank', rel: 'noopener' }, t('app.source')),
          ' · ',
          button(t('about.open'), () => void this.showAbout(), { className: 'link', title: t('about.openTitle') }),
        ),
        recent,
      ),
    );
    this.renderStart?.(recent);
    void this.offerDraft(recent);
    void this.offerLastFolder(recent);
    this.renderHeader();
    this.renderStatus();
  }

  // --- autosave (FILE-011) -------------------------------------------------------

  private scheduleAutosave(): void {
    if (!this.options.drafts || this.autosaveTimer) return;
    this.autosaveTimer = setInterval(() => void this.autosave(), this.options.autosaveMs ?? 30_000);
  }

  private async autosave(): Promise<void> {
    const doc = this.current;
    if (!this.dirty || !doc?.view.save || !this.options.drafts) return;
    try {
      const bytes = await doc.view.save(doc.format);
      if (this.current === doc && this.dirty) await this.options.drafts.save({ name: doc.name, format: doc.format, bytes });
    } catch {
      /* autosave is best effort */
    }
  }

  private discardDraft(): void {
    clearInterval(this.autosaveTimer);
    this.autosaveTimer = undefined;
    void this.options.drafts?.clear().catch(() => undefined);
  }

  private async offerDraft(container: HTMLElement): Promise<void> {
    const draft = await this.options.drafts?.load().catch(() => undefined);
    if (!draft || !container.isConnected) return;
    const when = draft.savedAt ? new Date(draft.savedAt).toLocaleString() : '';
    container.prepend(
      h(
        'div',
        { class: 'draft-banner', role: 'status' },
        h('span', {}, t('draft.recovered', { when: when ? ` (${when})` : '' })),
        button(t('draft.restore', { name: draft.name }), () => void this.openFile(new File([draft.bytes as BlobPart], draft.name)), { className: 'primary' }),
        button(t('draft.discard'), () => {
          this.discardDraft();
          container.querySelector('.draft-banner')?.remove();
        }),
      ),
    );
  }

  private startRenderer?: (container: HTMLElement) => void;

  /** Hook used by the recent-files feature to fill the start screen. */
  set renderStart(fn: ((container: HTMLElement) => void) | undefined) {
    this.startRenderer = fn;
    const recent = this.main.querySelector<HTMLElement>('.recent');
    if (fn && recent && !this.current) fn(recent);
  }

  get renderStart(): ((container: HTMLElement) => void) | undefined {
    return this.startRenderer;
  }

  private renderHeader(): void {
    const doc = this.current;
    const items: (Node | null)[] = [
      h('span', { class: 'brand', 'aria-hidden': 'true' }, 'PWO'),
      // UI-013: version and build, like QRShare; opens the About window.
      button(versionLabel(), () => void this.showAbout(), { className: 'app-version', title: t('about.openTitle') }),
    ];
    if (doc) {
      items.push(
        h('span', { class: 'doc-name', title: doc.source ? `${t('git.source', { repo: doc.source.repo.name, branch: doc.source.branch })} — ${doc.source.path}` : formatLabel(doc.format) }, doc.name),
        doc.source ? h('span', { class: 'doc-source' }, `${doc.source.repo.name} · ${doc.source.branch}`) : null,
        doc.grist ? h('span', { class: 'doc-source' }, `Grist · ${new URL(doc.grist.account.serverUrl).host}`) : null,
        doc.dav ? h('span', { class: 'doc-source', title: doc.dav.path }, `☁ ${new URL(doc.dav.account.url).host}`) : null,
        this.dirty ? h('span', { class: 'modified', title: t('file.unsaved'), 'aria-label': t('file.unsaved') }, '●') : null,
      );
    }
    const actions = h('nav', { class: 'header-actions', 'aria-label': t('file.actions') });
    if (this.folder) actions.append(button(t('folder.panel'), () => this.toggleFolderPanel(), { text: '📁', className: 'icon', title: t('folder.toggleTitle', { name: this.folder.provider.label }), pressed: this.root.classList.contains('with-folder') }));
    if (doc?.view.masterDocument?.()?.blocks.some((b) => b.type === 'include')) actions.append(button(t('master.export'), () => void this.exportAssembled(), { title: t('master.exportTitle') }));
    actions.append(
      button(t('file.open'), () => void this.pickAndOpen(), { title: t('file.openTitle') }),
      button(t('git.open'), () => void this.openFromRepository(), { title: t('git.openTitle'), text: '⎇', className: 'icon' }),
    );
    if (doc?.view.save) {
      actions.append(button(t('file.save'), () => void this.save(), { className: 'keep', title: doc.source ? t('git.commitTitle') : doc.grist ? t('grist.saveTitle') : doc.dav ? t('dav.saveBackTitle', { path: doc.dav.path }) : t('file.saveTitle', { format: doc.format.toUpperCase() }) }));
      if (!doc.source && !doc.grist) actions.append(button(t('dav.saveToCloud'), () => void this.saveToCloud(true), { title: t('dav.saveToCloudTitle'), text: '☁', className: 'icon' }));
      if (!doc.source && !doc.grist) actions.append(button(t('git.commitButton'), () => void this.commitToRepository(), { title: t('git.commitTitle') }));
      const select = h(
        'select',
        { 'aria-label': t('file.saveAsFormat'), title: t('file.saveAsTitle') },
        h('option', { value: '' }, t('file.saveAs')),
        ...saveFormatsFor(doc.kind, loadFormatFamily()).map((f) => h('option', { value: f }, formatLabel(f))),
        ...(doc.view.saveVariants?.() ?? []).map((v) => h('option', { value: `variant:${v.id}` }, v.label)),
      );
      select.addEventListener('change', () => {
        const value = select.value;
        select.value = '';
        if (value.startsWith('variant:')) void this.saveCopy(value.slice('variant:'.length));
        else if (value) void this.save(value as DocumentFormat);
      });
      actions.append(select);
    }
    if (doc?.view.setReadOnly && !doc.locked) actions.append(button(t('ro.toggle'), () => this.setReadOnly(!doc.readOnly), { title: doc.readOnly ? t('ro.allowTitle') : t('ro.lockTitle'), text: doc.readOnly ? '🔒' : '🔓', className: 'icon', pressed: !!doc.readOnly }));
    if (doc?.view.agentTools) actions.append(button(t('ai.open'), () => this.toggleAssistant(), { title: t('ai.openTitle'), text: '✨', className: 'icon', pressed: this.root.classList.contains('with-ai') }));
    if (doc?.view.save) actions.append(button(t('share.send'), () => void this.sendToDevice(), { title: t('share.sendTitle'), text: '📲', className: 'icon' }));
    if (doc?.view.collab && (doc.kind === 'document' || doc.kind === 'spreadsheet')) {
      actions.append(button(t('collab.start'), () => (this.collab ? this.leaveCollaboration() : void this.startCollaboration()), { title: this.collab ? t('collab.leaveTitle') : t('collab.startTitle'), text: '👥', className: 'icon', pressed: !!this.collab }));
    }
    actions.append(this.themeButton());
    actions.append(button(t('about.open'), () => void this.showAbout(), { title: t('about.openTitle'), text: '?', className: 'icon' }));
    if (doc) {
      actions.append(
        button(t('file.print'), () => void this.print(), { title: t('file.printTitle') }),
        button(t('file.close'), () => this.close(), { title: t('file.closeTitle') }),
      );
    }
    // UI-014: on a phone, the actions other than Save go into a "⋯" menu.
    if (!doc?.view.save) actions.querySelector('button')?.classList.add('keep');
    const more = button(t('app.more'), () => {
      const open = this.header.classList.toggle('more-open');
      more.setAttribute('aria-expanded', String(open));
    }, { text: '⋯', className: 'icon more-toggle', title: t('app.moreTitle') });
    more.setAttribute('aria-expanded', 'false');
    actions.append(more);
    actions.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('button, select');
      if (target && target !== more && target.tagName === 'BUTTON') this.header.classList.remove('more-open');
    });
    actions.addEventListener('change', () => this.header.classList.remove('more-open'));
    this.header.classList.remove('more-open');
    this.header.replaceChildren(...items.filter((n): n is Node => n !== null), actions);
  }

  // --- read-only documents (FILE-017) -----------------------------------------------

  /** Show the open document read-only, or allow edits again; `locked` when its source cannot be written. */
  setReadOnly(readOnly: boolean, locked = false): void {
    const doc = this.current;
    if (!doc?.view.setReadOnly) return;
    doc.readOnly = readOnly;
    doc.locked = readOnly && (locked || !!doc.locked);
    doc.view.setReadOnly(readOnly);
    this.renderReadOnly();
    this.renderHeader();
  }

  /** Make the read-only document an editable, unsaved copy. */
  editCopy(): void {
    const doc = this.current;
    if (!doc) return;
    delete doc.folderPath;
    delete doc.source;
    delete doc.dav;
    delete doc.grist;
    doc.name = doc.name.replace(/(\.[^.]+)?$/, (ext) => `${t('ro.copySuffix')}${ext}`);
    doc.locked = false;
    this.folder?.setCurrent(undefined);
    this.setReadOnly(false);
    this.markChanged();
    document.title = `${doc.name} — ${t('app.name')}`;
  }

  private renderReadOnly(): void {
    const doc = this.current;
    this.roBanner.hidden = !doc?.readOnly;
    if (!doc?.readOnly) return this.roBanner.replaceChildren();
    this.roBanner.replaceChildren(
      h('span', {}, `🔒 ${doc.locked ? t('ro.lockedBanner') : t('ro.banner')}`),
      ...(doc.locked ? [] : [button(t('ro.edit'), () => this.setReadOnly(false), { title: t('ro.allowTitle') })]),
      button(t('ro.editCopy'), () => this.editCopy(), { title: t('ro.editCopyTitle'), className: doc.locked ? 'primary' : '' }),
    );
  }

  // --- folder mode (FOLDER-001..FOLDER-003) and master documents (DOC-028) ------

  /** Open a local folder as a project: its documents in a side panel. */
  async openFolder(): Promise<void> {
    const { canPickDirectory, pickDirectory, pickFileList, privateStorage } = await import('../fs');
    const { loadDavAccounts, davClient, davLabel } = await import('../webdav/ui');
    // FOLDER-006: a local folder, the browser's own storage, or a Nextcloud / WebDAV account.
    const local = canPickDirectory() ? t('folder.local') : t('folder.localReadOnly');
    const browser = t('folder.browserStorage');
    const accounts = loadDavAccounts();
    const cloud = accounts.map((a) => `☁ ${davLabel(a)}`);
    const choice = await this.choose(t('folder.open'), t('folder.where'), [local, browser, ...cloud], local);
    if (!choice) return;
    let folder;
    try {
      if (choice === browser) folder = await privateStorage('Documents', browser);
      else if (cloud.includes(choice)) {
        const account = accounts[cloud.indexOf(choice)]!;
        const { WebDavProvider } = await import('../webdav/provider');
        folder = new WebDavProvider(davClient(account), `webdav:${account.id}`, davLabel(account));
      }
      // Writable with the File System Access API (Chromium), read-only elsewhere.
      else folder = canPickDirectory() ? await pickDirectory() : await pickFileList();
    } catch (err) {
      this.showError(t('folder.error', { message: (err as Error).message }));
      return;
    }
    if (folder) await this.setFolder(folder);
  }

  private async setFolder(folder: import('../fs').StorageProvider): Promise<void> {
    const [{ FolderPanel }, { FolderIndex }, { rememberFolder }, { DirectoryHandleProvider }] = await Promise.all([import('../folder/panel'), import('../folder/search'), import('../storage/recent'), import('../fs')]);
    this.folder?.element.remove();
    const index = new FolderIndex(folder, async (name, bytes) => {
      const format = detectFormat(name, bytes);
      if (!format || formatKind(format) !== 'document') return undefined;
      const { readDocument } = await import('../document/io');
      return readDocument(format as import('../document/io').TextFormat, bytes);
    });
    this.folder = new FolderPanel(folder, index, {
      open: (path, query) => void this.openFromFolder(path, query),
      close: () => this.closeFolder(),
      changed: (change) => this.folderChanged(change),
      error: (message) => this.showError(message),
      prompt: async (message, value) => window.prompt(message, value),
      confirm: async (message) => window.confirm(message),
    });
    this.root.append(this.folder.element);
    this.root.classList.add('with-folder');
    await this.withBusy(() => this.folder!.refresh());
    if (folder instanceof DirectoryHandleProvider && folder.id.startsWith('fsa:')) void rememberFolder(folder.root);
    this.renderHeader();
  }

  private closeFolder(): void {
    this.folder?.element.remove();
    this.folder = null;
    this.root.classList.remove('with-folder');
    if (this.current) delete this.current.folderPath;
    this.renderHeader();
  }

  /** A file renamed, moved or deleted in the explorer: follow the open document (FOLDER-004). */
  private async folderChanged(change: import('../fs').ExplorerChange): Promise<void> {
    const doc = this.current;
    const { isInside } = await import('../fs');
    if (!doc?.folderPath || !isInside(doc.folderPath, change.path)) return;
    if (change.type === 'remove') {
      delete doc.folderPath;
      this.dirty = true;
    } else if (change.to) {
      doc.folderPath = change.to + doc.folderPath.slice(change.path.length);
      doc.name = basename(doc.folderPath);
    }
    this.folder?.setCurrent(doc.folderPath);
    this.renderHeader();
  }

  private toggleFolderPanel(): void {
    this.root.classList.toggle('with-folder');
    this.renderHeader();
  }

  /** On the start screen: reopen the folder opened last (permission is asked again). */
  private async offerLastFolder(recent: HTMLElement): Promise<void> {
    const { lastFolder } = await import('../storage/recent');
    const handle = await lastFolder();
    if (!handle || this.current || !recent.isConnected) return;
    const reopen = button(t('folder.reopen', { name: handle.name }), () => {
      void (async () => {
        const { DirectoryHandleProvider } = await import('../fs');
        const folder = new DirectoryHandleProvider(handle);
        if (await folder.permitted(true)) await this.setFolder(folder);
        else this.showError(t('folder.denied', { name: handle.name }));
      })();
    }, { className: 'card folder', icon: '📁' });
    recent.before(h('div', { class: 'start-actions folder-reopen' }, reopen));
  }

  /** Open a document of the folder; `query` shows its first match. */
  async openFromFolder(path: string, query?: string): Promise<void> {
    const folder = this.folder;
    if (!folder) return;
    if (this.current?.folderPath === path) {
      if (query) this.current.view.find?.(query);
      return;
    }
    if (!this.confirmDiscard()) return;
    await this.withBusy(async () => {
      const { readBytes } = await import('../fs');
      const bytes = await readBytes(folder.provider, path).catch(() => undefined);
      if (!bytes) return this.showError(t('folder.missing', { path }));
      if (!(await this.openBytes(basename(path), bytes))) return;
      if (this.current) this.current.folderPath = path;
      if (this.current && !folder.provider.capabilities.write) this.setReadOnly(true, true);
      folder.setCurrent(path);
      this.renderHeader();
      if (query) this.current?.view.find?.(query);
    });
  }

  /** Save into the folder, in place or next to it in another format. */
  private async saveToFolder(format?: DocumentFormat): Promise<void> {
    const doc = this.current;
    const folder = this.folder;
    if (!doc?.view.save || !doc.folderPath || !folder) return;
    const target = format ?? doc.format;
    const path = format ? replaceExtension(doc.folderPath, fileExtension(target)) : doc.folderPath;
    try {
      await folder.provider.write(path, new Blob([(await doc.view.save(target)) as BlobPart]));
      doc.folderPath = path;
      doc.name = basename(path);
      doc.format = target;
      this.dirty = false;
      this.discardDraft();
      if (format) await folder.refresh();
      folder.setCurrent(path);
      this.renderHeader();
    } catch (err) {
      this.showError(t('error.save', { message: (err as Error).message }));
    }
  }

  /** A link relative to the open document, opened from the folder (FOLDER-003). */
  private openLink(href: string): boolean {
    const folder = this.folder;
    if (!folder || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')) return false;
    const from = this.current?.folderPath ?? '';
    const target = decodeURI(href.replace(/[#?].*$/, ''));
    void import('../document/master').then(({ resolvePath }) => this.openFromFolder(resolvePath(from, target)));
    return true;
  }

  /** The folder's documents, relative to the open document (to include them, DOC-028). */
  private folderDocuments(): Promise<string[]> | undefined {
    const folder = this.folder;
    if (!folder) return undefined;
    const from = (this.current?.folderPath ?? '').split('/').slice(0, -1);
    return Promise.resolve(
      folder
        .files()
        .filter((p) => /\.(docx|odt|odm|md|markdown|mdz|tex)$/i.test(p) && p !== this.current?.folderPath)
        .map((p) => {
          const parts = p.split('/');
          let common = 0;
          while (common < from.length && common < parts.length - 1 && from[common] === parts[common]) common++;
          return [...Array(from.length - common).fill('..'), ...parts.slice(common)].join('/');
        }),
    );
  }

  /** Assemble a master document with its sub-documents and save it as one file (DOC-028). */
  async exportAssembled(): Promise<void> {
    const doc = this.current;
    const master = doc?.view.masterDocument?.();
    if (!doc || !master) return;
    const formats = saveFormatsFor('document', loadFormatFamily()).filter((f) => f !== 'mdz');
    const labels = formats.map((f) => formatLabel(f));
    const choice = await this.choose(t('master.export'), t('master.exportMessage'), labels, labels[0]!, t('file.save'));
    if (!choice) return;
    const format = formats[labels.indexOf(choice)]!;
    await this.withBusy(async () => {
      const [{ assemble }, { readDocument, writeDocumentAsync }] = await Promise.all([import('../document/master'), import('../document/io')]);
      const provider = this.folder?.provider;
      const { readBytes } = await import('../fs');
      const { doc: assembled, missing } = await assemble(master, doc.folderPath ?? doc.name, async (path) => {
        const bytes = provider ? await readBytes(provider, path).catch(() => undefined) : undefined;
        const fmt = bytes ? detectFormat(path, bytes) : null;
        return bytes && fmt && formatKind(fmt) === 'document' ? readDocument(fmt as import('../document/io').TextFormat, bytes) : undefined;
      });
      const bytes = await writeDocumentAsync(assembled, format as import('../document/io').TextFormat);
      const name = replaceExtension(doc.name.replace(/(\.[^.]+)$/, '-assembled$1'), fileExtension(format));
      await saveFile(bytes, name, format);
      if (missing.length) this.showError(t('master.missing', { files: missing.join(', ') }));
    });
  }

  /** About window (UI-012). */
  async showAbout(): Promise<void> {
    const { showAbout } = await import('./about');
    showAbout(this.root);
  }

  /** Cycles System → Light → Dark (UI-011). */
  private themeButton(): HTMLButtonElement {
    const theme = loadTheme();
    const icons = { system: '◐', light: '☀', dark: '☾' } as const;
    return button(
      t('theme.label', { mode: t(`theme.${theme}`) }),
      () => {
        const next = nextTheme(loadTheme());
        saveTheme(next);
        applyTheme(next);
        this.renderHeader();
        this.header.querySelector<HTMLButtonElement>('.theme-toggle')?.focus();
      },
      { text: icons[theme], className: 'icon theme-toggle' },
    );
  }

  private renderStatus(): void {
    const doc = this.current;
    this.statusBar.textContent = doc ? `${formatLabel(doc.format)}${doc.view.status ? ' · ' + doc.view.status() : ''}` : t('app.ready');
  }

  private async pickAndOpen(): Promise<void> {
    const file = await pickFile();
    if (file) await this.openFile(file);
  }

  private confirmDiscard(): boolean {
    return !this.dirty || window.confirm(t('file.discardConfirm'));
  }

  /** Format of new documents: open standards by default (FILE-016). */
  private formatPicker(): HTMLElement {
    const labels: Record<FormatFamily, string> = { open: t('formats.open'), microsoft: t('formats.microsoft') };
    const select = h('select', { 'aria-label': t('formats.label'), class: 'language', title: t('formats.title') }, ...FORMAT_FAMILIES.map((f) => h('option', { value: f, selected: f === loadFormatFamily() }, labels[f])));
    select.addEventListener('change', () => saveFormatFamily(select.value as FormatFamily));
    return h('label', { class: 'language-picker' }, `📄 ${t('formats.label')} `, select);
  }

  private languagePicker(): HTMLElement {
    const select = h('select', { 'aria-label': t('app.language'), class: 'language' }, ...LOCALES.map((l) => h('option', { value: l.code, selected: l.code === getLocale() }, l.label)));
    select.addEventListener('change', () => {
      setLocale(select.value as Locale);
      if (!this.current) this.showStart();
    });
    return h('label', { class: 'language-picker' }, `🌐 ${t('app.language')} `, select);
  }

  /** Modal choice dialog (MD-017). */
  choose(title: string, message: string, options: string[], preselected: string, okLabel = t('common.open')): Promise<string | null> {
    return new Promise((resolve) => {
      const name = 'choice';
      const list = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': title });
      for (const opt of options) {
        const input = h('input', { type: 'radio', name, value: opt, checked: opt === preselected });
        list.append(h('label', { class: 'choice' }, input, ` ${opt}`));
      }
      const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' });
      const finish = (value: string | null): void => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      const ok = button(okLabel, () => {
        const checked = dialog.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
        finish(checked?.value ?? null);
      }, { className: 'primary' });
      dialog.append(
        h('h2', { id: 'dlg-title' }, title),
        h('p', {}, message),
        list,
        h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), ok),
      );
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        finish(null);
      });
      this.root.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.querySelector<HTMLInputElement>('input:checked')?.focus();
    });
  }

  private showNotice(message: string): void {
    this.showError(message);
    this.alert.classList.add('notice');
  }

  private showError(message: string): void {
    this.alert.classList.remove('notice');
    this.alert.hidden = false;
    this.alert.replaceChildren(
      h('span', {}, message),
      button(t('common.dismiss'), () => this.hideError(), { text: '×', className: 'icon' }),
    );
  }

  private hideError(): void {
    this.alert.hidden = true;
    this.alert.replaceChildren();
  }

  private async withBusy(task: () => Promise<void>): Promise<void> {
    this.busyTimer = setTimeout(() => (this.busy.hidden = false), 300);
    try {
      await task();
    } finally {
      clearTimeout(this.busyTimer);
      this.busy.hidden = true;
    }
  }

  private installDropZone(): void {
    this.root.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        this.root.classList.add('dragging');
      }
    });
    this.root.addEventListener('dragleave', (e) => {
      if (e.target === this.root || !this.root.contains(e.relatedTarget as Node)) this.root.classList.remove('dragging');
    });
    this.root.addEventListener('drop', (e) => {
      this.root.classList.remove('dragging');
      const file = e.dataTransfer?.files[0];
      if (file) {
        e.preventDefault();
        void this.openFile(file);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void this.save();
      } else if (key === 'o') {
        e.preventDefault();
        void this.pickAndOpen();
      }
    });
  }
}
