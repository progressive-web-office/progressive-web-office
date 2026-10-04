/**
 * CAL-006, CONTACT-005: a CalDAV (RFC 4791) and CardDAV (RFC 6352) client —
 * the calendars and address books of an account found from its address,
 * the versions (ETags) of their items listed, the items changed read
 * together, written with the version they replace, and removed.
 */
import type { FetchFn } from '../webdav/client';

export interface DavCredentials {
  /** Any address of the server: its root, or the WebDAV folder of the user's files (Nextcloud). */
  url: string;
  username: string;
  password: string;
}

export type CollectionKind = 'calendar' | 'addressbook';

export interface Collection {
  kind: CollectionKind;
  /** Absolute address, ending with '/'. */
  url: string;
  name: string;
  colour?: string;
}

export class DavSyncError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the server could not be reached (network, CORS). */
    readonly status: number,
  ) {
    super(message);
    this.name = 'DavSyncError';
  }

  /** The item changed on the server since it was read (412), or exists already. */
  get conflict(): boolean {
    return this.status === 412;
  }
}

const NS = { d: 'DAV:', c: 'urn:ietf:params:xml:ns:caldav', card: 'urn:ietf:params:xml:ns:carddav', apple: 'http://apple.com/ns/ical/' };

function basic(username: string, password: string): string {
  let binary = '';
  for (const b of new TextEncoder().encode(`${username}:${password}`)) binary += String.fromCharCode(b);
  return `Basic ${btoa(binary)}`;
}

const first = (el: Element | Document, ns: string, name: string): Element | undefined => el.getElementsByTagNameNS(ns, name)[0] ?? undefined;
const all = (el: Element | Document, ns: string, name: string): Element[] => Array.from(el.getElementsByTagNameNS(ns, name));

/** An address in one form, to compare them: its path decoded (`%40` and `@` the same). */
export function canonical(href: string): string {
  const u = new URL(href);
  try {
    return `${u.origin}${decodeURIComponent(u.pathname)}`;
  } catch {
    return `${u.origin}${u.pathname}`;
  }
}

/** The properties of each response of a multistatus, those answered 2xx only. */
function responses(xml: string, base: string): { href: string; prop: (ns: string, name: string) => Element | undefined }[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return all(doc, NS.d, 'response').map((r) => {
    const href = canonical(new URL(first(r, NS.d, 'href')?.textContent?.trim() ?? '', base).href);
    const props = all(r, NS.d, 'propstat').filter((p) => /\s2\d\d\s/.test(` ${first(p, NS.d, 'status')?.textContent ?? 'HTTP/1.1 200 OK'} `));
    return { href, prop: (ns: string, name: string) => props.map((p) => first(p, ns, name)).find(Boolean) };
  });
}

