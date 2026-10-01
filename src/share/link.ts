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
