/**
 * The widgets of a document (CODE-016): the models created by its code (Python
 * through `comm` channels, JavaScript cells directly), kept here between the
 * code sandbox and the widget views. Each view is a frame of its own; this
 * registry gives it the models it asks for and relays changes both ways.
 */
import { putBuffers, refsOf, type Path, type WidgetState } from './state';

/** A message of a `comm` channel, from the code sandbox. */
export interface CommMessage {
  msg_type: 'comm_open' | 'comm_msg' | 'comm_close';
  comm_id: string;
  data: { method?: string; state?: WidgetState; buffer_paths?: Path[]; content?: unknown };
  buffers?: ArrayBuffer[];
}

/** What goes back to the code sandbox, for a channel. */
export type ToSandbox = (comm_id: string, data: Record<string, unknown>, buffers: ArrayBuffer[]) => void;

interface View {
  frame: HTMLIFrameElement;
  root: string;
  ready: boolean;
  /** Models this view holds. */
  has: Set<string>;
}

export class WidgetHost {
  private readonly models = new Map<string, WidgetState>();
  private readonly views = new Set<View>();
  private hash: Promise<string> | undefined;
  private readonly onMessage = (e: MessageEvent): void => this.fromView(e);
  /** Called with errors of widget code, for the user. */
  onError?: (message: string) => void;

  constructor(private readonly toSandbox: ToSandbox) {
    addEventListener('message', this.onMessage);
  }

  has(id: string): boolean {
    return this.models.has(id);
  }

  /** State of a model (copy), for saving it with the document. */
  stateOf(id: string): WidgetState | undefined {
    const s = this.models.get(id);
    return s ? { ...s } : undefined;
  }

  /** A model and every model it refers to (children, layouts, composed widgets). */
  closure(id: string): string[] {
    const out = new Set<string>();
    const visit = (m: string): void => {
      if (out.has(m) || !this.models.has(m)) return;
      out.add(m);
      for (const r of refsOf(this.models.get(m)!)) visit(r);
    };
    visit(id);
    return [...out];
  }

  /** A message of the code sandbox. */
  handle(msg: CommMessage): void {
    const id = msg.comm_id;
    if (msg.msg_type === 'comm_open') {
      const state = putBuffers({ ...(msg.data.state ?? {}) }, msg.data.buffer_paths, msg.buffers);
      this.models.set(id, state);
      this.broadcast(id, { type: 'model', id, state });
    } else if (msg.msg_type === 'comm_msg') {
      const data = msg.data;
      if ((data.method === 'update' || data.method === 'echo_update') && data.state) {
        const patch = putBuffers({ ...data.state }, data.buffer_paths, msg.buffers);
        const state = this.models.get(id);
        if (!state) return;
        Object.assign(state, patch);
        this.broadcast(id, { type: 'update', id, state: patch });
      } else if (data.method === 'custom') {
        this.broadcast(id, { type: 'custom', id, content: data.content, buffers: msg.buffers ?? [] });
      }
    } else if (msg.msg_type === 'comm_close') {
      this.models.delete(id);
      this.broadcast(id, { type: 'closed', id });
    }
  }

  /** Show the model `id` in `el` (a frame of its own). */
  async mount(el: HTMLElement, id: string, dark = false): Promise<void> {
    const { viewHash, viewSrcdoc } = await import('./view-html');
    this.hash ??= viewHash();
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.className = 'code-widget-frame';
    frame.title = String(this.models.get(id)?._anywidget_id ?? this.models.get(id)?._model_name ?? 'widget');
    frame.style.height = '48px';
    const view: View = { frame, root: id, ready: false, has: new Set() };
    this.views.add(view);
    frame.srcdoc = viewSrcdoc(await this.hash, dark);
    el.replaceChildren(frame);
  }

  /** Forget views whose frame left the page. */
  private prune(): void {
    for (const v of this.views) if (!v.frame.isConnected && v.ready) this.views.delete(v);
  }

  private post(view: View, message: Record<string, unknown>, transfer: Transferable[] = []): void {
    view.frame.contentWindow?.postMessage(message, '*', transfer);
  }

  /** Copies of the buffers for each frame (a transfer empties them). */
  private broadcast(id: string, message: Record<string, unknown>): void {
    this.prune();
    for (const v of this.views) {
      if (!v.ready || !v.has.has(id)) continue;
      this.post(v, structuredClone(message));
    }
  }

  private give(view: View, id: string): void {
    const state = this.models.get(id);
    if (!state) return;
    view.has.add(id);
    this.post(view, { type: 'model', id, state: structuredClone(state) });
  }

  private fromView(e: MessageEvent): void {
    const view = [...this.views].find((v) => v.frame.contentWindow === e.source);
    const m = e.data as { pwoView?: boolean; type: string; id?: string; state?: WidgetState; paths?: Path[]; buffers?: ArrayBuffer[]; content?: unknown; height?: number; message?: string };
    if (!view || !m?.pwoView) return;
    switch (m.type) {
      case 'ready':
        view.ready = true;
        this.give(view, view.root);
        this.post(view, { type: 'render', id: view.root });
        break;
      case 'need':
        if (m.id) this.give(view, m.id);
        break;
      case 'size':
        view.frame.style.height = `${Math.max(24, Math.min(4000, m.height ?? 0))}px`;
        break;
      case 'save': {
        // A frame changes only the models it was given.
        if (!m.id || !m.state || !view.has.has(m.id)) return;
        const patch = putBuffers({ ...m.state }, m.paths, m.buffers);
        const state = this.models.get(m.id);
        if (state) Object.assign(state, patch);
        // The other views of the model follow; the code gets the change.
        for (const v of this.views) if (v !== view && v.ready && v.has.has(m.id)) this.post(v, structuredClone({ type: 'update', id: m.id, state: patch }));
        this.toSandbox(m.id, { method: 'update', state: m.state, buffer_paths: m.paths ?? [] }, m.buffers ?? []);
        break;
      }
      case 'custom':
        if (m.id && view.has.has(m.id)) this.toSandbox(m.id, { method: 'custom', content: m.content }, m.buffers ?? []);
        break;
      case 'error':
        this.onError?.(m.message ?? 'Widget error');
        break;
      case 'snapshot': {
        const s = m as unknown as { req: number; png: ArrayBuffer | null; message?: string };
        if (!s.png) console.warn('Widget picture:', s.message ?? 'empty');
        this.snapshots.get(s.req)?.(s.png ?? undefined);
        this.snapshots.delete(s.req);
        break;
      }
    }
  }

  private nextSnapshot = 0;
  private readonly snapshots = new Map<number, (png: ArrayBuffer | undefined) => void>();

  /** A PNG picture of a view of the model `id` on the page; undefined when there is none. */
  snapshot(id: string, timeoutMs = 5000): Promise<ArrayBuffer | undefined> {
    this.prune();
    const view = [...this.views].find((v) => v.ready && v.root === id && v.frame.isConnected);
    if (!view) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const req = ++this.nextSnapshot;
      const timer = setTimeout(() => {
        this.snapshots.delete(req);
        resolve(undefined);
      }, timeoutMs);
      this.snapshots.set(req, (png) => {
        clearTimeout(timer);
        resolve(png);
      });
      this.post(view, { type: 'snapshot', req });
    });
  }

  destroy(): void {
    removeEventListener('message', this.onMessage);
    this.views.clear();
    this.models.clear();
  }
}
