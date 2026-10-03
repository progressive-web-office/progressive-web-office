/**
 * Runs code cells in an isolated sandbox (CODE-002, CODE-003). One runner
 * per open document: Python cells share one interpreter, like a notebook.
 *
 * The sandbox cannot reach the network. It asks this runner for the files of
 * the Python runtime, which are served by the application itself (cached by
 * the service worker), and for Python packages, which are downloaded from the
 * Pyodide CDN on first use and checked against the hashes of the lock file.
 */
import workerUrl from './sandbox.worker.ts?worker&url';
import { bootstrapHash, sandboxSrcdoc } from './sandbox-html';
import type { CodeLang } from '../document/model';
import PWO_WIDGETS from './widgets/pwo_widgets.py?raw';
import { WidgetHost, type CommMessage } from './widgets/host';

/** Pyodide version bundled with the application (see vite.config.ts). */
export const PYODIDE_VERSION = '314.0.7';
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const CORE_FILES = new Set(['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']);

export interface RunResult {
  text: string;
  error?: boolean;
  /** PNG images (matplotlib figures). */
  images: Uint8Array[];
  /** CODE-016: models of the widgets the cell shows. */
  widgets?: string[];
}

export type RunStatus = 'loading-python' | 'running' | `packages:${string}`;

interface Pending {
  resolve(result: RunResult): void;
  onStatus?: (status: RunStatus) => void;
}

const coreUrl = (name: string): string => new URL(`pyodide/${name}`, document.baseURI).href;

/** CODE-016, CODE-018: sites the user agreed to download code from, until the page is closed. */
const ALLOWED = new Set<string>();

export class CodeRunner {
  private frame: HTMLIFrameElement | undefined;
  private ready: Promise<void> | undefined;
  private packages: Set<string> | undefined;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly onMessage = (e: MessageEvent): void => this.handle(e);

  constructor(private readonly host: HTMLElement = document.body) {}

  private widgetHost: WidgetHost | undefined;
  /** CODE-016: the widgets of the document's code. */
  get widgets(): WidgetHost {
    this.widgetHost ??= new WidgetHost((comm_id, data, buffers) => this.post({ type: 'comm', comm_id, data, buffers }, buffers));
    return this.widgetHost;
  }
  /** A widget marked with `ui()` changed: the names bound to it, by language. */
  onWidgetChanged?: (lang: CodeLang, names: string[]) => void;
  /** Ask the user before downloading code (packages, widget modules) from `origin`. */
  confirmDownload?: (origin: string) => Promise<boolean>;

  run(lang: CodeLang, code: string, onStatus?: (status: RunStatus) => void, project?: import('./project').RunProject): Promise<RunResult> {
    // CODE-018: R runs in a sandbox of its own, which downloads webR itself once the user agreed.
    if (lang === 'r') return this.runR(code, onStatus, project);
    return this.start().then(
      () =>
        new Promise<RunResult>((resolve) => {
          const id = ++this.nextId;
          this.pending.set(id, { resolve, onStatus });
          this.post({ type: 'run', id, lang, code, ...(project ? { project } : {}) });
        }),
    );
  }

  /**
   * CODE-011: completions of the running Python interpreter (null when it is
   * not running: it is not started only for this, nor waited for long).
   */
  complete(code: string, line: number, column: number, timeoutMs = 2500, onLate?: () => void): Promise<import('./completion').SmartItem[] | null> {
    if (!this.ready || !this.frame) return Promise.resolve(null);
    return new Promise((resolve) => {
      const id = ++this.nextId;
      let late = false;
      const timer = setTimeout(() => {
        // The first completions wait for jedi to load: not answered in time, the
        // request still runs, and its answer asks the editor to complete again.
        late = true;
        resolve(null);
      }, timeoutMs);
      this.completions.set(id, (items) => {
        clearTimeout(timer);
        if (!late) resolve(items);
        else if (items?.length) onLate?.();
      });
      this.post({ type: 'complete', id, code, line, column });
    });
  }

  private readonly completions = new Map<number, (items: import('./completion').SmartItem[] | null) => void>();

