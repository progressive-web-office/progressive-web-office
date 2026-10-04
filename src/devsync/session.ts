/**
 * DEVSYNC-002, DEVSYNC-003: two paired devices meet in their room and merge:
 * each sends its manifest, the other plans, fetches the files it needs and
 * answers with its own manifest, so that both end up alike. Paths received
 * are checked; only the synchronised files are ever served.
 */
import type { CollabRoom } from '@scelles/collab';
import type { StorageProvider } from '../fs';
import { applyPlan, emptyOldTrash, safePath, scan, type ApplyResult } from './engine';
import { planSync, type SyncManifest } from './plan';
import { baseWith, toldPeers, withPeers, withRecord, type DeviceSyncState, type KnownPeer } from './state';

type Send<T> = (data: T, target?: string) => unknown;
type Receive<T> = (fn: (data: T, peer: string) => void) => void;

/** DEVSYNC-013: with the devices this one knows, so that they are known along a chain of devices. */
interface Hello { device: string; name: string; peers?: Record<string, KnownPeer> }
/** `final`: the files after the merge, only to know what the other holds now (DEVSYNC-011). */
interface ManifestMsg { manifest: SyncManifest; reply: boolean; final?: boolean }
interface GetMsg { id: string; path: string }
interface FileMsg { id: string; data?: string; error?: string }

export interface SyncEvents {
  peers?(peers: { id: string; device: string; name: string }[]): void;
  synced?(result: ApplyResult & { peer: string }): void;
  status?(text: 'scanning' | 'merging' | 'idle'): void;
  error?(message: string): void;
  /** DEVSYNC-010: this device moved to a new pairing (a device was revoked). */
  rekeyed?(): void;
}

const MAX_FILE = 50 * 1024 * 1024;
const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Only well-formed manifests, with safe paths. */
function cleanManifest(m: unknown): SyncManifest | undefined {
  const x = m as SyncManifest;
  if (!x || typeof x.device !== 'string' || typeof x.name !== 'string' || typeof x.files !== 'object' || typeof x.deleted !== 'object') return undefined;
  const files: SyncManifest['files'] = {};
  for (const [p, f] of Object.entries(x.files ?? {})) {
    const path = safePath(p);
    if (path && f && typeof f.hash === 'string' && /^[0-9a-f]{64}$/.test(f.hash) && typeof f.mtime === 'number') files[path] = { hash: f.hash, mtime: f.mtime };
  }
  const deleted: SyncManifest['deleted'] = {};
  for (const [p, at] of Object.entries(x.deleted ?? {})) {
    const path = safePath(p);
    if (path && typeof at === 'number') deleted[path] = at;
  }
  const deletedHash: Record<string, string> = {};
  for (const [p, hash] of Object.entries(x.deletedHash && typeof x.deletedHash === 'object' ? x.deletedHash : {})) {
    const path = safePath(p);
    if (path && deleted[path] !== undefined && typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash)) deletedHash[path] = hash;
  }
  return { device: x.device.slice(0, 64), name: x.name.slice(0, 80), files, deleted, deletedHash };
}

