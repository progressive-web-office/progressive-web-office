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
  peers: Record<string, { name: string; lastSeen: number }>;
  base: SyncBase;
  /** Files of the last scan, to notice deletions. */
  known: Record<string, string>;
  deleted: Record<string, number>;
  lastSync?: number;
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
    ...(raw.pairing && typeof raw.pairing.room === 'string' && typeof raw.pairing.secret === 'string' ? { pairing: raw.pairing } : {}),
    ...(typeof raw.lastSync === 'number' ? { lastSync: raw.lastSync } : {}),
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
  const { pairing: _p, lastSync: _l, ...rest } = state;
  return { ...rest, peers: {}, base: {}, deleted: {}, auto: false };
}
