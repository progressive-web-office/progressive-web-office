import { describe, expect, it } from 'vitest';
import { WebDavClient } from '../src/webdav/client';
import { WebDavProvider } from '../src/webdav/provider';
import { listFiles, readText } from '../src/fs';

const ROOT = 'https://cloud.example/remote.php/dav/files/ana/';

/** A tiny WebDAV server in memory: files by path, folders as a set. */
function davServer(files: Record<string, string>) {
  const store = new Map(Object.entries(files));
  const dirs = new Set<string>(['']);
  for (const p of store.keys()) for (let d = p; d.includes('/'); ) dirs.add((d = d.slice(0, d.lastIndexOf('/'))));
  const pathOf = (url: string): string => decodeURIComponent(new URL(url).pathname.slice(new URL(ROOT).pathname.length)).replace(/\/+$/, '');
  const xmlEntry = (path: string, dir: boolean): string =>
    `<d:response><d:href>${new URL(ROOT).pathname}${path.split('/').map(encodeURIComponent).join('/')}${dir && path ? '/' : ''}</d:href><d:propstat><d:prop><d:resourcetype>${dir ? '<d:collection/>' : ''}</d:resourcetype>${dir ? '' : `<d:getcontentlength>${store.get(path)!.length}</d:getcontentlength>`}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
  const fetchFn = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const path = pathOf(String(input));
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const method = init.method ?? 'GET';
    const headers = init.headers as Record<string, string>;
    if (method === 'PROPFIND') {
      if (!dirs.has(path) && !store.has(path)) return new Response('', { status: 404 });
      const children = [...dirs].filter((d) => d && d !== path && (d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '') === path).map((d) => xmlEntry(d, true));
      const fileEntries = [...store.keys()].filter((f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '') === path).map((f) => xmlEntry(f, false));
      const self = store.has(path) ? xmlEntry(path, false) : xmlEntry(path, true);
      return new Response(`<d:multistatus xmlns:d="DAV:">${self}${headers.Depth === '0' ? '' : children.join('') + fileEntries.join('')}</d:multistatus>`, { status: 207 });
    }
    if (method === 'GET') return store.has(path) ? new Response(store.get(path)) : new Response('', { status: 404 });
    if (method === 'PUT') {
      if (!dirs.has(parent)) return new Response('', { status: 409 });
      store.set(path, new TextDecoder().decode(init.body as Uint8Array));
      return new Response('', { status: 201, headers: { ETag: '"1"' } });
    }
    if (method === 'MKCOL') {
      if (dirs.has(path)) return new Response('', { status: 405 });
      if (!dirs.has(parent)) return new Response('', { status: 409 });
      dirs.add(path);
      return new Response('', { status: 201 });
    }
    if (method === 'MOVE') {
      const to = pathOf(headers.Destination!);
      if (store.has(to) || dirs.has(to)) return new Response('', { status: 412 });
      for (const k of [...store.keys()]) if (k === path || k.startsWith(`${path}/`)) {
        store.set(to + k.slice(path.length), store.get(k)!);
        store.delete(k);
      }
      for (const d of [...dirs]) if (d === path || d.startsWith(`${path}/`)) {
        dirs.delete(d);
        dirs.add(to + d.slice(path.length));
      }
      return new Response('', { status: 201 });
    }
    if (method === 'DELETE') {
      for (const k of [...store.keys()]) if (k === path || k.startsWith(`${path}/`)) store.delete(k);
      for (const d of [...dirs]) if (d === path || d.startsWith(`${path}/`)) dirs.delete(d);
      return new Response(null, { status: 204 });
    }
    return new Response('', { status: 400 });
  };
  return { store, fetchFn };
}

describe('FOLDER-006 WebDAV / Nextcloud as an explorer provider', () => {
  it('lists, reads, writes into new folders, moves and deletes', async () => {
    const { store, fetchFn } = davServer({ 'Cours/TP1.md': '# TP1', 'notes.md': 'n' });
    const p = new WebDavProvider(new WebDavClient({ url: ROOT, username: 'ana', password: 'x' }, fetchFn), 'webdav:test', 'cloud');
    expect((await p.list('')).map((e) => `${e.kind}:${e.path}`)).toEqual(['directory:Cours', 'file:notes.md']);
    expect(await readText(p, 'Cours/TP1.md')).toBe('# TP1');
    await p.write('Cours/2026/TP2.md', new Blob(['# TP2']));
    expect(store.get('Cours/2026/TP2.md')).toBe('# TP2');
    await p.move('Cours', 'Archive/Cours');
    expect(await listFiles(p)).toEqual(['Archive/Cours/2026/TP2.md', 'Archive/Cours/TP1.md', 'notes.md']);
    await expect(p.move('notes.md', 'Archive/Cours/TP1.md')).rejects.toMatchObject({ code: 'Exists' });
    await expect(p.remove('Archive')).rejects.toMatchObject({ code: 'NotEmpty' });
    await p.remove('Archive', { recursive: true });
    expect([...store.keys()]).toEqual(['notes.md']);
    await expect(p.read('gone.md')).rejects.toMatchObject({ code: 'NotFound' });
  });
});
