// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { offline } from '@scelles/collab';
import { paragraph, type RichDocument } from '../src/document/model';
import { readCrdt, writeCrdt } from '../src/collab/offline/crdt';
import { docIdOf, DocumentSync, type SyncPrompts } from '../src/collab/offline/sync';
import { richSample } from './fixtures';

const DOC_ID = '0f8c2b1e-5d4a-4c3b-9a21-7e6f5d4c3b2a';
const texts = (doc: RichDocument): string[] => doc.blocks.map((b) => (b.type === 'paragraph' ? b.runs.map((r) => ('text' in r ? r.text : '')).join('') : b.type));

async function device(name: string, ydoc = new Y.Doc()) {
  const peers = new offline.MemoryPeerStore();
  const log = new offline.MemoryImportLog();
  const sync = new DocumentSync({ doc: ydoc, docId: DOC_ID, key: await offline.generatePeerKey(), name, peers, log });
  return { name, ydoc, peers, log, sync, texts: () => texts(readCrdt(ydoc)) };
}

const accept: SyncPrompts = { trust: async () => true, review: async () => true };

describe('COLLAB-008 offline sync of a text document', () => {
  it('merges both sides in three passes', async () => {
    const base = { ...richSample(), blocks: [paragraph('Hello world'), paragraph('Second')] };
    const a = await device('Ana');
    writeCrdt(a.ydoc, base);
    const bDoc = new Y.Doc();
    Y.applyUpdate(bDoc, Y.encodeStateAsUpdate(a.ydoc));
    const b = await device('Bob', bDoc);
    writeCrdt(a.ydoc, { ...base, blocks: [paragraph('Hello brave world'), paragraph('Second')] });
    writeCrdt(b.ydoc, { ...base, blocks: [paragraph('Hello world!'), paragraph('Second line')] });

    const pass1 = await a.sync.start();
    const atB = await b.sync.handle(pass1, accept);
    expect(atB.reply).toBeDefined();
    const atA = await a.sync.handle(atB.reply!, accept);
    expect(atA.changed).toBe(true);
    const atB2 = await b.sync.handle(atA.reply!, accept);
    expect(atB2.reply).toBeUndefined();
    expect(a.texts()).toEqual(['Hello brave world!', 'Second line']);
    expect(b.texts()).toEqual(a.texts());
    // Each side now trusts the other, and logged what it applied.
    expect((await a.peers.list()).map((p) => p.name)).toEqual(['Bob']);
    expect((await b.log.list()).map((e) => e.result)).toEqual(['applied']);
  });

  it('gives a new device the whole document in one pass', async () => {
    const a = await device('Ana');
    writeCrdt(a.ydoc, richSample());
    const pass = await a.sync.everything();
    expect(docIdOf(pass)).toBe(DOC_ID);
    const b = await device('Bob');
    const res = await b.sync.handle(pass, accept);
    expect(res.reply).toBeUndefined();
    expect(readCrdt(b.ydoc).blocks).toEqual(richSample().blocks);
  });

  it('leaves the document untouched when the update is refused', async () => {
    const a = await device('Ana');
    writeCrdt(a.ydoc, richSample());
    const b = await device('Bob');
    const res = await b.sync.handle(await a.sync.everything(), { trust: async () => false, review: async (u) => (expect(u.trust).toBe('unknown'), false) });
    expect(res.changed).toBe(false);
    expect(b.ydoc.getXmlFragment('body').length).toBe(0);
    expect((await b.log.list()).map((e) => e.result)).toEqual(['refused']);
  });

  it('rejects an update that would make an invalid document', async () => {
    const a = await device('Ana');
    writeCrdt(a.ydoc, richSample());
    a.ydoc.getXmlFragment('body').insert(0, [new Y.XmlElement('script')]);
    const b = await device('Bob');
    await expect(b.sync.handle(await a.sync.everything(), accept)).rejects.toThrow(/script|invalid/i);
    expect(b.ydoc.getXmlFragment('body').length).toBe(0);
    expect((await b.log.list()).map((e) => e.result)).toEqual(['rejected']);
  });

  it('rejects bytes that are not sync frames', async () => {
    const b = await device('Bob');
    await expect(b.sync.handle(new TextEncoder().encode('hello'), accept)).rejects.toBeInstanceOf(offline.FrameError);
    expect(docIdOf(new Uint8Array(3))).toBeNull();
  });
});
