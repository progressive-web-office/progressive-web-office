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
    peers: [],
    stop: () => {
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
