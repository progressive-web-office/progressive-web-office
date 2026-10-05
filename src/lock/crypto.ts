/**
 * LOCK-002, LOCK-003, LOCK-005: the keys of the lock. What the browser keeps
 * is encrypted (AES-GCM) with one random data key; the data key is kept only
 * wrapped — by a key derived from the secret a passkey gives (its PRF
 * output), by the recovery key, or by a passphrase — so that any of them
 * opens it, and forgetting the data key (locking) leaves nothing readable.
 *
 * No imports: plain Web Crypto, testable as it is.
 */

const enc = new TextEncoder();
/** What starts an encrypted value: the format and its version. */
export const MAGIC = enc.encode('PWOENC1\0');
const IV = 12;

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const buf = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer;
export { b64, unb64 };

/** A wrapped key: what opens it says how (a passkey, the recovery key, a passphrase). */
export interface Wrapped {
  iv: string;
  key: string;
}

/** A new data key (extractable only to be wrapped). */
export async function newDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** A key wrapping the data key, derived from a secret of high entropy (a passkey's PRF output, the recovery key). */
export async function keyFromSecret(secret: Uint8Array, info: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', buf(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: buf(enc.encode('pwo-lock-1')), info: buf(enc.encode(info)) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** A key wrapping the data key, derived from a passphrase (slow on purpose). */
export async function keyFromPassphrase(passphrase: string, salt: Uint8Array, iterations = 600_000): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', buf(enc.encode(passphrase.normalize('NFC'))), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function wrap(dataKey: CryptoKey, by: CryptoKey): Promise<Wrapped> {
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dataKey));
  const key = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, by, raw));
  raw.fill(0);
  return { iv: b64(iv), key: b64(key) };
}

/** The data key a wrapped key holds (not extractable any more); throws when `by` does not open it. */
export async function unwrap(wrapped: Wrapped, by: CryptoKey, extractable = false): Promise<CryptoKey> {
  const raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(unb64(wrapped.iv)) }, by, buf(unb64(wrapped.key))));
  try {
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0);
  }
}

export const isEncrypted = (bytes: Uint8Array): boolean => bytes.length >= MAGIC.length + IV && MAGIC.every((b, i) => bytes[i] === b);

/** Bytes encrypted: the magic, the IV, then the ciphertext with its tag. */
export async function encrypt(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf(bytes)));
  const out = new Uint8Array(MAGIC.length + IV + ct.length);
  out.set(MAGIC);
  out.set(iv, MAGIC.length);
  out.set(ct, MAGIC.length + IV);
  return out;
}

export async function decrypt(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  if (!isEncrypted(bytes)) throw new Error('Not encrypted');
  const iv = bytes.subarray(MAGIC.length, MAGIC.length + IV);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(bytes.subarray(MAGIC.length + IV))));
}

/** A text encrypted, as text (for the browser's key-value storage). */
export const TEXT_PREFIX = 'pwoenc1:';
export async function encryptText(key: CryptoKey, text: string): Promise<string> {
  return TEXT_PREFIX + b64(await encrypt(key, enc.encode(text)));
}
export async function decryptText(key: CryptoKey, text: string): Promise<string> {
  return new TextDecoder().decode(await decrypt(key, unb64(text.slice(TEXT_PREFIX.length))));
}

// --- the recovery key -------------------------------------------------------

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A recovery key: 160 random bits, written as 8 groups of 4 letters and digits (no 0/O, 1/I). */
export function newRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join('-');
}

/** The secret a recovery key stands for (as typed: case, spaces and dashes ignored); undefined when it is not one. */
export function recoverySecret(text: string): Uint8Array | undefined {
  const s = text.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== 32 || [...s].some((c) => !ALPHABET.includes(c))) return undefined;
  const out = new Uint8Array(20);
  let bits = 0;
  let value = 0;
  let i = 0;
  for (const c of s) {
    value = (value << 5) | ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out[i++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return out;
}
