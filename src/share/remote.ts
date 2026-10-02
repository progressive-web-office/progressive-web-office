/**
 * Links to a document kept on a server (SHARE-011): `#url=<address>` opens it
 * read-only; `&sha256=<hex>` pins one version, so that a changed file is
 * refused. The address stays in the fragment, which the browser does not
 * send to PWO's own server.
 */
import { MAX_FILE_SIZE } from '../core/format';

const PREFIX = '#url=';

export interface RemoteLink {
  url: string;
  /** Expected SHA-256 of the file, in hexadecimal. */
  sha256?: string;
}

export type RemoteErrorKind = 'address' | 'network' | 'status' | 'tooLarge' | 'changed';

export class RemoteError extends Error {
  constructor(
    readonly kind: RemoteErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

/** Only HTTPS addresses (HTTP on this machine, for testing). */
export function checkAddress(address: string): string {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    throw new RemoteError('address', `Not a web address: ${address}`);
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new RemoteError('address', `Only https:// addresses are accepted: ${address}`);
  if (url.username || url.password) throw new RemoteError('address', 'Addresses with a user name or password are not accepted.');
  return url.href;
}

export function encodeRemoteLink(base: string, link: RemoteLink): string {
  const url = new URL(base);
  url.hash = '';
  return `${url.href}${PREFIX}${encodeURIComponent(checkAddress(link.url))}${link.sha256 ? `&sha256=${link.sha256.toLowerCase()}` : ''}`;
}

/** The link in a URL fragment, or null when it is not one. */
export function decodeRemoteLink(hash: string): RemoteLink | null {
  if (!hash.startsWith(PREFIX)) return null;
  const params = new URLSearchParams(hash.slice(1));
  const address = params.get('url');
  if (!address) return null;
  const url = checkAddress(address);
  const sha = params.get('sha256');
  if (sha !== null && !/^[0-9a-f]{64}$/i.test(sha)) throw new RemoteError('address', 'The version fingerprint of the link is damaged.');
  return sha ? { url, sha256: sha.toLowerCase() } : { url };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The file name: from Content-Disposition, else the last segment of the address. */
export function fileNameOf(url: string, disposition: string | null): string {
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition ?? '');
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition ?? '');
  let name = star ? decodeURIComponent(star[1]!) : plain?.[1];
  if (!name) {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    try {
      name = decodeURIComponent(last);
    } catch {
      name = last;
    }
  }
  return name.replace(/[/\\]/g, '_') || 'document';
}

/** Download the file of a link, checking its size and pinned version. */
export async function fetchRemote(link: RemoteLink, fetchFn: typeof fetch = (i, init) => fetch(i, init)): Promise<{ name: string; bytes: Uint8Array; sha256: string }> {
  const url = checkAddress(link.url);
  let res: Response;
  try {
    res = await fetchFn(url, { mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'follow' });
  } catch (err) {
    // A server that does not allow other sites to read the file looks like a network error (CORS).
    throw new RemoteError('network', (err as Error).message || 'Network error');
  }
  if (!res.ok) throw new RemoteError('status', `HTTP ${res.status}`);
  const length = Number(res.headers.get('Content-Length'));
  if (length > MAX_FILE_SIZE) throw new RemoteError('tooLarge', `${length} bytes`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_FILE_SIZE) throw new RemoteError('tooLarge', `${bytes.length} bytes`);
  const sha256 = await sha256Hex(bytes);
  if (link.sha256 && link.sha256 !== sha256) throw new RemoteError('changed', 'The file on the server is not the version of the link.');
  return { name: fileNameOf(res.url || url, res.headers.get('Content-Disposition')), bytes, sha256 };
}
