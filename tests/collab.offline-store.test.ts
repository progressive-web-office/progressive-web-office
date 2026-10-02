// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { deviceKey, forgetCrdt, IdbImportLog, IdbPeerStore, loadCrdt, MAX_LOG, saveCrdt, syncedDocuments } from '../src/collab/offline/store';

describe('COLLAB-008 offline sync storage', () => {
  it('creates the device key once and keeps it', async () => {
    const a = await deviceKey();
    const b = await deviceKey();
    expect(b.id).toEqual(a.id);
    expect(b.publicKey).toEqual(a.publicKey);
  });

  it('keeps trusted devices', async () => {
    const peers = new IdbPeerStore();
    await peers.put({ id: 'ab', name: 'Bob', publicKey: new Uint8Array(32), addedAt: 1 });
    expect((await peers.get('ab'))?.name).toBe('Bob');
    await peers.remove('ab');
    expect(await peers.list()).toEqual([]);
  });

  it('keeps a bounded import log', async () => {
    const log = new IdbImportLog();
    for (let i = 0; i < MAX_LOG + 3; i++) await log.add({ at: i, docId: i % 2 ? 'x' : 'y', peer: 'p', trust: 'unknown', bytes: 1, result: 'applied' });
    const all = await log.list();
    expect(all.length).toBe(MAX_LOG);
    expect(all[0]!.at).toBe(3);
    expect((await log.list('x')).every((e) => e.docId === 'x')).toBe(true);
  });

  it('stores, lists and forgets documents', async () => {
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'hello');
    await saveCrdt('d1', 'Report', doc);
    expect((await loadCrdt('d1'))?.getText('t').toString()).toBe('hello');
    expect((await syncedDocuments()).map((d) => d.title)).toEqual(['Report']);
    await forgetCrdt('d1');
    expect(await loadCrdt('d1')).toBeNull();
    expect(await syncedDocuments()).toEqual([]);
  });
});
