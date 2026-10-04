import { describe, expect, it } from 'vitest';
import { decodeRemoteLink, encodeRemoteLink, fetchRemote, fileNameOf, sha256Hex } from '../src/share/remote';

const BASE = 'https://s-celles.github.io/progressive-web-office/';
const FILE = 'https://example.org/docs/Rapport%20final.md';

describe('SHARE-011 links to a document on a server', () => {
  it('encodes and decodes the address and the pinned version', () => {
    const link = encodeRemoteLink(`${BASE}#old`, { url: FILE, sha256: 'AB'.repeat(32) });
    expect(link).toBe(`${BASE}#url=${encodeURIComponent(FILE)}&sha256=${'ab'.repeat(32)}`);
    expect(decodeRemoteLink(new URL(link).hash)).toEqual({ url: FILE, sha256: 'ab'.repeat(32) });
    expect(decodeRemoteLink('#doc=v1.x')).toBeNull();
    expect(() => decodeRemoteLink('#url=http%3A%2F%2Fexample.org%2Fa.md')).toThrow(/https/);
    expect(() => decodeRemoteLink(`#url=${encodeURIComponent(FILE)}&sha256=zz`)).toThrow(/damaged/);
    expect(() => encodeRemoteLink(BASE, { url: 'https://me:pw@example.org/a.md' })).toThrow(/password/);
  });

  it('names the file from the server or the address', () => {
    expect(fileNameOf(FILE, null)).toBe('Rapport final.md');
    expect(fileNameOf(FILE, 'attachment; filename="notes.odt"')).toBe('notes.odt');
    expect(fileNameOf(FILE, "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.docx")).toBe('résumé.docx');
  });

  it('downloads the file and refuses another version than the pinned one', async () => {
    const bytes = new TextEncoder().encode('# Report');
    const ok = async () => new Response(bytes, { status: 200 });
    const got = await fetchRemote({ url: FILE }, ok as typeof fetch);
    expect(got.name).toBe('Rapport final.md');
    expect(got.sha256).toBe(await sha256Hex(bytes));
    await expect(fetchRemote({ url: FILE, sha256: got.sha256 }, ok as typeof fetch)).resolves.toMatchObject({ name: 'Rapport final.md' });
    await expect(fetchRemote({ url: FILE, sha256: '0'.repeat(64) }, ok as typeof fetch)).rejects.toMatchObject({ kind: 'changed' });
    await expect(fetchRemote({ url: FILE }, (async () => new Response('', { status: 404 })) as typeof fetch)).rejects.toMatchObject({ kind: 'status' });
    await expect(fetchRemote({ url: FILE }, (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch)).rejects.toMatchObject({ kind: 'network' });
    await expect(fetchRemote({ url: FILE }, (async () => new Response('x', { headers: { 'Content-Length': String(250 * 1024 * 1024) } })) as typeof fetch)).rejects.toMatchObject({ kind: 'tooLarge' });
  });
});
