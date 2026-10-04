import { describe, expect, it } from 'vitest';
import { documentStatuses } from '../src/devsync/overview';
import { withRecord, loadSyncState } from '../src/devsync/state';

describe('DEVSYNC-011 documents and history', () => {
  it('tells what is synced, only here, and not here yet', () => {
    const rows = documentStatuses(
      { 'a.odt': 'h1', 'b.odt': 'h2', 'c.odt': 'h3' },
      {
        p: { name: 'Phone', at: 1, files: { 'a.odt': 'h1', 'b.odt': 'old', 'd.odt': 'h4', 'gone.odt': 'h5' } },
        t: { name: 'Tablet', at: 1, files: { 'a.odt': 'h1', 'b.odt': 'h2', 'c.odt': 'h3', 'd.odt': 'h4' } },
      },
      { 'gone.odt': 5 },
    );
    expect(rows).toEqual([
      { path: 'a.odt', status: { kind: 'synced' } },
      { path: 'b.odt', status: { kind: 'local', missing: [], different: ['Phone'] } },
      { path: 'c.odt', status: { kind: 'local', missing: ['Phone'], different: [] } },
      { path: 'd.odt', status: { kind: 'remote', on: ['Phone', 'Tablet'] } },
    ]);
  });

  it('keeps a bounded history', () => {
    let s = loadSyncState();
    for (let i = 0; i < 205; i++) s = withRecord(s, { at: i, device: 'd', name: 'Phone', fetched: Array.from({ length: 60 }, (_, k) => `f${k}`), trashed: [], conflicts: [], failed: [] });
    expect(s.history).toHaveLength(200);
    expect(s.history![0]!.at).toBe(5);
    expect(s.history![0]!.fetched).toHaveLength(50);
  });
});
