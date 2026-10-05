/**
 * LOCK-001..LOCK-005: setting the lock, opening it, and removing it. Setting
 * it seals what the browser keeps — the files of its private storage, the
 * recent files, drafts, templates and versions, the accounts — removing it
 * opens them again; both go through every value, those already as wanted
 * left as they are (a step stopped half-way is finished the next time).
 */
import { b64, isEncrypted, keyFromPassphrase, keyFromSecret, newDataKey, newRecoveryKey, recoverySecret, unb64, unwrap, wrap } from './crypto';
import { newPasskey, passkeySecret } from './passkey';
import { forgetKey, forgetSecrets, loadLock, openSecrets, openWith, saveLock, SECRET_KEYS, seal, sealedText, sealText, unseal, unsealText, type LockRecord } from './session';

/** The data key while the lock is open (kept to wrap it for a new passkey). */
let openKey: CryptoKey | undefined;

const PASSKEY_INFO = 'passkey';
const RECOVERY_INFO = 'recovery';
const PASSPHRASE_ITERATIONS = 600_000;

async function opened(key: CryptoKey): Promise<void> {
  openKey = key;
  openWith(key);
  await openSecrets();
}

/** Seal (or open) everything the browser keeps; how many values were changed. */
export async function reseal(open: boolean, progress?: (done: number) => void): Promise<number> {
  let n = 0;
  const [{ rawPrivateStorage, walk }, { resealRecords }] = await Promise.all([import('../fs'), import('../storage/recent')]);
  const files = await rawPrivateStorage();
  if (files) {
    const paths: string[] = [];
    for await (const e of walk(files, '', { maxDepth: 64, maxEntries: 1_000_000 })) if (e.kind === 'file') paths.push(e.path);
    for (const path of paths) {
      const bytes = new Uint8Array(await (await files.read(path)).arrayBuffer());
      if (open === isEncrypted(bytes)) {
        await files.write(path, new Blob([(open ? await unseal(bytes) : await seal(bytes)) as BlobPart]));
        progress?.(++n);
      }
    }
  }
  n += await resealRecords(open);
  for (const key of SECRET_KEYS) {
    const v = localStorage.getItem(key);
    if (v === null || sealedText(v) !== open) continue;
    localStorage.setItem(key, open ? await unsealText(v) : await sealText(v));
    n++;
  }
  return n;
}

export interface LockChoice {
  /** A passkey of the device (its name), else a passphrase. */
  passkey?: string;
  passphrase?: string;
  idleMinutes: number;
}

/**
 * Set the lock: a new data key, wrapped by the passkey (or the passphrase)
 * and by a recovery key, then everything sealed. Returns the recovery key,
 * to show once.
 */
export async function setLock(choice: LockChoice, progress?: (done: number) => void): Promise<string> {
  if (loadLock()) throw new Error('The lock is already set.');
  const key = await newDataKey();
  const recovery = newRecoveryKey();
  const record: LockRecord = { version: 1, passkeys: [], recovery: await wrap(key, await keyFromSecret(recoverySecret(recovery)!, RECOVERY_INFO)), idleMinutes: choice.idleMinutes };
  if (choice.passkey) {
    const p = await newPasskey(choice.passkey);
    record.passkeys.push({ id: p.id, name: choice.passkey, salt: p.salt, wrapped: await wrap(key, await keyFromSecret(p.secret, PASSKEY_INFO)), created: Date.now() });
    p.secret.fill(0);
  } else if (choice.passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    record.passphrase = { salt: b64(salt), iterations: PASSPHRASE_ITERATIONS, wrapped: await wrap(key, await keyFromPassphrase(choice.passphrase, salt, PASSPHRASE_ITERATIONS)) };
  } else throw new Error('A passkey or a passphrase is needed.');
  // Kept first: from now on, what is written is sealed.
  saveLock(record);
  await opened(key);
  await reseal(false, progress);
  return recovery;
}

/** Open the lock with a passkey of the device. */
export async function unlockWithPasskey(): Promise<void> {
  const record = loadLock();
  if (!record?.passkeys.length) throw new Error('No passkey');
  const { id, secret } = await passkeySecret(record.passkeys);
  const entry = record.passkeys.find((p) => p.id === id);
  if (!entry) throw new Error('Unknown passkey');
  try {
    await opened(await unwrap(entry.wrapped, await keyFromSecret(secret, PASSKEY_INFO), true));
  } finally {
    secret.fill(0);
  }
}

/** Open the lock with the recovery key; false when it is not the right one. */
export async function unlockWithRecovery(text: string): Promise<boolean> {
  const record = loadLock();
  const secret = recoverySecret(text);
  if (!record || !secret) return false;
  try {
    await opened(await unwrap(record.recovery, await keyFromSecret(secret, RECOVERY_INFO), true));
    return true;
  } catch {
    return false;
  }
}

/** Open the lock with the passphrase; false when it is not the right one. */
export async function unlockWithPassphrase(passphrase: string): Promise<boolean> {
  const p = loadLock()?.passphrase;
  if (!p) return false;
  try {
    await opened(await unwrap(p.wrapped, await keyFromPassphrase(passphrase, unb64(p.salt), p.iterations), true));
    return true;
  } catch {
    return false;
  }
}

/** Another passkey opening the lock (another device, a security key). */
export async function addPasskey(name: string): Promise<void> {
  const record = loadLock();
  if (!record || !openKey) throw new Error('The lock is not open.');
  const p = await newPasskey(name);
  record.passkeys.push({ id: p.id, name, salt: p.salt, wrapped: await wrap(openKey, await keyFromSecret(p.secret, PASSKEY_INFO)), created: Date.now() });
  p.secret.fill(0);
  saveLock(record);
}

export function removePasskey(id: string): void {
  const record = loadLock();
  if (!record) return;
  // The recovery key always opens it; one way of every day is kept.
  if (record.passkeys.length <= 1 && !record.passphrase) throw new Error('The last passkey cannot be removed: remove the lock instead.');
  saveLock({ ...record, passkeys: record.passkeys.filter((p) => p.id !== id) });
}

export function setIdleMinutes(minutes: number): void {
  const record = loadLock();
  if (record) saveLock({ ...record, idleMinutes: minutes });
}

/** Remove the lock: everything opened again, then the lock forgotten. */
export async function removeLock(progress?: (done: number) => void): Promise<void> {
  if (!loadLock()) return;
  if (!openKey) throw new Error('The lock is not open.');
  await reseal(true, progress);
  saveLock(undefined);
  openKey = undefined;
  forgetKey();
  forgetSecrets();
}

/** Lock now: the data key forgotten, the page started again (nothing of it left in memory). */
export function lockNow(): void {
  openKey = undefined;
  forgetKey();
  forgetSecrets();
  location.reload();
}

/** LOCK-004: lock again after the minutes chosen without a key pressed, a click or a touch. */
export function lockWhenIdle(minutes: number, onLock: () => void = lockNow): () => void {
  if (!minutes) return () => undefined;
  let timer = setTimeout(onLock, minutes * 60_000);
  const reset = (): void => {
    clearTimeout(timer);
    timer = setTimeout(onLock, minutes * 60_000);
  };
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  for (const e of events) addEventListener(e, reset, { passive: true, capture: true });
  return () => {
    clearTimeout(timer);
    for (const e of events) removeEventListener(e, reset, { capture: true });
  };
}
