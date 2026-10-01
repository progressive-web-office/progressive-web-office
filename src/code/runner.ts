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

/** Pyodide version bundled with the application (see vite.config.ts). */
export const PYODIDE_VERSION = '314.0.7';
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const CORE_FILES = new Set(['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']);

export interface RunResult {
  text: string;
  error?: boolean;
  /** PNG images (matplotlib figures). */
  images: Uint8Array[];
}

export type RunStatus = 'loading-python' | 'running' | `packages:${string}`;

interface Pending {
  resolve(result: RunResult): void;
  onStatus?: (status: RunStatus) => void;
}

const coreUrl = (name: string): string => new URL(`pyodide/${name}`, document.baseURI).href;

export class CodeRunner {
  private frame: HTMLIFrameElement | undefined;
  private ready: Promise<void> | undefined;
  private packages: Set<string> | undefined;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly onMessage = (e: MessageEvent): void => this.handle(e);

  constructor(private readonly host: HTMLElement = document.body) {}

  run(lang: CodeLang, code: string, onStatus?: (status: RunStatus) => void): Promise<RunResult> {
    return this.start().then(
      () =>
        new Promise<RunResult>((resolve) => {
          const id = ++this.nextId;
          this.pending.set(id, { resolve, onStatus });
          this.post({ type: 'run', id, lang, code });
        }),
    );
  }

  /** Stop whatever is running: the sandbox is destroyed and restarted on the next run. */
  stop(reason = 'Stopped.'): void {
    this.frame?.remove();
    this.frame = undefined;
    this.ready = undefined;
    removeEventListener('message', this.onMessage);
    for (const p of this.pending.values()) p.resolve({ text: `${reason}\n`, error: true, images: [] });
    this.pending.clear();
  }

  destroy(): void {
    this.stop();
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
    const m = e.data as { type: string; id: number; name?: string; text?: string; error?: boolean; images?: ArrayBuffer[]; message?: string };
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
        p?.resolve({ text: m.text ?? '', error: m.error, images: (m.images ?? []).map((b) => new Uint8Array(b)) });
        break;
      }
      case 'fatal':
        this.stop(m.message ?? 'The sandbox stopped.');
        break;
    }
  }

  /** Serve the Python runtime from the application, packages from the CDN; nothing else. */
  private async serveFile(id: number, name: string): Promise<void> {
    try {
      let url: string;
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
