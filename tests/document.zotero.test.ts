import { describe, expect, it } from 'vitest';
import { ZoteroClient, ZoteroError } from '../src/document/zotero';

const BIB = '@book{knuth1984,\n  title = {The {TeX}book},\n  author = {Knuth, Donald E.},\n  year = {1984},\n  publisher = {Addison-Wesley}\n}\n';

function fakeZotero() {
  const urls: string[] = [];
  const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
    urls.push(url);
    if ((init?.headers as Record<string, string>)['Zotero-API-Key'] !== 'k1') return new Response('Forbidden', { status: 403 });
    const u = new URL(url);
    if (u.pathname === '/keys/current') return Response.json({ userID: 42, username: 'ada' });
    if (u.pathname === '/users/42/items/top') return new Response(u.searchParams.get('q') === 'knuth' ? BIB : '', { status: 200 });
    if (u.pathname === '/users/42/collections') return Response.json([{ key: 'C2', data: { name: 'Thesis' }, meta: { numItems: 1 } }, { key: 'C1', data: { name: 'Articles' }, meta: { numItems: 3 } }]);
    if (u.pathname === '/users/42/collections/C2/items/top') return new Response(BIB);
    return new Response('Not found', { status: 404 });
  };
  return { fetchFn, urls };
}

describe('BIB-010 Zotero library', () => {
  it('finds the account of a key, and refuses a wrong one', async () => {
    const { fetchFn } = fakeZotero();
    expect(await new ZoteroClient('k1', fetchFn).account()).toEqual({ apiKey: 'k1', userId: 42, username: 'ada' });
    await expect(new ZoteroClient('bad', fetchFn).account()).rejects.toBeInstanceOf(ZoteroError);
  });

  it('searches the library and reads collections as BibTeX entries with their keys', async () => {
    const { fetchFn, urls } = fakeZotero();
    const client = new ZoteroClient('k1', fetchFn);
    const found = await client.search(42, 'knuth');
    expect(found.map((e) => [e.key, e.fields.title])).toEqual([['knuth1984', 'The TeXbook']]);
    expect(urls.at(-1)).toContain('format=bibtex');
    expect(urls.at(-1)).toContain('qmode=titleCreatorYear');
    expect(await client.collections(42)).toEqual([{ key: 'C1', name: 'Articles', items: 3 }, { key: 'C2', name: 'Thesis', items: 1 }]);
    expect((await client.collection(42, 'C2')).map((e) => e.key)).toEqual(['knuth1984']);
  });
});
