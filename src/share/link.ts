/**
 * Documents carried in a link (SHARE-009, SHARE-010). The document is put in
 * the URL fragment — `#doc=v1.<d|r>.<name>.<data>`, base64url, deflated when
 * that makes it shorter — so it is never sent to any server: the browser
 * keeps the fragment to itself, and the application rebuilds the document.
 */
import { deflateSync, inflateSync } from 'fflate';

/** Longer links may be cut by some messaging apps or mail clients. */
export const LINK_WARN_LENGTH = 8000;
/** Beyond this, browsers may refuse the address. */
export const LINK_MAX_LENGTH = 2_000_000;

const PREFIX = '#doc=';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Invalid link');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function encodeDocumentLink(base: string, name: string, bytes: Uint8Array): string {
  const deflated = deflateSync(bytes, { level: 9 });
  const compressed = deflated.length < bytes.length;
  const safeName = name.replace(/[/\\]/g, '_');
  const url = new URL(base);
  url.hash = '';
  return `${url.href}${PREFIX}v1.${compressed ? 'd' : 'r'}.${toBase64Url(new TextEncoder().encode(safeName))}.${toBase64Url(compressed ? deflated : bytes)}`;
}

/** The document carried by a URL fragment, or null when there is none (or it is damaged). */
export function decodeDocumentLink(hash: string): { name: string; bytes: Uint8Array } | null {
  if (!hash.startsWith(PREFIX)) return null;
  const [version, mode, name, data, ...rest] = hash.slice(PREFIX.length).split('.');
  if (version !== 'v1' || (mode !== 'd' && mode !== 'r') || name === undefined || data === undefined || rest.length) return null;
  try {
    const raw = fromBase64Url(data);
    return {
      name: new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(name)).replace(/[/\\]/g, '_') || 'document',
      bytes: mode === 'd' ? inflateSync(raw) : raw,
    };
  } catch {
    return null;
  }
}

/**
 * SHARE-014: a link protected by a password. The name and the content are
 * encrypted together (AES-GCM, key derived from the password with PBKDF2,
 * random salt and nonce): `#doc=v2.<salt>.<iv>.<data>`. Without the
 * password the link tells nothing but the size.
 */
export const PBKDF2_ITERATIONS = 600_000;

async function linkKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encodeEncryptedLink(base: string, name: string, bytes: Uint8Array, password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const safeName = new TextEncoder().encode(name.replace(/[/\\]/g, '_'));
  const deflated = deflateSync(bytes, { level: 9 });
  // [name length (2 bytes)][name][compressed flag][content]
  const plain = new Uint8Array(3 + safeName.length + Math.min(deflated.length, bytes.length));
  plain[0] = safeName.length >> 8;
  plain[1] = safeName.length & 0xff;
  plain.set(safeName, 2);
  const compressed = deflated.length < bytes.length;
  plain[2 + safeName.length] = compressed ? 1 : 0;
  plain.set(compressed ? deflated : bytes, 3 + safeName.length);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await linkKey(password, salt, iterations), plain));
  const url = new URL(base);
  url.hash = '';
  return `${url.href}${PREFIX}v2.${toBase64Url(salt)}.${toBase64Url(iv)}.${toBase64Url(data)}`;
}

export const isEncryptedLink = (hash: string): boolean => hash.startsWith(`${PREFIX}v2.`);

/** The document of a protected link; null for a wrong password or a damaged link. */
export async function decodeEncryptedLink(hash: string, password: string, iterations = PBKDF2_ITERATIONS): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (!isEncryptedLink(hash)) return null;
  const [, salt, iv, data, ...rest] = hash.slice(PREFIX.length).split('.');
  if (!salt || !iv || !data || rest.length) return null;
  try {
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) as BufferSource }, await linkKey(password, fromBase64Url(salt), iterations), fromBase64Url(data) as BufferSource));
    const length = (plain[0]! << 8) | plain[1]!;
    const name = new TextDecoder('utf-8', { fatal: true }).decode(plain.subarray(2, 2 + length)).replace(/[/\\]/g, '_') || 'document';
    const content = plain.subarray(3 + length);
    return { name, bytes: plain[2 + length] === 1 ? inflateSync(content) : content.slice() };
  } catch {
    return null;
  }
}
