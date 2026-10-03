import { describe, expect, it } from 'vitest';
import { conflictName, planSync, type SyncManifest } from '../src/devsync/plan';

const m = (device: string, files: Record<string, [string, number]>, deleted: Record<string, number> = {}): SyncManifest => ({
  device,
  name: device === 'a' ? 'Laptop' : 'Phone',
  files: Object.fromEntries(Object.entries(files).map(([p, [hash, mtime]]) => [p, { hash, mtime }])),
  deleted,
});

describe('DEVSYNC-003 merging the documents of two devices', () => {
  it('fetches what the other device has new or changed, and nothing else', () => {
    const local = m('a', { 'a.md': ['h1', 10], 'same.md': ['s', 5] });
    const remote = m('b', { 'a.md': ['h2', 20], 'same.md': ['s', 5], 'new.md': ['n', 30] });
    const base = { 'a.md': 'h1', 'same.md': 's' };
    expect(planSync(local, remote, base)).toEqual([
      { kind: 'fetch', path: 'a.md' },
      { kind: 'fetch', path: 'new.md' },
    ]);
    // The other device's plan: nothing to fetch (its files are the newest).
    expect(planSync(remote, local, { 'a.md': 'h1', 'same.md': 's' })).toEqual([]);
  });

  it('propagates a deletion, to the trash, unless the file changed since', () => {
    const base = { 'gone.md': 'g', 'edited.md': 'e1' };
    const local = m('a', { 'gone.md': ['g', 10], 'edited.md': ['e2', 50] });
    const remote = m('b', {}, { 'gone.md': 40, 'edited.md': 40 });
    expect(planSync(local, remote, base)).toEqual([{ kind: 'trash', path: 'gone.md' }]);
    // The device that deleted does not fetch the deleted file back, but gets the edited one.
    expect(planSync(remote, local, base)).toEqual([{ kind: 'fetch', path: 'edited.md' }]);
  });

  it('keeps both versions of a file changed on both devices, named the same on both', () => {
    const base = { 'r.md': 'h0' };
    const local = m('a', { 'r.md': ['ha', 100] });
    const remote = m('b', { 'r.md': ['hb', 200] });
    const copyOfA = conflictName('r.md', 'Laptop', 100);
    expect(planSync(local, remote, base)).toEqual([
      { kind: 'rename', path: 'r.md', to: copyOfA },
      { kind: 'fetch', path: 'r.md' },
    ]);
    expect(planSync(remote, local, base)).toEqual([{ kind: 'fetch', path: 'r.md', to: copyOfA }]);
    expect(copyOfA).toMatch(/^r \(conflict Laptop \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\)\.md$/);
  });

  it('treats files of two devices never synchronised as conflicts only when they differ', () => {
    const local = m('a', { 'x.md': ['same', 1], 'y.md': ['ya', 1] });
    const remote = m('b', { 'x.md': ['same', 2], 'y.md': ['yb', 2] });
    const plan = planSync(local, remote, {});
    expect(plan.map((a) => a.kind)).toEqual(['rename', 'fetch']);
  });

  it('never touches the trash or hidden files', () => {
    const remote = m('b', { '.pwo-trash/old.md': ['t', 1], '.hidden': ['h', 1], 'ok.md': ['o', 1] });
    expect(planSync(m('a', {}), remote, {})).toEqual([{ kind: 'fetch', path: 'ok.md' }]);
  });
});
