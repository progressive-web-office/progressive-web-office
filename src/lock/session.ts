/**
 * LOCK-001..LOCK-005: the lock of the application. Its description — the
 * passkeys that open it, the data key as each of them wraps it, the delay
 * before it locks again — is kept in the browser (nothing secret in it);
 * the data key, once opened, only in memory, forgotten when locked.
 *
 * While the lock is set, what the browser keeps is sealed (encrypted with
 * the data key) when written and opened when read; values written before
 * the lock was set are read as they are, and sealed when written again.
 */
import { decrypt, decryptText, encrypt, encryptText, isEncrypted, TEXT_PREFIX, type Wrapped } from './crypto';

export interface LockPasskey {
  /** The credential id, base64url. */
  id: string;
  name: string;
  /** The salt the PRF of the passkey is asked with, base64. */
  salt: string;
  wrapped: Wrapped;
  created: number;
}

export interface LockRecord {
  version: 1;
  passkeys: LockPasskey[];
  /** The data key wrapped by the recovery key. */
  recovery: Wrapped;
  /** LOCK-005: the data key wrapped by a passphrase, where no passkey gives a secret. */
  passphrase?: { salt: string; iterations: number; wrapped: Wrapped };
  /** Minutes without use before it locks again (0: never). */
  idleMinutes: number;
}

const KEY = 'pwo.lock';

export function loadLock(): LockRecord | undefined {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LockRecord | null;
    return r && r.version === 1 && r.recovery ? r : undefined;
  } catch {
    return undefined;
  }
}

export function saveLock(record: LockRecord | undefined): void {
  if (record) localStorage.setItem(KEY, JSON.stringify(record));
  else localStorage.removeItem(KEY);
}

let dataKey: CryptoKey | undefined;
const listeners = new Set<(unlocked: boolean) => void>();

/** Whether the lock is set (then what the browser keeps is encrypted). */
export const lockSet = (): boolean => !!loadLock();
/** Whether the data key is open (or no lock is set). */
export const unlocked = (): boolean => !lockSet() || !!dataKey;

export function openWith(key: CryptoKey): void {
  dataKey = key;
  for (const l of listeners) l(true);
}

/** Forget the data key: nothing sealed can be read until the lock is opened again. */
export function forgetKey(): void {
  dataKey = undefined;
  for (const l of listeners) l(false);
}

export function onLockChange(listener: (unlocked: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export class LockedError extends Error {
  constructor() {
    super('The application is locked.');
    this.name = 'LockedError';
  }
}

/** Bytes as kept: sealed while the lock is set. */
export async function seal(bytes: Uint8Array): Promise<Uint8Array> {
  if (!lockSet()) return bytes;
  if (!dataKey) throw new LockedError();
  return encrypt(dataKey, bytes);
}

/** Bytes as read: opened when sealed. */
export async function unseal(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isEncrypted(bytes)) return bytes;
  if (!dataKey) throw new LockedError();
  return decrypt(dataKey, bytes);
}

export const sealedText = (text: string | null): boolean => !!text?.startsWith(TEXT_PREFIX);

export async function sealText(text: string): Promise<string> {
  if (!lockSet()) return text;
  if (!dataKey) throw new LockedError();
  return encryptText(dataKey, text);
}

export async function unsealText(text: string): Promise<string> {
  if (!sealedText(text)) return text;
  if (!dataKey) throw new LockedError();
  return decryptText(dataKey, text);
}

// --- secrets of the browser's key-value storage ---------------------------------

/**
 * LOCK-002: values of the browser's key-value storage that hold secrets
 * (accounts with their passwords and tokens). Read at once by their
 * modules: opened in memory when the lock opens, sealed when written.
 */
export const SECRET_KEYS = ['pwo.webdav.accounts', 'pwo.git.accounts', 'pwo.grist.accounts', 'pwo.zotero'];
const secrets = new Map<string, string | null>();

export function readSecret(key: string): string | null {
  const stored = localStorage.getItem(key);
  if (!sealedText(stored)) return stored;
  return secrets.get(key) ?? null;
}

export function writeSecret(key: string, value: string | null): void {
  if (value === null) {
    secrets.delete(key);
    localStorage.removeItem(key);
    return;
  }
  secrets.set(key, value);
  if (!lockSet()) return localStorage.setItem(key, value);
  void sealText(value).then((sealed) => localStorage.setItem(key, sealed)).catch(() => undefined);
}

/** Open the secrets of the storage in memory (once the data key is open). */
export async function openSecrets(): Promise<void> {
  for (const key of SECRET_KEYS) {
    const stored = localStorage.getItem(key);
    if (sealedText(stored)) secrets.set(key, await unsealText(stored!).catch(() => null));
  }
}

export function forgetSecrets(): void {
  secrets.clear();
}
