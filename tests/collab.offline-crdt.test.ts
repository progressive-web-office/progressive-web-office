import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { paragraph, type RichDocument } from '../src/document/model';
import { readCrdt, validateCrdt, writeCrdt, CRDT_LIMITS } from '../src/collab/offline/crdt';
import { richSample } from './fixtures';

const textOf = (doc: RichDocument): string[] => doc.blocks.map((b) => (b.type === 'paragraph' ? b.runs.map((r) => ('text' in r ? r.text : '')).join('') : b.type));

/** A second device that received everything from the first one. */
function fork(a: Y.Doc): Y.Doc {
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  return b;
}

function exchange(a: Y.Doc, b: Y.Doc): void {
  const toB = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const toA = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, toB);
  Y.applyUpdate(a, toA);
}

describe('COLLAB-008 text document as a CRDT', () => {
  it('round-trips a rich document, with its properties and images', () => {
    const doc = richSample();
    doc.references = { entries: [{ key: 'k', type: 'book', fields: { title: 'T' } }] };
    const y = new Y.Doc();
    writeCrdt(y, doc);
    const back = readCrdt(fork(y));
    expect(back.blocks).toEqual(doc.blocks);
    expect(back.meta).toEqual(doc.meta);
    expect(back.references).toEqual(doc.references);
    expect([...back.resources.keys()]).toEqual([...doc.resources.keys()]);
    expect(back.resources.get([...doc.resources.keys()][0]!)?.data).toEqual([...doc.resources.values()][0]!.data);
  });

  it('merges concurrent edits of the same paragraph character by character', () => {
    const base: RichDocument = { ...richSample(), blocks: [paragraph('Hello world'), paragraph('Second')] };
    const a = new Y.Doc();
    writeCrdt(a, base);
    const b = fork(a);
    writeCrdt(a, { ...base, blocks: [paragraph('Hello brave world'), paragraph('Second')] });
    writeCrdt(b, { ...base, blocks: [paragraph('Hello world!'), paragraph('Second line')] });
    exchange(a, b);
    expect(textOf(readCrdt(a))).toEqual(['Hello brave world!', 'Second line']);
    expect(textOf(readCrdt(b))).toEqual(textOf(readCrdt(a)));
  });

  it('writes nothing when the document did not change', () => {
    const y = new Y.Doc();
    const doc = richSample();
    writeCrdt(y, doc);
    const sv = Y.encodeStateVector(y);
    writeCrdt(y, readCrdt(y));
    expect(Y.encodeStateVector(y)).toEqual(sv);
  });

  it('accepts a valid document and rejects unknown nodes', () => {
    const y = new Y.Doc();
    writeCrdt(y, richSample());
    expect(validateCrdt(y)).toBeNull();
    y.getXmlFragment('body').insert(0, [new Y.XmlElement('script')]);
    expect(validateCrdt(y)).toMatch(/script|invalid/i);
  });

  it('rejects content that breaks the schema or the limits', () => {
    const y = new Y.Doc();
    writeCrdt(y, richSample());
    // A table cell directly in the document body.
    y.getXmlFragment('body').insert(0, [new Y.XmlElement('table_cell')]);
    expect(validateCrdt(y)).not.toBeNull();

    const big = new Y.Doc();
    writeCrdt(big, { ...richSample(), blocks: [paragraph('x'.repeat(CRDT_LIMITS.textChars + 1))] });
    expect(validateCrdt(big)).toMatch(/limit/i);
  });

  it('keeps the page numbering settings (DOC-029)', () => {
    const y = new Y.Doc();
    const page = { footer: { center: '{page}' }, numberFormat: 'upper-roman' as const, startAt: 2, hideOnFirstPage: true };
    writeCrdt(y, { ...richSample(), page });
    expect(readCrdt(y).page).toEqual(page);
    y.getMap('doc').set('page', JSON.stringify({ ...page, numberFormat: 'klingon' }));
    expect(validateCrdt(y)).toMatch(/page setup/);
  });

  it('rejects malformed properties', () => {
    const y = new Y.Doc();
    writeCrdt(y, richSample());
    y.getMap('doc').set('meta', '{not json');
    expect(validateCrdt(y)).not.toBeNull();
  });
});