  /** CODE-014: the names a Python cell defines and uses (null for a syntax error). */
  analyze(code: string): Promise<import('./reactive').CellDeps | null> {
    return this.start().then(
      () =>
        new Promise((resolve) => {
          const id = ++this.nextId;
          this.analyses.set(id, resolve);
          this.post({ type: 'analyze', id, code });
        }),
    );
  }

  private readonly analyses = new Map<number, (deps: import('./reactive').CellDeps | null) => void>();

  /** CODE-014: remove names no cell defines any more. */
  forget(lang: CodeLang, names: string[]): void {
    if (this.frame && names.length) this.post({ type: 'forget', lang, names });
  }

  private r: import('./r-runtime').RRuntime | undefined;

  private async runR(code: string, onStatus?: (status: RunStatus) => void, project?: import('./project').RunProject): Promise<RunResult> {
    const { WEBR_ORIGIN } = await import('./r-frame-html');
    if (!this.allowed.has(WEBR_ORIGIN)) {
      if (!(await this.confirmDownload?.(WEBR_ORIGIN))) return { text: `Download from ${WEBR_ORIGIN} refused\n`, error: true, images: [] };
      this.allowed.add(WEBR_ORIGIN);
    }
    const { RRuntime } = await import('./r-runtime');
    this.r ??= new RRuntime(this.host);
    return this.r.run(code, onStatus, project);
  }

  /** Whether the sandbox runs (and holds the names of earlier runs). */
  get started(): boolean {
    return !!this.ready;
  }

  /** Stop whatever is running: the sandbox is destroyed and restarted on the next run. */
  stop(reason = 'Stopped.'): void {
    this.r?.stop(reason);
    this.frame?.remove();
    this.frame = undefined;
    this.ready = undefined;
    removeEventListener('message', this.onMessage);
    for (const p of this.pending.values()) p.resolve({ text: `${reason}\n`, error: true, images: [] });
    this.pending.clear();
    for (const done of this.analyses.values()) done(null);
    this.analyses.clear();
    // The models lived in the stopped interpreter.
    this.widgetHost?.destroy();
    this.widgetHost = undefined;
  }

  destroy(): void {
    this.stop();
    this.r?.destroy();
  }

  get running(): boolean {
    return this.pending.size > 0;
  }

  // ---------------------------------------------------------------------------

  private start(): Promise<void> {
    this.ready ??= (async () => {
      const [hash, workerSource] = await Promise.all([
        bootstrapHash((data) => crypto.subtle.digest('SHA-256', data as BufferSource)),
        fetch(workerUrl).then((r) => r.text()),
      ]);
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.className = 'code-sandbox';
      frame.hidden = true;
      frame.setAttribute('aria-hidden', 'true');
      this.frame = frame;
      const loaded = new Promise<void>((resolve) => {
        this.readyResolve = resolve;
      });
      addEventListener('message', this.onMessage);
      frame.srcdoc = sandboxSrcdoc(hash);
      this.host.append(frame);
      await loaded;
      this.post({ type: 'start', workerSource });
    })();
    return this.ready;
  }

  private readyResolve: (() => void) | undefined;

  private post(message: Record<string, unknown>, transfer: Transferable[] = []): void {
    this.frame?.contentWindow?.postMessage({ ...message, transfer }, '*', transfer);
  }