export class DeviceSync {
  private readonly sendHello: Send<Hello>;
  private readonly sendManifest: Send<ManifestMsg>;
  private readonly sendGet: Send<GetMsg>;
  private readonly sendFile: Send<FileMsg>;
  private readonly peers = new Map<string, Hello>();
  private readonly pending = new Map<string, { resolve(b: Uint8Array): void; reject(e: Error): void }>();
  private queue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    room: CollabRoom,
    private readonly files: StorageProvider,
    private readonly state: { get(): DeviceSyncState; set(s: DeviceSyncState): void },
    private readonly events: SyncEvents = {},
    private readonly timeoutMs = 60_000,
    /** DEVSYNC-012: work before scanning (things written into the documents) and after merging (things taken out). */
    private readonly hooks: { before?(): Promise<void>; after?(): Promise<void> } = {},
  ) {
    const action = <T>(ns: string): [Send<T>, Receive<T>] => room.makeAction(ns) as unknown as [Send<T>, Receive<T>];
    let receiveHello: Receive<Hello>, receiveManifest: Receive<ManifestMsg>, receiveGet: Receive<GetMsg>, receiveFile: Receive<FileMsg>;
    [this.sendHello, receiveHello] = action<Hello>('ds-hello');
    [this.sendManifest, receiveManifest] = action<ManifestMsg>('ds-manifest');
    [this.sendGet, receiveGet] = action<GetMsg>('ds-get');
    [this.sendFile, receiveFile] = action<FileMsg>('ds-file');
    room.onPeerJoin((peer) => void this.sendHello(this.hello(), peer));
    room.onPeerLeave((peer) => {
      this.peers.delete(peer);
      this.emitPeers();
    });
    receiveHello((data, peer) => {
      if (typeof data?.device !== 'string' || typeof data.name !== 'string') return;
      const known = this.peers.has(peer);
      const from = { device: data.device.slice(0, 64), name: data.name.slice(0, 80) };
      this.peers.set(peer, from);
      // DEVSYNC-013: met directly; and the devices it knows.
      this.state.set(withPeers(this.state.get(), from, data.peers));
      if (!known) void this.sendHello(this.hello(), peer);
      this.emitPeers();
    });
    receiveManifest((data, peer) => {
      const manifest = cleanManifest(data?.manifest);
      if (!manifest) return;
      if (data.final === true) this.remember(manifest);
      else this.enqueue(() => this.merge(manifest, peer, !!data.reply));
    });
    receiveGet((data, peer) => void this.serve(data, peer));
    receiveFile((data) => {
      const waiting = typeof data?.id === 'string' ? this.pending.get(data.id) : undefined;
      if (!waiting) return;
      this.pending.delete(data.id);
      if (typeof data.data === 'string') waiting.resolve(unb64(data.data));
      else waiting.reject(new Error(data.error ?? 'not sent'));
    });
  }

  private hello(): Hello {
    const s = this.state.get();
    return { device: s.device, name: s.name, peers: toldPeers(s) };
  }

  private emitPeers(): void {
    this.events.peers?.([...this.peers].map(([id, p]) => ({ id, ...p })));
  }

  /** Announce this device (on joining). */
  announce(): void {
    void this.sendHello(this.hello());
  }

  peerCount(): number {
    return this.peers.size;
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task).catch((err: unknown) => this.events.error?.((err as Error).message));
    return this.queue;
  }

  /** Send this device's manifest to the others, who merge and answer. */
  syncNow(): Promise<void> {
    return this.enqueue(async () => {
      this.events.status?.('scanning');
      await this.hooks.before?.().catch(() => undefined);
      const { manifest, state } = await scan(this.files, this.state.get());
      this.state.set(state);
      await this.sendManifest({ manifest, reply: true });
      this.events.status?.('idle');
    });
  }

  private async merge(remote: SyncManifest, peer: string, reply: boolean): Promise<void> {
    if (this.closed) return;
    this.events.status?.('merging');
    await this.hooks.before?.().catch(() => undefined);
    const scanned = await scan(this.files, this.state.get());
    // DEVSYNC-013: the base of the last merge with this device, not with another.
    const plan = planSync(scanned.manifest, remote, baseWith(scanned.state, remote.device));
    const result = await applyPlan(this.files, plan, (path) => this.fetch(path, peer));
    await this.hooks.after?.().catch(() => undefined);
    await emptyOldTrash(this.files).catch(() => []);
    // What both devices now hold is the base of the next merge.
    const after = await scan(this.files, { ...scanned.state });
    const base = Object.fromEntries(after.hashes);
    // DEVSYNC-011: what the other device holds, and what this synchronisation did.
    const now = Date.now();
    const remotes = { ...(after.state.remotes ?? {}), [remote.device]: { name: remote.name, at: now, files: Object.fromEntries(Object.entries(remote.files).map(([p, f]) => [p, f.hash])), deleted: remote.deleted } };
    const bases = { ...(after.state.bases ?? {}), [remote.device]: base };
    this.state.set(withRecord({ ...after.state, base, bases, lastSync: now, remotes }, { at: now, device: remote.device, name: remote.name, ...result }));
    this.events.synced?.({ ...result, peer: remote.name });
    if (reply) await this.sendManifest({ manifest: after.manifest, reply: false }, peer);
    // DEVSYNC-011: the last word, so that the other device knows what this one now holds.
    else await this.sendManifest({ manifest: after.manifest, reply: false, final: true }, peer);
    this.events.status?.('idle');
  }

  /** DEVSYNC-011: the files another device holds now. */
  private remember(remote: SyncManifest): void {
    const s = this.state.get();
    this.state.set({ ...s, remotes: { ...(s.remotes ?? {}), [remote.device]: { name: remote.name, at: Date.now(), files: Object.fromEntries(Object.entries(remote.files).map(([p, f]) => [p, f.hash])), deleted: remote.deleted } } });
  }

  private fetch(path: string, peer: string): Promise<Uint8Array> {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('timeout'));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (b) => {
          clearTimeout(timer);
          resolve(b);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      void this.sendGet({ id, path }, peer);
    });
  }

  private async serve(data: GetMsg, peer: string): Promise<void> {
    if (typeof data?.id !== 'string') return;
    const path = safePath(data.path);
    try {
      if (!path) throw new Error('refused');
      const blob = await this.files.read(path);
      if (blob.size > MAX_FILE) throw new Error('too large');
      await this.sendFile({ id: data.id, data: b64(new Uint8Array(await blob.arrayBuffer())) }, peer);
    } catch (err) {
      await this.sendFile({ id: data.id, error: (err as Error).message }, peer);
    }
  }

  close(): void {
    this.closed = true;
    for (const p of this.pending.values()) p.reject(new Error('closed'));
    this.pending.clear();
  }
}
