import { describe, expect, it } from 'vitest';
import { MemoryProvider, listFiles } from '../src/fs';
import { applyPlan, deleteFromTrash, listTrash, restoreFromTrash } from '../src/devsync/engine';

const text = async (p: MemoryProvider, path: string) => (await p.read(path)).text();
const all = (p: MemoryProvider) => listFiles(p, '', { skip: () => false }).then((l) => l.sort());

describe('DEVSYNC-009 the trash in the window', () => {
  it('lists, restores and deletes the files of the trash', async () => {
    const p = new MemoryProvider('t', 't', { 'notes/a.md': 'old a', 'b.md': 'b' });
    const day1 = new Date(2026, 9, 1).getTime();
    const day2 = new Date(2026, 9, 3).getTime();
    await applyPlan(p, [{ kind: 'trash', path: 'notes/a.md' }], async () => new Uint8Array(), day1);
    await applyPlan(p, [{ kind: 'trash', path: 'b.md' }], async () => new Uint8Array(), day2);
    const items = await listTrash(p);
    expect(items.map((i) => [i.day, i.original])).toEqual([
      ['2026-10-03', 'b.md'],
      ['2026-10-01', 'notes/a.md'],
    ]);

    // Restored where it was; next to it when the name is taken again.
    await p.write('notes/a.md', new Blob(['new a']));
    expect(await restoreFromTrash(p, items[1]!.path)).toBe('notes/a (2).md');
    expect(await text(p, 'notes/a (2).md')).toBe('old a');
    expect(await text(p, 'notes/a.md')).toBe('new a');

    await deleteFromTrash(p, items[0]!.path);
    expect(await listTrash(p)).toEqual([]);
    // Empty days go too.
    expect((await all(p)).filter((x) => x.startsWith('.pwo-trash'))).toEqual([]);
  });

  it('refuses paths outside the trash', async () => {
    const p = new MemoryProvider('t', 't', { 'a.md': 'a' });
    await expect(deleteFromTrash(p, 'a.md')).rejects.toThrow();
    await expect(deleteFromTrash(p, '.pwo-trash/2026-10-01/../../a.md')).rejects.toThrow();
    await expect(restoreFromTrash(p, '.pwo-trash/2026-10-01/../x')).rejects.toThrow();
    expect(await text(p, 'a.md')).toBe('a');
  });
});