  private handle(e: MessageEvent): void {
    if (!this.frame || e.source !== this.frame.contentWindow) return;
    const m = e.data as { type: string; id: number; name?: string; text?: string; error?: boolean; images?: ArrayBuffer[]; message?: string; items?: unknown };
    switch (m.type) {
      case 'ready':
        this.readyResolve?.();
        break;
      case 'file-request':
        void this.serveFile(m.id, m.name ?? '');
        break;
      case 'status':
        this.pending.get(m.id)?.onStatus?.(m.text as RunStatus);
        break;
      case 'result': {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        p?.resolve({ text: m.text ?? '', error: m.error, images: (m.images ?? []).map((b) => new Uint8Array(b)), ...((m as { widgets?: string[] }).widgets?.length ? { widgets: (m as { widgets?: string[] }).widgets } : {}) });
        break;
      }
      case 'deps': {
        const done = this.analyses.get(m.id);
        this.analyses.delete(m.id);
        const d = (m as { deps?: unknown }).deps as import('./reactive').CellDeps | null | undefined;
        done?.(d && Array.isArray(d.defs) && Array.isArray(d.refs) ? d : null);
        break;
      }
      case 'completions': {
        const done = this.completions.get(m.id);
        this.completions.delete(m.id);
        done?.(Array.isArray(m.items) ? (m.items as import('./completion').SmartItem[]) : null);
        break;
      }
      case 'comm':
        this.widgets.handle(m as unknown as CommMessage);
        break;
      case 'widget-changed': {
        const w = m as unknown as { lang: CodeLang; names: string[] };
        this.onWidgetChanged?.(w.lang, w.names);
        break;
      }
      case 'fetch-request': {
        const f = m as unknown as { id: number; spec: string; kind: 'python' | 'module' };
        void this.download(f.spec, f.kind).then(
          (files) => this.post({ type: 'fetched', id: f.id, files }, files),
          (err: Error) => this.post({ type: 'fetched', id: f.id, error: err.message }),
        );
        break;
      }
      case 'fatal':
        this.stop(m.message ?? 'The sandbox stopped.');
        break;
    }
  }

  /** Download packages or a widget module the code asked for, once the user agreed for that site. */
  private async download(spec: string, kind: 'python' | 'module'): Promise<ArrayBuffer[]> {
    const [{ resolveSpec }, { runtimeHash }] = await Promise.all([import('./widgets/packages'), import('./runtimes')]);
    const files = await resolveSpec(spec, kind, async (url) => {
      const origin = new URL(url).origin;
      if (!this.allowed.has(origin)) {
        if (!(await this.confirmDownload?.(origin))) throw new Error(`Download from ${origin} refused`);
        this.allowed.add(origin);
      }
    });
    // CODE-018: a runtime file must be the one expected (the sandbox cannot check it: no crypto there).
    const expected = runtimeHash(spec);
    if (expected) {
      const hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', files[0]!)), (b) => b.toString(16).padStart(2, '0')).join('');
      if (hex !== expected) throw new Error(`${spec}: checksum mismatch, not used`);
    }
    return files;
  }

  /** Sites the user agreed to download from, in this session (for every document and file). */
  private readonly allowed = ALLOWED;

  /** Serve the Python runtime from the application, packages from the CDN; nothing else. */
  private async serveFile(id: number, name: string): Promise<void> {
    try {
      let url: string;
      // CODE-016: the widget bridge, and the widget packages bundled with the application (checked).
      if (name === 'pwo_widgets.py') {
        const bytes = new TextEncoder().encode(PWO_WIDGETS).buffer as ArrayBuffer;
        this.post({ type: 'file', id, bytes }, [bytes]);
        return;
      }
      if (name.startsWith('python/')) {
        const { bundledWheel } = await import('./widgets/packages');
        const bytes = await bundledWheel(name.slice('python/'.length));
        this.post({ type: 'file', id, bytes }, [bytes]);
        return;
      }
      if (CORE_FILES.has(name)) url = coreUrl(name);
      else if ((await this.packageFiles()).has(name)) url = CDN + name;
      else throw new Error(`Not a Python runtime file: ${name}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      this.post({ type: 'file', id, bytes }, [bytes]);
    } catch (err) {
      this.post({ type: 'file', id, error: (err as Error).message });
    }
  }

  private async packageFiles(): Promise<Set<string>> {
    if (!this.packages) {
      const lock = (await (await fetch(coreUrl('pyodide-lock.json'))).json()) as { packages: Record<string, { file_name: string }> };
      this.packages = new Set(Object.values(lock.packages).map((p) => p.file_name).filter((f) => /^[\w.+-]+\.(whl|zip|tar)$/.test(f)));
    }
    return this.packages;
  }
}
