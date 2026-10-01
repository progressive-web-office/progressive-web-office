import { describe, expect, it } from 'vitest';
import { davRootUrl, WebDavClient, WebDavError } from '../src/webdav/client';

const ROOT = 'https://cloud.example.org/remote.php/dav/files/ada/';

const MULTISTATUS = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:response>
    <d:href>/remote.php/dav/files/ada/Cours/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:getetag>"dir1"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/ada/Cours/TP%201/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/ada/Cours/R%C3%A9sum%C3%A9.odt</d:href>
    <d:propstat>
      <d:prop><d:resourcetype/><d:getcontentlength>1234</d:getcontentlength><d:getetag>"abc"</d:getetag><d:getlastmodified>Wed, 01 Oct 2026 10:00:00 GMT</d:getlastmodified></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

interface Call {
  method: string;
  url: string;
  headers: Headers;
  body?: unknown;
}

function server(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const call = { method: init?.method ?? 'GET', url: String(input), headers: new Headers(init?.headers), body: init?.body };
    calls.push(call);
    return handler(call);
  };
  return { fetchFn, calls };
}

const client = (fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => new WebDavClient({ url: ROOT, username: 'ada', password: 'app-pass' }, fetchFn);

describe('DAV-001 WebDAV root', () => {
  it('derives the Nextcloud files URL from the server address and user', () => {
    expect(davRootUrl('https://cloud.example.org/', 'ada')).toBe(ROOT);
    expect(davRootUrl('https://cloud.example.org/nextcloud', 'jean dupont')).toBe('https://cloud.example.org/nextcloud/remote.php/dav/files/jean%20dupont/');
    // A full WebDAV address is kept as is.
    expect(davRootUrl('https://dav.example.org/webdav', '')).toBe('https://dav.example.org/webdav/');
    expect(davRootUrl('https://cloud.example.org/remote.php/dav/files/ada', 'ada')).toBe(ROOT);
  });
});

describe('DAV-002 browsing', () => {
  it('lists a folder with PROPFIND depth 1, folders first, without the folder itself', async () => {
    const { fetchFn, calls } = server(() => new Response(MULTISTATUS, { status: 207 }));
    const entries = await client(fetchFn).list('Cours');
    expect(calls[0]).toMatchObject({ method: 'PROPFIND', url: `${ROOT}Cours/` });
    expect(calls[0]!.headers.get('Depth')).toBe('1');
    expect(calls[0]!.headers.get('Authorization')).toBe(`Basic ${btoa('ada:app-pass')}`);
    expect(entries).toEqual([
      { name: 'TP 1', path: 'Cours/TP 1', type: 'dir' },
      { name: 'Résumé.odt', path: 'Cours/Résumé.odt', type: 'file', size: 1234, etag: '"abc"', modified: Date.parse('Wed, 01 Oct 2026 10:00:00 GMT') },
    ]);
  });
});

describe('DAV-003 reading and writing', () => {
  it('reads a file with its ETag', async () => {
    const { fetchFn, calls } = server(() => new Response(new Uint8Array([1, 2, 3]), { headers: { ETag: '"v1"' } }));
    expect(await client(fetchFn).read('Cours/Résumé.odt')).toEqual({ bytes: new Uint8Array([1, 2, 3]), etag: '"v1"' });
    expect(calls[0]!.url).toBe(`${ROOT}Cours/R%C3%A9sum%C3%A9.odt`);
  });

  it('writes only over the version that was read, and creates new files without overwriting', async () => {
    const { fetchFn, calls } = server((c) => new Response(null, { status: c.headers.has('If-Match') ? 204 : 201, headers: { ETag: '"v2"' } }));
    expect(await client(fetchFn).write('a.md', new Uint8Array([65]), '"v1"')).toEqual({ etag: '"v2"' });
    expect(calls[0]).toMatchObject({ method: 'PUT', url: `${ROOT}a.md` });
    expect(calls[0]!.headers.get('If-Match')).toBe('"v1"');
    await client(fetchFn).write('b.md', new Uint8Array([66]));
    expect(calls[1]!.headers.get('If-None-Match')).toBe('*');
  });

  it('reports a conflict when the file changed meanwhile', async () => {
    const { fetchFn } = server(() => new Response('', { status: 412 }));
    const err = (await client(fetchFn)
      .write('a.md', new Uint8Array([65]), '"old"')
      .catch((e: unknown) => e)) as WebDavError;
    expect(err).toBeInstanceOf(WebDavError);
    expect(err.status).toBe(412);
    expect(err.conflict).toBe(true);
  });

  it('asks for the ETag when the server does not return it after PUT', async () => {
    const { fetchFn, calls } = server((c) => (c.method === 'PUT' ? new Response(null, { status: 204 }) : new Response(MULTISTATUS.replace('"abc"', '"after"'), { status: 207 })));
    expect(await client(fetchFn).write('Cours/Résumé.odt', new Uint8Array([1]), '"abc"')).toEqual({ etag: '"after"' });
    expect(calls[1]).toMatchObject({ method: 'PROPFIND' });
    expect(calls[1]!.headers.get('Depth')).toBe('0');
  });

  it('distinguishes network/CORS failures from refused credentials', async () => {
    const offline = await client(async () => {
      throw new TypeError('Failed to fetch');
    })
      .list('')
      .catch((e: unknown) => e);
    expect(offline).toMatchObject({ name: 'WebDavError', status: 0 });
    const denied = await client(async () => new Response('', { status: 401 }))
      .list('')
      .catch((e: unknown) => e);
    expect(denied).toMatchObject({ status: 401 });
  });
});
