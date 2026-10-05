import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { decrypt, encrypt, isEncrypted, keyFromPassphrase, keyFromSecret, newDataKey, newRecoveryKey, recoverySecret, unwrap, wrap } from '../src/lock/crypto';
import { forgetKey, lockSet, readSecret, seal, unseal, unlocked, writeSecret, LockedError } from '../src/lock/session';
import { removeLock, setLock, unlockWithPassphrase, unlockWithRecovery } from '../src/lock/manager';
import { exportRecords, loadDraft, saveDraft } from '../src/storage/recent';
import { sealed } from '../src/lock/sealed-provider';
import { MemoryProvider } from '../src/fs';

// LOCK-001..LOCK-005: the lock of the application and what it seals.

const bytes = (s: string) => new TextEncoder().encode(s);

describe('LOCK-002 LOCK-003 the keys', () => {
  it('encrypts with the data key, wrapped by keys derived from secrets', async () => {
    const key = await newDataKey();
    const sealed = await encrypt(key, bytes('a note'));
    expect(isEncrypted(sealed)).toBe(true);
    expect(new TextDecoder().decode(await decrypt(key, sealed))).toBe('a note');
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrap(key, await keyFromSecret(secret, 'passkey'));
    const back = await unwrap(wrapped, await keyFromSecret(secret, 'passkey'));
    expect(new TextDecoder().decode(await decrypt(back, sealed))).toBe('a note');
    // Another secret, or another use of the same secret, does not open it.
    await expect(unwrap(wrapped, await keyFromSecret(crypto.getRandomValues(new Uint8Array(32)), 'passkey'))).rejects.toThrow();
    await expect(unwrap(wrapped, await keyFromSecret(secret, 'recovery'))).rejects.toThrow();
    const byPhrase = await wrap(key, await keyFromPassphrase('correct horse', new Uint8Array(16), 1000));
    await expect(unwrap(byPhrase, await keyFromPassphrase('wrong horse', new Uint8Array(16), 1000))).rejects.toThrow();
    expect(await unwrap(byPhrase, await keyFromPassphrase('correct horse', new Uint8Array(16), 1000))).toBeTruthy();
  });

  it('writes recovery keys to be typed again, in any case, with or without dashes', () => {
    const k = newRecoveryKey();
    expect(k).toMatch(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/);
    expect(recoverySecret(k)).toEqual(recoverySecret(k.toLowerCase().replace(/-/g, ' ')));
    expect(recoverySecret(k)).toHaveLength(20);
    expect(recoverySecret('not a key')).toBeUndefined();
  });
});

describe('LOCK-001..LOCK-005 the lock', () => {
  beforeEach(() => localStorage.clear());

  it('seals what is kept once set, opens it with the passphrase or the recovery key, and opens it all when removed', async () => {
    writeSecret('pwo.webdav.accounts', '[{"url":"https://cloud.example.org","password":"s3cret"}]');
    await saveDraft({ name: 'Draft.md', format: 'md', bytes: bytes('# Before the lock') });
    expect(lockSet()).toBe(false);

    const recovery = await setLock({ passphrase: 'a long phrase of mine', idleMinutes: 5 });
    expect(lockSet()).toBe(true);
    // Sealed: the account and the draft, read as they were while the lock is open.
    expect(localStorage.getItem('pwo.webdav.accounts')).toMatch(/^pwoenc1:/);
    expect(localStorage.getItem('pwo.lock')).not.toContain('s3cret');
    expect(readSecret('pwo.webdav.accounts')).toContain('s3cret');
    const [draft] = await exportRecords('drafts');
    expect(new TextDecoder().decode((await loadDraft())!.bytes)).toBe('# Before the lock');
    expect(new TextDecoder().decode(draft!.bytes as Uint8Array)).toBe('# Before the lock');
    expect(isEncrypted(new Uint8Array(await seal(bytes('x'))))).toBe(true);

    // Locked: nothing sealed can be read.
    forgetKey();
    expect(unlocked()).toBe(false);
    await expect(loadDraft()).rejects.toBeInstanceOf(LockedError);
    await expect(unseal(await (async () => { const k = await newDataKey(); return encrypt(k, bytes('x')); })())).rejects.toBeInstanceOf(LockedError);
    expect(await unlockWithPassphrase('not the phrase')).toBe(false);
    expect(await unlockWithPassphrase('a long phrase of mine')).toBe(true);
    expect(new TextDecoder().decode((await loadDraft())!.bytes)).toBe('# Before the lock');
    forgetKey();
    expect(await unlockWithRecovery('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA')).toBe(false);
    expect(await unlockWithRecovery(recovery.toLowerCase())).toBe(true);
    expect(readSecret('pwo.webdav.accounts')).toContain('s3cret');

    // Written while set: sealed too.
    await saveDraft({ name: 'Draft.md', format: 'md', bytes: bytes('# During the lock') });
    expect(isEncrypted((await (await import('../src/storage/recent')).exportRecords('drafts')).length ? (await rawDraft()) : new Uint8Array())).toBe(true);

    // The files of the browser's storage: sealed when written, opened when read, old ones read as they are.
    const raw = new MemoryProvider('m', 'M', { 'old.md': 'written before' });
    const files = sealed(raw);
    await files.write('Diary.md', new Blob(['A secret.']));
    expect(isEncrypted(new Uint8Array(await (await raw.read('Diary.md')).arrayBuffer()))).toBe(true);
    expect(await (await files.read('Diary.md')).text()).toBe('A secret.');
    expect(await (await files.read('old.md')).text()).toBe('written before');
    expect((await files.list('')).map((e) => e.name)).toEqual(['Diary.md', 'old.md']);

    // Removed: everything as it was, readable without any key.
    await removeLock();
    expect(lockSet()).toBe(false);
    expect(localStorage.getItem('pwo.webdav.accounts')).toContain('s3cret');
    expect(isEncrypted(await rawDraft())).toBe(false);
    expect(new TextDecoder().decode((await loadDraft())!.bytes)).toBe('# During the lock');
  });
});

/** The draft as kept in IndexedDB, not opened. */
async function rawDraft(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pwo');
    req.onsuccess = () => {
      const get = req.result.transaction('drafts').objectStore('drafts').get('current');
      get.onsuccess = () => resolve((get.result as { bytes: Uint8Array }).bytes);
      get.onerror = () => reject(get.error);
    };
    req.onerror = () => reject(req.error);
  });
}
