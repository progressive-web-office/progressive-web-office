/** Minimal WebDAV client for Nextcloud, ownCloud and other WebDAV servers (DAV-001..DAV-004). */

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface DavConfig {
  /** WebDAV root of the user's files, ending with a slash. */
  url: string;
  username: string;
  /** Preferably an app password. */
  password: string;
}

export interface DavEntry {
  name: string;
  /** Path relative to the root, without leading or trailing slash. */
  path: string;
  type: 'file' | 'dir';
  size?: number;
  etag?: string;
  modified?: number;
}

export class WebDavError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the server could not be reached (network, CORS). */
    readonly status: number,
  ) {
    super(message);
    this.name = 'WebDavError';
  }

  /** The file changed on the server since it was read. */
  get conflict(): boolean {
    return this.status === 412;
  }
}

/**
 * The WebDAV root for a server address: Nextcloud / ownCloud addresses get
 * `remote.php/dav/files/<user>/`; an address that already points into
 * `remote.php`, or any address given without user, is used as is.
 */
export function davRootUrl(server: string, username: string): string {
  const base = server.trim().replace(/\/+$/, '');
  if (!username.trim() || /\/remote\.php\//.test(base) || /\/(webdav|dav)$/i.test(base)) return `${base}/`;
  return `${base}/remote.php/dav/files/${encodeURIComponent(username.trim())}/`;
}

const DAV = 'DAV:';
const PROPFIND_BODY =
  '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getetag/><d:getlastmodified/></d:prop></d:propfind>';

/** Base64 of `user:password` in UTF-8 (RFC 7617). */
function basicCredentials(username: string, password: string): string {
  let binary = '';
  for (const b of new TextEncoder().encode(`${username}:${password}`)) binary += String.fromCharCode(b);
  return btoa(binary);
}

const encodePath = (path: string): string =>
  path
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export class WebDavClient {
  private readonly root: URL;

  constructor(
    private readonly config: DavConfig,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {
    this.root = new URL(config.url.endsWith('/') ? config.url : `${config.url}/`);
  }

  private url(path: string, dir = false): string {
    const p = encodePath(path);
    return this.root.href + p + (dir && p ? '/' : '');
  }

  private async request(method: string, url: string, init: { headers?: Record<string, string>; body?: BodyInit } = {}): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method,
        headers: { Authorization: `Basic ${basicCredentials(this.config.username, this.config.password)}`, ...init.headers },
        ...(init.body !== undefined ? { body: init.body } : {}),
      });
    } catch (err) {
      throw new WebDavError((err as Error).message || 'Network error', 0);
    }
    if (!res.ok) throw new WebDavError(`HTTP ${res.status}`, res.status);
    return res;
  }

  /** Entries of a folder, folders first then files, each sorted by name. */
  async list(path: string): Promise<DavEntry[]> {
    const entries = await this.propfind(this.url(path, true), '1');
    const self = encodePath(path);
    return entries
      .filter((e) => e.path !== decode(self))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  }

  async read(path: string): Promise<{ bytes: Uint8Array; etag?: string }> {
    const res = await this.request('GET', this.url(path));
    const etag = res.headers.get('ETag') ?? undefined;
    return { bytes: new Uint8Array(await res.arrayBuffer()), ...(etag ? { etag } : {}) };
  }

  /**
   * Write a file. With `etag`, only if the file is still that version (412
   * otherwise); without, only if it does not exist yet (412 otherwise).
   */
  async write(path: string, bytes: Uint8Array, etag?: string, overwrite = false): Promise<{ etag?: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
    if (etag) headers['If-Match'] = etag;
    else if (!overwrite) headers['If-None-Match'] = '*';
    const res = await this.request('PUT', this.url(path), { headers, body: bytes as BodyInit });
    const fresh = res.headers.get('ETag') ?? res.headers.get('OC-ETag');
    if (fresh) return { etag: fresh };
    // Some servers do not return the new ETag: ask for it.
    const [entry] = (await this.propfind(this.url(path), '0')).filter((e) => e.path === path.replace(/^\/+|\/+$/g, ''));
    return entry?.etag ? { etag: entry.etag } : {};
  }

  /** Create a folder (MKCOL); 405 when it exists. */
  async mkdir(path: string): Promise<void> {
    await this.request('MKCOL', this.url(path, true));
  }

  /** Rename or move a file or folder; 412 when the target exists. */
  async move(from: string, to: string, dir = false): Promise<void> {
    await this.request('MOVE', this.url(from, dir), { headers: { Destination: this.url(to, dir), Overwrite: 'F' } });
  }

  /** Delete a file or a folder with its content. */
  async remove(path: string, dir = false): Promise<void> {
    await this.request('DELETE', this.url(path, dir));
  }

  private async propfind(url: string, depth: '0' | '1'): Promise<DavEntry[]> {
    const res = await this.request('PROPFIND', url, { headers: { Depth: depth, 'Content-Type': 'application/xml; charset=utf-8' }, body: PROPFIND_BODY });
    const doc = new DOMParser().parseFromString(await res.text(), 'application/xml');
    const rootPath = decode(this.root.pathname);
    const out: DavEntry[] = [];
    for (const response of Array.from(doc.getElementsByTagNameNS(DAV, 'response'))) {
      const href = response.getElementsByTagNameNS(DAV, 'href')[0]?.textContent ?? '';
      const full = decode(new URL(href, this.root).pathname);
      if (!full.startsWith(rootPath)) continue;
      const path = full.slice(rootPath.length).replace(/\/+$/, '');
      const prop = (name: string): Element | undefined => {
        for (const propstat of Array.from(response.getElementsByTagNameNS(DAV, 'propstat'))) {
          const status = propstat.getElementsByTagNameNS(DAV, 'status')[0]?.textContent ?? '';
          if (!/\s2\d\d\s/.test(` ${status} `)) continue;
          const el = propstat.getElementsByTagNameNS(DAV, name)[0];
          if (el) return el;
        }
        return undefined;
      };
      const isDir = !!prop('resourcetype')?.getElementsByTagNameNS(DAV, 'collection').length;
      const entry: DavEntry = { name: path.slice(path.lastIndexOf('/') + 1), path, type: isDir ? 'dir' : 'file' };
      if (!isDir) {
        const size = Number(prop('getcontentlength')?.textContent);
        if (Number.isFinite(size) && prop('getcontentlength')) entry.size = size;
        const etag = prop('getetag')?.textContent?.trim();
        if (etag) entry.etag = etag;
        const modified = Date.parse(prop('getlastmodified')?.textContent ?? '');
        if (!Number.isNaN(modified)) entry.modified = modified;
      }
      out.push(entry);
    }
    return out;
  }
}
