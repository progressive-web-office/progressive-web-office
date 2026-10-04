/**
 * DEVSYNC-001: this device in the synchronisation of one's own devices — its
 * name, the pairing (a room and a secret shared only by the paired devices),
 * the devices seen, and what the last synchronisation left (the base of the
 * next merge, and the deletions to pass on).
 */
import type { SyncBase } from './plan';

export interface Pairing {
  /** Public name of the meeting place. */
  room: string;
  /** Secret known only to the paired devices: it encrypts everything. */
  secret: string;
  since: number;
}

export interface DeviceSyncState {
  device: string;
  name: string;
  /** The user read the warnings (synchronisation is not a backup…). */
  understood: boolean;
  pairing?: Pairing;
  /** Synchronise by itself while the application is open. */
  auto: boolean;
  /** DEVSYNC-013: the devices met, and those heard of through another device (`via`). */
  peers: Record<string, KnownPeer>;
  /** Base of the merges of the first versions (one for all the devices); `bases` replaces it. */
  base: SyncBase;
  /** DEVSYNC-013: the base of the next merge with each device: what both held after the last one. */
  bases?: Record<string, SyncBase>;
  /** Files of the last scan, to notice deletions. */
  known: Record<string, string>;
  deleted: Record<string, number>;
  /** DEVSYNC-013: the content of each deleted file, so that another device drops it only if unchanged. */
  deletedHash?: Record<string, string>;
  /** DEVSYNC-013: devices revoked, never listed again from what other devices tell. */
  revoked?: string[];
  lastSync?: number;
  /** DEVSYNC-011: the files each device had when last met (to tell what is not here yet). */
  remotes?: Record<string, RemoteSnapshot>;
  /** DEVSYNC-011: what each synchronisation did, the newest last. */
  history?: SyncRecord[];
}

export interface KnownPeer {
  name: string;
  /** When it was last seen, by this device or by the one it was heard from. */
  lastSeen: number;
  /** The device it was heard from, when not met directly. */
  via?: string;
}

/** Devices passed on to another device, at most. */
export const MAX_PEERS = 64;

/**
 * DEVSYNC-013: the devices of this one after meeting `from` directly, who told
 * the devices it knows: the newest sighting of each is kept; never this device,
 * nor a revoked one.
 */
export function withPeers(state: DeviceSyncState, from: { device: string; name: string }, told: unknown, now = Date.now()): DeviceSyncState {
  const peers: Record<string, KnownPeer> = { ...state.peers, [from.device]: { name: from.name, lastSeen: now } };
  const revoked = new Set(state.revoked ?? []);
  if (told && typeof told === 'object') {
    for (const [id, p] of Object.entries(told as Record<string, unknown>).slice(0, MAX_PEERS)) {
      const peer = p as Partial<KnownPeer> | undefined;
      if (id === state.device || id === from.device || revoked.has(id) || id.length > 64) continue;
      if (!peer || typeof peer.name !== 'string' || typeof peer.lastSeen !== 'number' || !Number.isFinite(peer.lastSeen)) continue;
      const mine = peers[id];
      // Never a sighting from the future (a wrong clock), never older than the one here.
      const lastSeen = Math.min(peer.lastSeen, now);
      if (mine && mine.lastSeen >= lastSeen) continue;
      peers[id] = { name: peer.name.slice(0, 80), lastSeen, via: from.name };
    }
  }
  return { ...state, peers };
}

/** The devices this one tells the others about (the newest first). */
export function toldPeers(state: DeviceSyncState): Record<string, KnownPeer> {
  return Object.fromEntries(Object.entries(state.peers).sort(([, a], [, b]) => b.lastSeen - a.lastSeen).slice(0, MAX_PEERS));
}

/**
 * DEVSYNC-013: the base of a merge with `device`: what both held after their
 * last merge. The single base of the first versions holds only for a device
 * that never met more than one other.
 */
export function baseWith(state: DeviceSyncState, device: string): SyncBase {
  const own = state.bases?.[device];
  if (own) return own;
  return Object.keys(state.peers).length <= 1 && state.peers[device] ? state.base : {};
}

export interface RemoteSnapshot {
  name: string;
  /** When its list was received. */
  at: number;
  /** Content hash by path. */
  files: Record<string, string>;
  deleted?: Record<string, number>;
}

