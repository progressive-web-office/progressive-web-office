/**
 * DEVSYNC-002: the synchronisation running while the application is open —
 * this device in the room of its paired devices, merging when asked, and by
 * itself (when the user chose it) as devices arrive and every few minutes.
 */
import type { StorageProvider } from '../fs';
import { DeviceSync, type SyncEvents } from './session';
import { loadSyncState, newPairing, saveSyncState, type DeviceSyncState, type Pairing } from './state';
import { giveNewKey, serveRekey } from './rekey';

export const SYNC_FOLDER = 'Documents';
const AUTO_EVERY = 3 * 60_000;

export interface LiveSync {
  sync: DeviceSync;
  peers: { id: string; device: string; name: string }[];
  stop(): void;
  /** The documents synchronised (Browser storage › Documents). */
  files: StorageProvider;
  /** The relays reached, and whether the messages also go through them (to tell what goes wrong). */
  network(): { open: number; total: number; mode: 'direct' | 'relays' } | undefined;
  /**
   * DEVSYNC-010: revoke one device: a new pairing, given to the other devices
   * online (each accepting it), then used here. The names of those reached.
   */
  revoke(device: string): Promise<{ given: string[]; refused: string[]; failed: string[] }>;
}

/**
 * DEVSYNC-010: asked on a device when another gives it a new key; the user
 * accepts only a revocation they are doing themselves.
 */
let rekeyPrompt = async (from: string, revoked: string): Promise<boolean> => {
  const { t } = await import('../i18n');
  return window.confirm(t('devsync.rekeyAsk', { from, revoked }));
};
export const setRekeyPrompt = (fn: typeof rekeyPrompt): void => void (rekeyPrompt = fn);

/** Move this device to a new pairing, forgetting a revoked device, and meet the others there. */
async function switchPairing(pairing: Pairing, forget: (peer: { name: string }, device: string) => boolean, files: StorageProvider, told: boolean): Promise<void> {
  const s = loadSyncState();
  const peers = Object.fromEntries(Object.entries(s.peers).filter(([device, p]) => !forget(p, device)));
  saveSyncState({ ...s, pairing, peers });
  live?.stop();
  await startSync(files);
  // Told by another device: said in the window.
  if (told) fan.rekeyed?.();
}

/** Seconds without any device reached directly before the relays carry the messages too. */
const RELAY_AFTER = 10;

/**
 * DEVSYNC-002: when browsers cannot connect directly (a phone on a mobile
 * network, a company network…), the encrypted messages also go through the
 * relays, as for real-time collaboration (COLLAB-011).
 */
export function relayFallback(transport: { room: { onPeerJoin(fn: (id: string) => void): void }; useRelays?(): Promise<void>; mode?(): 'direct' | 'relays' }, seconds = RELAY_AFTER): () => void {
  if (!transport.useRelays) return () => {};
  let reached = false;
  transport.room.onPeerJoin(() => (reached = true));
  const timer = setTimeout(() => {
    if (!reached && transport.mode?.() === 'direct') void transport.useRelays?.().catch(() => undefined);
  }, seconds * 1000);
  return () => clearTimeout(timer);
}

let live: LiveSync | undefined;
const listeners = new Set<SyncEvents>();

export const currentSync = (): LiveSync | undefined => live;

/** Listen to the running synchronisation; returns the unsubscribe function. */
export function listen(events: SyncEvents): () => void {
  listeners.add(events);
  return () => listeners.delete(events);
}

// A copy of the listeners: one may listen again while told (the window drawn again), and must not be told twice.
const each = (fn: (l: SyncEvents) => void): void => [...listeners].forEach(fn);
const fan: SyncEvents = {
  peers: (p) => each((l) => l.peers?.(p)),
  synced: (r) => each((l) => l.synced?.(r)),
  status: (s) => each((l) => l.status?.(s)),
  error: (e) => each((l) => l.error?.(e)),
  rekeyed: () => each((l) => l.rekeyed?.()),
};

