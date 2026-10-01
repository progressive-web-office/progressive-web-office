import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { CollabBinding } from '../src/collab/binding';
import { applyDocumentParts, documentParts, parse, partsWorkbook, stringify, workbookParts, type CollabAdapter, type CollabParts } from '../src/collab/parts';
import { setCell, type Workbook } from '../src/sheet/model';
import { emptyDocument, type Block } from '../src/document/model';

const para = (text: string): Block => ({ type: 'paragraph', style: 'normal', runs: [{ text }] });

/** Two Yjs documents wired together, like two peers; `hold()` delays delivery until `flush()`. */
function linked(): [Y.Doc, Y.Doc, { hold(): void; flush(): void }] {
  const a = new Y.Doc();
  const b = new Y.Doc();
  let held: (() => void)[] | null = null;
  const send = (to: Y.Doc) => (u: Uint8Array, origin: unknown) => {
    if (origin === 'net') return;
    const deliver = () => Y.applyUpdate(to, u, 'net');
    if (held) held.push(deliver);
    else deliver();
  };
  a.on('update', send(b));
  b.on('update', send(a));
  return [a, b, { hold: () => (held = []), flush: () => { const q = held ?? []; held = null; q.forEach((f) => f()); } }];
}

class Fake implements CollabAdapter {
  writes = 0;
  constructor(public parts: CollabParts) {}
  read(): CollabParts {
    return structuredClone(this.parts);
  }
  write(parts: CollabParts): void {
    this.writes++;
    this.parts = structuredClone(parts);
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('COLLAB-002 parts', () => {
  it('serialises bytes and maps with stable key order', () => {
    const value = { b: new Uint8Array([1, 2, 255]), a: new Map([[3, 40]]), u: undefined };
    expect(stringify(value)).toBe('{"a":{"$map":[[3,40]]},"b":{"$b64":"AQL/"}}');
    expect(parse(stringify(value))).toEqual({ a: new Map([[3, 40]]), b: new Uint8Array([1, 2, 255]) });
  });

  it('splits a workbook into sheets and cells, and back', () => {
    const wb: Workbook = { sheets: [{ name: 'A', cells: new Map(), colWidths: new Map([[0, 120]]) }, { name: 'B', cells: new Map() }] };
    setCell(wb.sheets[0]!, 'B2', { value: 3, formula: '1+2' });
    setCell(wb.sheets[1]!, 'A1', { value: 'x' });
    const parts = workbookParts(wb);
    expect(Object.keys(parts.keys).sort()).toEqual(['c:0:1,1', 'c:1:0,0', 's:0', 's:1']);
    expect(partsWorkbook(parts)).toEqual(wb);
  });

  it('splits a document into properties, images and blocks', () => {
    const doc = emptyDocument();
    doc.meta = { title: 'Notes' };
    doc.resources.set('img1', { data: new Uint8Array([9]), mediaType: 'image/png' });
    const parts = documentParts(doc, [para('one'), para('two')]);
    expect(parts.list).toHaveLength(2);
    const other = emptyDocument();
    expect(applyDocumentParts(other, parts)).toEqual([para('one'), para('two')]);
    expect(other.meta).toEqual({ title: 'Notes' });
    expect(other.resources.get('img1')!.data).toEqual(new Uint8Array([9]));
  });
});

describe('COLLAB-002 binding', () => {
  it('gives a joiner the shared content and never sends its empty document first', async () => {
    const [a, b] = linked();
    const owner = new Fake({ keys: { 'c:0:0,0': '1', 's:0': '{}' }, list: ['p1'] });
    new CollabBinding(a, owner, { initiator: true });
    const joiner = new Fake({ keys: { 's:0': '{"empty":true}' }, list: [] });
    const bound = new CollabBinding(b, joiner, { initiator: false });
    expect(bound.isReady).toBe(true);
    expect(joiner.parts).toEqual(owner.parts);
  });

  it('merges concurrent edits of different cells and paragraphs', async () => {
    const [a, b, net] = linked();
    const fa = new Fake({ keys: { x: '1', y: '1' }, list: ['p1', 'p2', 'p3'] });
    const ba = new CollabBinding(a, fa, { initiator: true });
    const fb = new Fake({ keys: {}, list: [] });
    const bb = new CollabBinding(b, fb, { initiator: false });
    await tick();
    // Two people edit at the same time, each before seeing the other's edit.
    fa.parts = { keys: { x: '2', y: '1' }, list: ['p1 edited', 'p2', 'p3'] };
    fb.parts = { keys: { x: '1', y: '3', z: 'new' }, list: ['p1', 'p2', 'p3', 'p4'] };
    net.hold();
    ba.push();
    bb.push();
    net.flush();
    await tick();
    const expected = { keys: { x: '2', y: '3', z: 'new' }, list: ['p1 edited', 'p2', 'p3', 'p4'] };
    expect(ba.shared()).toEqual(expected);
    expect(bb.shared()).toEqual(expected);
    expect(fa.parts).toEqual(expected);
    expect(fb.parts).toEqual(expected);
  });

  it('never reverts a remote edit that has not reached the editor yet', async () => {
    const [a, b] = linked();
    const fa = new Fake({ keys: { x: '1' }, list: ['p1', 'p2'] });
    const ba = new CollabBinding(a, fa, { initiator: true });
    const fb = new Fake({ keys: {}, list: [] });
    const bb = new CollabBinding(b, fb, { initiator: false });
    fa.parts = { keys: { x: '2' }, list: ['p0', 'p1', 'p2'] };
    ba.push(); // delivered at once; B's editor is refreshed only at the next microtask
    fb.parts = { keys: { x: '1', y: 'b' }, list: ['p1', 'p2', 'p3'] };
    bb.push();
    await tick();
    const expected = { keys: { x: '2', y: 'b' }, list: ['p0', 'p1', 'p2', 'p3'] };
    expect(ba.shared()).toEqual(expected);
    expect(fb.parts).toEqual(expected);
  });

  it('removes deleted parts and does not echo its own edits back to the editor', async () => {
    const [a] = linked();
    const fa = new Fake({ keys: { x: '1', y: '2' }, list: ['a', 'b', 'c'] });
    const ba = new CollabBinding(a, fa, { initiator: true });
    fa.parts = { keys: { x: '1' }, list: ['a', 'c'] };
    ba.push();
    await tick();
    expect(ba.shared()).toEqual({ keys: { x: '1' }, list: ['a', 'c'] });
    expect(fa.writes).toBe(0);
  });
});

describe('COLLAB-001 invitation links', async () => {
  const { collabUrl, decodeCollabLink, newCollabLink } = await import('../src/collab/link');
  it('round-trips the kind, room and secret, and rejects damaged links', () => {
    const link = newCollabLink('spreadsheet');
    const url = collabUrl('https://example.org/pwo/#old', link);
    expect(url).toMatch(/^https:\/\/example\.org\/pwo\/#collab=s\.[\w-]{12}\.[\w-]{24}$/);
    expect(decodeCollabLink(new URL(url).hash)).toEqual(link);
    expect(decodeCollabLink('#collab=x.abc.def')).toBeNull();
    expect(decodeCollabLink('#doc=v1')).toBeNull();
    expect(newCollabLink('document').secret).not.toBe(link.secret);
  });
});
