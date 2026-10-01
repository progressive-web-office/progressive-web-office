import { describe, expect, it } from 'vitest';
import {
  addResource,
  emptyDocument,
  nestLists,
  normalizeRuns,
  paragraph,
  plainText,
  wordCount,
  hashBytes,
} from '../src/document/model';

describe('document model', () => {
  it('creates an empty document with one paragraph', () => {
    const doc = emptyDocument();
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]).toMatchObject({ type: 'paragraph', style: 'normal', runs: [] });
  });

  it('merges adjacent runs with identical formatting and drops empty runs', () => {
    expect(
      normalizeRuns([
        { text: 'a', bold: true },
        { text: 'b', bold: true },
        { text: '' },
        { text: 'c' },
      ]),
    ).toEqual([{ text: 'ab', bold: true }, { text: 'c' }]);
  });

  it('DOC-010 counts words and characters', () => {
    const doc = emptyDocument();
    doc.blocks = [paragraph('Hello brave  new'), paragraph('world!')];
    expect(plainText(doc)).toBe('Hello brave  new\nworld!');
    expect(wordCount(doc)).toEqual({ words: 4, characters: 22 });
  });

  it('nests list paragraphs into list trees', () => {
    const items = [
      paragraph('a', { list: { ordered: false, level: 0 } }),
      paragraph('a.1', { list: { ordered: true, level: 1 } }),
      paragraph('b', { list: { ordered: false, level: 0 } }),
      paragraph('c', { list: { ordered: true, level: 0 } }),
    ];
    const roots = nestLists(items);
    expect(roots).toHaveLength(2); // bullet list then ordered list
    expect(roots[0]!.ordered).toBe(false);
    expect(roots[0]!.items).toHaveLength(2);
    expect(roots[0]!.items[0]!.children[0]!.ordered).toBe(true);
    expect(roots[1]!.ordered).toBe(true);
  });

  it('stores resources content-addressed (deduplicated)', () => {
    const doc = emptyDocument();
    const data = new Uint8Array([1, 2, 3]);
    const a = addResource(doc, data, 'image/png', 'a.png');
    const b = addResource(doc, new Uint8Array([1, 2, 3]), 'image/png', 'b.png');
    expect(a).toBe(b);
    expect(doc.resources.size).toBe(1);
    expect(hashBytes(data)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('list segmentation', () => {
  it('starts a new list when the top-level type changes', async () => {
    const { splitListSegments } = await import('../src/document/model');
    const segs = splitListSegments([
      paragraph('a', { list: { ordered: false, level: 0 } }),
      paragraph('a1', { list: { ordered: true, level: 1 } }),
      paragraph('1', { list: { ordered: true, level: 0 } }),
      paragraph('2', { list: { ordered: true, level: 0 } }),
    ]);
    expect(segs.map((s) => s.length)).toEqual([2, 2]);
  });
});
