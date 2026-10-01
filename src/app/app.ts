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
import { pickFile, readFileBytes, replaceExtension, saveFile } from '../storage/file-io';
import type { AssistantPanel } from '../ai/panel';
import type { GitAccount } from '../git/accounts';
import type { GitRepo } from '../git/types';
import { button, h } from './dom';
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
}

const DEFAULT_FORMAT: Record<Exclude<DocumentKind, 'pdf'>, DocumentFormat> = {
  document: 'docx',
  spreadsheet: 'xlsx',
  presentation: 'pptx',
};

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
  private readonly busy: HTMLElement;
  private current: OpenDocument | null = null;
  private dirty = false;
  private busyTimer: ReturnType<typeof setTimeout> | undefined;
  private autosaveTimer: ReturnType<typeof setInterval> | undefined;
  private assistant: AssistantPanel | null = null;
  private unregisterAgentTools: (() => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: AppOptions = {},
  ) {
    this.header = h('header', { class: 'app-header' });
    this.main = h('main', { class: 'app-main', id: 'main' });
    this.statusBar = h('footer', { class: 'app-status', 'aria-live': 'polite' });
    this.alert = h('div', { class: 'app-alert', role: 'alert', hidden: true });
    this.busy = h('div', { class: 'app-busy', role: 'status', hidden: true }, t('app.working'));
    root.replaceChildren(this.header, this.alert, this.main, this.statusBar, this.busy);
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
      const formats = saveFormatsFor(doc.kind);
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
        const view = await newView(kind, this.viewContext());
        const format = DEFAULT_FORMAT[kind];
        this.setDocument({ name: replaceExtension(t('file.untitled', { kind: t(KIND_KEY[kind]) }), fileExtension(format)), format, kind, view });
      } catch (err) {
        this.showError((err as Error).message);
      }
    });
  }

  async save(format?: DocumentFormat): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    if (!format && doc.source) return this.commitToRepository();
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

  /** Hand the current document to QRShare (SHARE-001, SHARE-002). */
  async sendToDevice(): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    try {
      const bytes = await doc.view.save(doc.format);
      const file = new File([bytes as BlobPart], replaceExtension(doc.name, fileExtension(doc.format)), { type: MIME_TYPES[doc.format] });
      const { openSendDialog } = await import('../share/ui');
      await openSendDialog(this.root, file, doc.format, (message) => this.showNotice(message));
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
    this.current?.view.destroy();
    this.current = null;
    this.assistant?.reset();
    void this.toggleAssistant(false);
    this.unregisterAgentTools?.();
    this.unregisterAgentTools = null;
    this.dirty = false;
    this.discardDraft();
    this.showStart();
  }

  isDirty(): boolean {
    return this.dirty;
  }

  // ---------------------------------------------------------------------------

  private viewContext(): ViewContext {
    return {
      changed: () => {
        if (!this.dirty) {
          this.dirty = true;
          this.renderHeader();
        }
        this.renderStatus();
        this.scheduleAutosave();
      },
      statusChanged: () => this.renderStatus(),
      choose: (title, message, options, preselected) => this.choose(title, message, options, preselected),
    };
  }

  private setDocument(doc: OpenDocument, keepConversation = false): void {
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
        h('h1', {}, t('app.name')),
        h('p', { class: 'tagline' }, t('app.tagline')),
        h(
          'div',
          { class: 'start-actions' },
          button(t('start.newDocument'), () => void this.newDocument('document'), { className: 'card doc' }),
          button(t('start.newSpreadsheet'), () => void this.newDocument('spreadsheet'), { className: 'card sheet' }),
          button(t('start.newPresentation'), () => void this.newDocument('presentation'), { className: 'card pres' }),
          button(t('start.open'), () => void this.pickAndOpen(), { className: 'card open' }),
          button(t('git.open'), () => void this.openFromRepository(), { className: 'card repo', title: t('git.openTitle') }),
          button(t('share.receive'), () => void this.receiveFromDevice(), { className: 'card share', title: t('share.receiveTitle') }),
        ),
        h('p', { class: 'hint' }, t('start.tip')),
        this.languagePicker(),
        h('p', { class: 'source-link' }, h('a', { href: SOURCE_URL, target: '_blank', rel: 'noopener' }, t('app.source'))),
        recent,
      ),
    );
    this.renderStart?.(recent);
    void this.offerDraft(recent);
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
    ];
    if (doc) {
      items.push(
        h('span', { class: 'doc-name', title: doc.source ? `${t('git.source', { repo: doc.source.repo.name, branch: doc.source.branch })} — ${doc.source.path}` : formatLabel(doc.format) }, doc.name),
        doc.source ? h('span', { class: 'doc-source' }, `${doc.source.repo.name} · ${doc.source.branch}`) : null,
        this.dirty ? h('span', { class: 'modified', title: t('file.unsaved'), 'aria-label': t('file.unsaved') }, '●') : null,
      );
    }
    const actions = h('nav', { class: 'header-actions', 'aria-label': t('file.actions') });
    actions.append(
      button(t('file.open'), () => void this.pickAndOpen(), { title: t('file.openTitle') }),
      button(t('git.open'), () => void this.openFromRepository(), { title: t('git.openTitle'), text: '⎇', className: 'icon' }),
    );
    if (doc?.view.save) {
      actions.append(button(t('file.save'), () => void this.save(), { title: doc.source ? t('git.commitTitle') : t('file.saveTitle', { format: doc.format.toUpperCase() }) }));
      if (!doc.source) actions.append(button(t('git.commitButton'), () => void this.commitToRepository(), { title: t('git.commitTitle') }));
      const select = h(
        'select',
        { 'aria-label': t('file.saveAsFormat'), title: t('file.saveAsTitle') },
        h('option', { value: '' }, t('file.saveAs')),
        ...saveFormatsFor(doc.kind).map((f) => h('option', { value: f }, formatLabel(f))),
      );
      select.addEventListener('change', () => {
        const value = select.value as DocumentFormat | '';
        select.value = '';
        if (value) void this.save(value);
      });
      actions.append(select);
    }
    if (doc?.view.agentTools) actions.append(button(t('ai.open'), () => this.toggleAssistant(), { title: t('ai.openTitle'), text: '✨', className: 'icon', pressed: this.root.classList.contains('with-ai') }));
    if (doc?.view.save) actions.append(button(t('share.send'), () => void this.sendToDevice(), { title: t('share.sendTitle'), text: '📲', className: 'icon' }));
    if (doc) {
      actions.append(
        button(t('file.print'), () => void this.print(), { title: t('file.printTitle') }),
        button(t('file.close'), () => this.close(), { title: t('file.closeTitle') }),
      );
    }
    this.header.replaceChildren(...items.filter((n): n is Node => n !== null), actions);
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
