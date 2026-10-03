/** R in its own sandbox, with webR (CODE-018): see r-frame-html.ts. */
import type { RunResult, RunStatus } from './runner';

export class RRuntime {
  private frame: HTMLIFrameElement | undefined;
  private ready: Promise<void> | undefined;
  private nextId = 0;
  private readonly pending = new Map<number, { resolve(r: RunResult): void; onStatus?: (s: RunStatus) => void }>();
  private readonly onMessage = (e: MessageEvent): void => {
    if (!this.frame || e.source !== this.frame.contentWindow) return;
    const m = e.data as { type: string; id?: number; status?: string; text?: string; error?: boolean; images?: ArrayBuffer[] };
    if (m.type === 'ready') return this.readyResolve?.();
    const p = m.id !== undefined ? this.pending.get(m.id) : undefined;
    if (!p) return;
    if (m.type === 'status') p.onStatus?.(m.status === 'loading' ? 'packages:R (webR)' : 'running');
    else if (m.type === 'result') {
      this.pending.delete(m.id!);
      p.resolve({ text: m.text ?? '', ...(m.error ? { error: true } : {}), images: (m.images ?? []).map((b) => new Uint8Array(b)) });
    }
  };
  private readyResolve: (() => void) | undefined;

  constructor(private readonly host: HTMLElement) {
    addEventListener('message', this.onMessage);
  }

  private start(): Promise<void> {
    this.ready ??= (async () => {
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      const ready = new Promise<void>((r) => (this.readyResolve = r));
      // A page of its own (public/r-sandbox.html): its policy is not the application's.
      frame.src = new URL('r-sandbox.html', document.baseURI).href;
      this.frame = frame;
      this.host.append(frame);
      await ready;
    })();
    return this.ready;
  }

  async run(code: string, onStatus?: (s: RunStatus) => void): Promise<RunResult> {
    await this.start();
    return new Promise((resolve) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, ...(onStatus ? { onStatus } : {}) });
      this.frame!.contentWindow!.postMessage({ type: 'run', id, code }, '*');
    });
  }

  stop(reason: string): void {
    this.frame?.remove();
    this.frame = undefined;
    this.ready = undefined;
    for (const p of this.pending.values()) p.resolve({ text: `${reason}\n`, error: true, images: [] });
    this.pending.clear();
  }

  destroy(): void {
    this.stop('Stopped.');
    removeEventListener('message', this.onMessage);
  }
}