export interface SyncRecord {
  at: number;
  /** The device met. */
  device: string;
  name: string;
  fetched: string[];
  trashed: string[];
  conflicts: string[];
  failed: string[];
}

/** Synchronisations kept in the history, and paths kept per kind in one. */
export const MAX_HISTORY = 200;
const MAX_PATHS = 50;

/** A synchronisation added to the history (the oldest dropped). */
export function withRecord(state: DeviceSyncState, record: SyncRecord): DeviceSyncState {
  const cut = (paths: string[]): string[] => paths.slice(0, MAX_PATHS);
  const clean = { ...record, fetched: cut(record.fetched), trashed: cut(record.trashed), conflicts: cut(record.conflicts), failed: cut(record.failed) };
  return { ...state, history: [...(state.history ?? []), clean].slice(-MAX_HISTORY) };
}

const KEY = 'pwo.devsync';
export const TOMBSTONE_DAYS = 30;

export function randomId(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function defaultName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Firefox\//.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, browser].filter(Boolean).join(' · ');
}

/**
 * A better name from the browser, when it tells the model of the device (a
 * phone: "Pixel 7 · Chrome"). Browsers never tell the name of a computer.
 */
export async function deviceModelName(): Promise<string | undefined> {
  const data = (navigator as Navigator & { userAgentData?: { getHighEntropyValues(hints: string[]): Promise<{ model?: string }> } }).userAgentData;
  try {
    const model = (await data?.getHighEntropyValues(['model']))?.model?.trim();
    if (!model) return undefined;
    const browser = defaultName().split(' · ')[1];
    return [model, browser].filter(Boolean).join(' · ').slice(0, 60);
  } catch {
    return undefined;
  }
}

export function loadSyncState(): DeviceSyncState {
  let raw: Partial<DeviceSyncState> = {};
  try {
    raw = (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DeviceSyncState>) ?? {};
  } catch {
    /* a fresh state */
  }
  const state: DeviceSyncState = {
    device: typeof raw.device === 'string' ? raw.device : randomId(9),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : defaultName(),
    understood: raw.understood === true,
    auto: raw.auto === true,
    peers: raw.peers && typeof raw.peers === 'object' ? raw.peers : {},
    base: raw.base && typeof raw.base === 'object' ? raw.base : {},
    known: raw.known && typeof raw.known === 'object' ? raw.known : {},
    deleted: raw.deleted && typeof raw.deleted === 'object' ? raw.deleted : {},
    ...(raw.bases && typeof raw.bases === 'object' ? { bases: raw.bases } : {}),
    ...(raw.deletedHash && typeof raw.deletedHash === 'object' ? { deletedHash: raw.deletedHash } : {}),
    ...(Array.isArray(raw.revoked) ? { revoked: raw.revoked.filter((d): d is string => typeof d === 'string') } : {}),
    ...(raw.pairing && typeof raw.pairing.room === 'string' && typeof raw.pairing.secret === 'string' ? { pairing: raw.pairing } : {}),
    ...(typeof raw.lastSync === 'number' ? { lastSync: raw.lastSync } : {}),
    ...(raw.remotes && typeof raw.remotes === 'object' ? { remotes: raw.remotes } : {}),
    ...(Array.isArray(raw.history) ? { history: raw.history } : {}),
  };
  if (!raw.device) saveSyncState(state);
  return state;
}

export function saveSyncState(state: DeviceSyncState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

export const newPairing = (now = Date.now()): Pairing => ({ room: randomId(9), secret: randomId(24), since: now });

const PREFIX = 'pwo-sync:';

/** The code a new device types or scans to join: `pwo-sync:<room>.<secret>`. */
export const pairingCode = (p: Pairing): string => `${PREFIX}${p.room}.${p.secret}`;

export function parsePairingCode(text: string, now = Date.now()): Pairing | undefined {
  const m = /pwo-sync:([\w-]{8,64})\.([\w-]{24,128})/.exec(text.trim());
  return m ? { room: m[1]!, secret: m[2]!, since: now } : undefined;
}

/** Forget the pairing of this device; its documents stay. */
export function unpaired(state: DeviceSyncState): DeviceSyncState {
  const { pairing: _p, lastSync: _l, remotes: _r, bases: _b, deletedHash: _h, revoked: _v, ...rest } = state;
  return { ...rest, peers: {}, base: {}, deleted: {}, auto: false };
}