/** Join the room of the paired devices (once). */
export async function startSync(files?: StorageProvider): Promise<LiveSync | undefined> {
  if (live) return live;
  const state = loadSyncState();
  if (!state.pairing || !state.understood) return undefined;
  const provider = files ?? (await (await import('../fs')).privateStorage(SYNC_FOLDER, 'Documents'));
  if (!provider) return undefined;
  const { connectRoom } = await import('../collab/ui');
  const transport = await connectRoom(state.pairing.room, state.pairing.secret);
  const stopFallback = relayFallback(transport);
  const store = { get: (): DeviceSyncState => loadSyncState(), set: (s: DeviceSyncState) => saveSyncState(s) };
  // DEVSYNC-012: the user's templates go along, as files of the folder Templates.
  const templates = await templateHooks(provider);
  const sync = new DeviceSync(transport.room, provider, store, {
    ...fan,
    peers: (p) => {
      if (live) live.peers = p;
      fan.peers?.(p);
      // A device arriving: merge with it, when synchronising by itself.
      if (p.length && loadSyncState().auto) void sync.syncNow();
    },
  }, undefined, templates);
  // DEVSYNC-010: another device revoking one gives this one the new key, once the user accepted.
  serveRekey(
    transport.room,
    () => loadSyncState().pairing?.secret ?? '',
    (from, revoked) => rekeyPrompt(from, revoked),
    (pairing, revoked) => setTimeout(() => void switchPairing(pairing, (_p, d) => d === revoked, provider, true).catch(() => undefined), 50),
  );
  const timer = setInterval(() => {
    if (loadSyncState().auto && sync.peerCount()) void sync.syncNow();
  }, AUTO_EVERY);
  sync.announce();
  live = {
    sync,
    files: provider,
    peers: [],
    network: () => {
      const r = transport.relays?.();
      return r ? { open: r.open, total: r.total, mode: transport.mode?.() ?? 'direct' } : undefined;
    },
    revoke: async (device) => {
      const s = loadSyncState();
      if (!s.pairing) return { given: [], refused: [], failed: [] };
      const revokedName = s.peers[device]?.name ?? device;
      const others = (live?.peers ?? []).filter((p) => p.device !== device);
      const pairing = newPairing();
      const result = await giveNewKey(transport.room, others.map((p) => p.id), { from: s.name, revoked: revokedName, device, pairing, oldSecret: s.pairing.secret });
      const name = (id: string): string => others.find((p) => p.id === id)?.name ?? id;
      await switchPairing(pairing, (_p, d) => d === device, provider, false);
      return { given: result.given.map(name), refused: result.refused.map(name), failed: result.failed.map(name) };
    },
    stop: () => {
      stopFallback();
      clearInterval(timer);
      sync.close();
      transport.leave();
      live = undefined;
      fan.peers?.([]);
    },
  };
  return live;
}

const MIRROR_KEY = 'pwo.devsync.templates';

/** DEVSYNC-012: the templates mirrored before each scan and taken in after each merge. */
async function templateHooks(files: StorageProvider): Promise<{ before(): Promise<void>; after(): Promise<void> }> {
  const [{ exportTemplates, importTemplates }, storage] = await Promise.all([import('./templates-mirror'), import('../storage/recent')]);
  const store = { list: storage.listTemplates, load: storage.loadTemplate, save: storage.saveTemplate, remove: storage.deleteTemplate };
  const load = (): Record<string, string> => {
    try {
      return (JSON.parse(localStorage.getItem(MIRROR_KEY) ?? '{}') as Record<string, string>) ?? {};
    } catch {
      return {};
    }
  };
  const save = (m: Record<string, string>): void => {
    try {
      localStorage.setItem(MIRROR_KEY, JSON.stringify(m));
    } catch {
      /* storage unavailable */
    }
  };
  return {
    before: async () => save(await exportTemplates(files, store, load())),
    after: async () => save(await importTemplates(files, store, load())),
  };
}

export function stopSync(): void {
  live?.stop();
}
