/**
 * Keeps an editor and a shared Yjs document in step (COLLAB-002): local edits
 * are diffed into the shared parts, remote changes are written back to the
 * editor. Concurrent edits of different parts merge; edits of the same part
 * resolve to one of them, identically for everyone.
 */
import type * as Y from 'yjs';
import type { CollabAdapter, CollabParts } from './parts';

/** Origin of the binding's own transactions (not written back to the editor). */
export const LOCAL = Symbol('pwo-collab-local');

export class CollabBinding {
  readonly parts: Y.Map<string>;
  readonly list: Y.Array<string>;
  /** False until the shared content is known (a joiner waits for it before sending anything). */
  private ready: boolean;
  private pulling = false;
  private scheduled = false;
  private readonly onChange = (_events: unknown, tr: Y.Transaction): void => {
    if (tr.origin !== LOCAL) this.schedulePull();
  };

  constructor(
    readonly doc: Y.Doc,
    private readonly adapter: CollabAdapter,
    opts: { initiator: boolean; onRemote?: () => void },
  ) {
    this.parts = doc.getMap<string>('parts');
    this.list = doc.getArray<string>('list');
    this.onRemote = opts.onRemote;
    this.parts.observeDeep(this.onChange);
    this.list.observeDeep(this.onChange);
    if (!this.isEmpty()) {
      // Shared content already there (restored from this device, or received): it wins.
      this.ready = true;
      this.pull();
    } else {
      this.ready = opts.initiator;
      if (this.ready) this.push();
    }
  }

  private readonly onRemote?: () => void;
  /** The content as last synced between the editor and the shared document. */
  private base: CollabParts = { keys: {}, list: [] };

  /** Whether the shared content has been received (or provided). */
  get isReady(): boolean {
    return this.ready;
  }

  isEmpty(): boolean {
    return this.parts.size === 0 && this.list.length === 0;
  }

  /** Send local edits (call after the editor changed). */
  push(): void {
    if (!this.ready || this.pulling) return;
    const local = this.adapter.read();
    const base = this.base;
    this.doc.transact(() => {
      // Only what this editor changed since the last sync: a remote change that
      // has not reached the editor yet is never reverted.
      for (const key of Object.keys(base.keys)) if (!(key in local.keys)) this.parts.delete(key);
      for (const [key, value] of Object.entries(local.keys)) if (base.keys[key] !== value) this.parts.set(key, value);
      const edit = rangeEdit(base.list, local.list);
      if (edit) {
        const shared = this.list.toArray();
        const remote = rangeEdit(base.list, shared);
        let { start, end } = edit;
        if (remote && remote.start < edit.start) {
          // A remote edit before ours shifts our position.
          const shift = remote.insert.length - (remote.end - remote.start);
          start = Math.max(remote.start + remote.insert.length, start + shift);
          end = Math.max(start, end + shift);
        }
        end = Math.min(end, shared.length);
        start = Math.min(start, end);
        if (end > start) this.list.delete(start, end - start);
        if (edit.insert.length) this.list.insert(start, edit.insert);
      }
    }, LOCAL);
    this.base = local;
  }

  /** The shared content. */
  shared(): CollabParts {
    return { keys: Object.fromEntries(this.parts.entries()), list: this.list.toArray() };
  }

  /** Write the shared content to the editor. */
  pull(): void {
    if (this.isEmpty()) return;
    this.ready = true;
    this.pulling = true;
    try {
      this.base = this.shared();
      this.adapter.write(structuredClone(this.base));
    } finally {
      this.pulling = false;
    }
    this.onRemote?.();
  }

  private schedulePull(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.pull();
    });
  }

  destroy(): void {
    this.parts.unobserveDeep(this.onChange);
    this.list.unobserveDeep(this.onChange);
  }
}

/** The single range replacement turning `from` into `to` (null when equal). */
export function rangeEdit(from: string[], to: string[]): { start: number; end: number; insert: string[] } | null {
  let start = 0;
  const min = Math.min(from.length, to.length);
  while (start < min && from[start] === to[start]) start++;
  let endFrom = from.length;
  let endTo = to.length;
  while (endFrom > start && endTo > start && from[endFrom - 1] === to[endTo - 1]) {
    endFrom--;
    endTo--;
  }
  if (start === endFrom && start === endTo) return null;
  return { start, end: endFrom, insert: to.slice(start, endTo) };
}