export class DavSyncClient {
  constructor(
    private readonly creds: DavCredentials,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {}

  private async request(method: string, url: string, init: { headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
    let res: Response;
    try {
      // The canonical form of an address, encoded again to be sent.
      res = await this.fetchFn(new URL(url).href, {
        method,
        headers: { Authorization: basic(this.creds.username, this.creds.password), ...(init.body !== undefined && !init.headers?.['Content-Type'] ? { 'Content-Type': 'application/xml; charset=utf-8' } : {}), ...init.headers },
        ...(init.body !== undefined ? { body: init.body } : {}),
      });
    } catch (err) {
      throw new DavSyncError((err as Error).message || 'Network error', 0);
    }
    if (!res.ok && res.status !== 207) throw new DavSyncError(`HTTP ${res.status}`, res.status);
    return res;
  }

  private async propfind(url: string, depth: '0' | '1', props: string): Promise<ReturnType<typeof responses>> {
    const body = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="${NS.c}" xmlns:card="${NS.card}" xmlns:apple="${NS.apple}"><d:prop>${props}</d:prop></d:propfind>`;
    const res = await this.request('PROPFIND', url, { headers: { Depth: depth }, body });
    return responses(await res.text(), url);
  }

  /** Where discovery starts: the DAV root of a Nextcloud address, else the address. */
  private start(): string {
    const u = new URL(this.creds.url);
    const nextcloud = /^(.*\/remote\.php\/dav\/)/.exec(u.pathname);
    return nextcloud ? `${u.origin}${nextcloud[1]}` : u.href.endsWith('/') ? u.href : `${u.href}/`;
  }

  /** The calendars (events) or the address books of the account. */
  async discover(kind: CollectionKind): Promise<Collection[]> {
    let start = this.start();
    let principal: Element | undefined;
    try {
      principal = (await this.propfind(start, '0', '<d:current-user-principal/>'))[0]?.prop(NS.d, 'current-user-principal');
    } catch (err) {
      // A server answering only at its well-known address.
      if ((err as DavSyncError).status !== 404 && (err as DavSyncError).status !== 405) throw err;
    }
    if (!principal) {
      start = new URL(`/.well-known/${kind === 'calendar' ? 'caldav' : 'carddav'}`, start).href;
      principal = (await this.propfind(start, '0', '<d:current-user-principal/>'))[0]?.prop(NS.d, 'current-user-principal');
    }
    const principalUrl = new URL(principal?.textContent?.trim() || start, start).href;
    const homeProp = kind === 'calendar' ? '<c:calendar-home-set/>' : '<card:addressbook-home-set/>';
    const home = (await this.propfind(principalUrl, '0', homeProp))[0]?.prop(kind === 'calendar' ? NS.c : NS.card, kind === 'calendar' ? 'calendar-home-set' : 'addressbook-home-set');
    const homeUrl = new URL(home?.textContent?.trim() || principalUrl, principalUrl).href;
    const found = await this.propfind(homeUrl, '1', '<d:resourcetype/><d:displayname/><c:supported-calendar-component-set/><apple:calendar-color/>');
    const out: Collection[] = [];
    for (const r of found) {
      const type = r.prop(NS.d, 'resourcetype');
      const isKind = kind === 'calendar' ? !!type && !!first(type, NS.c, 'calendar') : !!type && !!first(type, NS.card, 'addressbook');
      if (!isKind) continue;
      // Calendars holding events (not only tasks).
      const comps = r.prop(NS.c, 'supported-calendar-component-set');
      if (kind === 'calendar' && comps && !all(comps, NS.c, 'comp').some((c) => c.getAttribute('name') === 'VEVENT')) continue;
      const url = r.href.endsWith('/') ? r.href : `${r.href}/`;
      const colour = r.prop(NS.apple, 'calendar-color')?.textContent?.trim().slice(0, 7);
      out.push({ kind, url, name: r.prop(NS.d, 'displayname')?.textContent?.trim() || decodeURIComponent(url.split('/').filter(Boolean).pop() ?? ''), ...(colour ? { colour } : {}) });
    }
    return out;
  }

  /** The items of a collection and their versions. */
  async versions(collection: Collection): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const r of await this.propfind(collection.url, '1', '<d:getetag/><d:resourcetype/>')) {
      if (r.href === collection.url || r.prop(NS.d, 'resourcetype')?.children.length) continue;
      const etag = r.prop(NS.d, 'getetag')?.textContent?.trim();
      if (etag) out.set(r.href, etag);
    }
    return out;
  }

  /** Items read together (multiget), 50 at a time. */
  async read(collection: Collection, hrefs: string[]): Promise<Map<string, { etag: string; data: string }>> {
    const out = new Map<string, { etag: string; data: string }>();
    const cal = collection.kind === 'calendar';
    for (let i = 0; i < hrefs.length; i += 50) {
      const list = hrefs.slice(i, i + 50).map((h) => `<d:href>${new URL(h).pathname.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</d:href>`).join('');
      // (`new URL()` encodes the path again, as the server expects it.)
      const body = cal
        ? `<?xml version="1.0" encoding="utf-8"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="${NS.c}"><d:prop><d:getetag/><c:calendar-data/></d:prop>${list}</c:calendar-multiget>`
        : `<?xml version="1.0" encoding="utf-8"?><card:addressbook-multiget xmlns:d="DAV:" xmlns:card="${NS.card}"><d:prop><d:getetag/><card:address-data/></d:prop>${list}</card:addressbook-multiget>`;
      const res = await this.request('REPORT', collection.url, { headers: { Depth: '1' }, body });
      for (const r of responses(await res.text(), collection.url)) {
        const data = r.prop(cal ? NS.c : NS.card, cal ? 'calendar-data' : 'address-data')?.textContent;
        const etag = r.prop(NS.d, 'getetag')?.textContent?.trim();
        if (data && etag) out.set(r.href, { etag, data });
      }
    }
    return out;
  }

  /** Write an item: a new one (`etag` undefined: it must not exist), or the version `etag`. Returns its new version. */
  async write(collection: Collection, href: string, data: string, etag?: string): Promise<string | undefined> {
    const res = await this.request('PUT', href, {
      headers: { 'Content-Type': collection.kind === 'calendar' ? 'text/calendar; charset=utf-8' : 'text/vcard; charset=utf-8', ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) },
      body: data,
    });
    const fromHeader = res.headers.get('ETag') ?? undefined;
    if (fromHeader) return fromHeader;
    // Some servers give the version only when asked.
    return (await this.propfind(href, '0', '<d:getetag/>').catch(() => []))[0]?.prop(NS.d, 'getetag')?.textContent?.trim();
  }

  async remove(href: string, etag?: string): Promise<void> {
    await this.request('DELETE', href, etag ? { headers: { 'If-Match': etag } } : {});
  }
}
