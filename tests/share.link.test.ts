import { describe, expect, it } from 'vitest';
import { decodeDocumentLink, encodeDocumentLink, LINK_WARN_LENGTH } from '../src/share/link';

const BASE = 'https://progressive-web-office.github.io/';

describe('SHARE-009 documents in a link', () => {
  it('puts the document in the fragment, compressed, and reads it back', () => {
    const text = '# Notes\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(40);
    const bytes = new TextEncoder().encode(text);
    const link = encodeDocumentLink(BASE, 'notes de cours.md', bytes);
    expect(link.startsWith(`${BASE}#doc=`)).toBe(true);
    expect(link).not.toContain('?');
    expect(link.length).toBeLessThan(bytes.length);
    const back = decodeDocumentLink(new URL(link).hash);
    expect(back?.name).toBe('notes de cours.md');
    expect(new TextDecoder().decode(back!.bytes)).toBe(text);
  });

  it('keeps already compressed data as is', () => {
    const random = Uint8Array.from({ length: 300 }, (_, i) => (i * 7919) % 251);
    const link = encodeDocumentLink(BASE, 'data.xlsx', random);
    expect(decodeDocumentLink(new URL(link).hash)?.bytes).toEqual(random);
  });

  it('uses only URL-safe characters', () => {
    const link = encodeDocumentLink(BASE, 'é è/\\?#&.md', new Uint8Array([255, 254, 253, 0, 1]));
    expect(new URL(link).hash).toMatch(/^#doc=[A-Za-z0-9._~-]+$/);
    expect(decodeDocumentLink(new URL(link).hash)?.name).toBe('é è__?#&.md');
  });

  it('ignores other fragments and rejects corrupted links', () => {
    expect(decodeDocumentLink('')).toBeNull();
    expect(decodeDocumentLink('#section-2')).toBeNull();
    expect(decodeDocumentLink('#doc=v9.r.YQ.YQ')).toBeNull();
    expect(decodeDocumentLink('#doc=v1.d.YQ.!!!')).toBeNull();
  });

  it('documents the length above which some apps may cut the link', () => {
    expect(LINK_WARN_LENGTH).toBe(8000);
  });
});
