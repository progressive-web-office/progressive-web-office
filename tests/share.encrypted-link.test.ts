import { describe, expect, it } from 'vitest';
import { decodeDocumentLink, decodeEncryptedLink, encodeEncryptedLink, isEncryptedLink } from '../src/share/link';

const FAST = 1000;

describe('SHARE-014 links protected by a password', () => {
  it('opens only with the password, and hides name and content', async () => {
    const text = new TextEncoder().encode('# Secret plans\n\n'.repeat(20));
    const link = await encodeEncryptedLink('https://example.org/app/#old', 'plans/v1.md', text, 'correct horse', FAST);
    expect(link.startsWith('https://example.org/app/#doc=v2.')).toBe(true);
    const hash = link.slice(link.indexOf('#'));
    expect(isEncryptedLink(hash)).toBe(true);
    expect(hash).not.toContain('plans');
    expect(decodeDocumentLink(hash)).toBeNull();
    expect(await decodeEncryptedLink(hash, 'wrong', FAST)).toBeNull();
    const back = await decodeEncryptedLink(hash, 'correct horse', FAST);
    expect(back?.name).toBe('plans_v1.md');
    expect(new TextDecoder().decode(back!.bytes)).toBe(new TextDecoder().decode(text));
  });

  it('gives a different link each time, and refuses a damaged one', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const a = await encodeEncryptedLink('https://example.org/', 'a.bin', bytes, 'pw', FAST);
    const b = await encodeEncryptedLink('https://example.org/', 'a.bin', bytes, 'pw', FAST);
    expect(a).not.toBe(b);
    const hash = a.slice(a.indexOf('#'));
    expect((await decodeEncryptedLink(hash, 'pw', FAST))?.bytes).toEqual(bytes);
    expect(await decodeEncryptedLink(`${hash.slice(0, -2)}AA`, 'pw', FAST)).toBeNull();
  });
});
