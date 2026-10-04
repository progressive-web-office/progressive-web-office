/**
 * DEVSYNC-002: the synchronisation running while the application is open —
 * this device in the room of its paired devices, merging when asked, and by
 * itself (when the user chose it) as devices arrive and every few minutes.
 */
import type { StorageProvider } from '../fs';
import { DeviceSync, type SyncEvents } from './session';
import { loadSyncState, saveSyncState, type DeviceSyncState } from './state';

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

const fan: SyncEvents = {
  peers: (p) => listeners.forEach((l) => l.peers?.(p)),
  synced: (r) => listeners.forEach((l) => l.synced?.(r)),
  status: (s) => listeners.forEach((l) => l.status?.(s)),
  error: (e) => listeners.forEach((l) => l.error?.(e)),
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
  const sync = new DeviceSync(transport.room, provider, store, {
    ...fan,
    peers: (p) => {
      if (live) live.peers = p;
      fan.peers?.(p);
      // A device arriving: merge with it, when synchronising by itself.
      if (p.length && loadSyncState().auto) void sync.syncNow();
    },
  });
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

export function stopSync(): void {
  live?.stop();
}
