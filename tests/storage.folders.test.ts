import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { forgetFolder, lastFolder, MAX_FOLDERS, recentFolders, rememberFolder } from '../src/storage/recent';

/** Directory handles as stored (a structured clone keeps no methods: the same folder is recognised by its name). */
const dir = (name: string) => ({ kind: 'directory', name }) as unknown as FileSystemDirectoryHandle;
const tick = () => new Promise((r) => setTimeout(r, 2));

describe('FOLDER-015 recent folders', () => {
  it('keeps the folders opened last, most recent first, without duplicates', async () => {
    for (const f of await recentFolders()) await forgetFolder(f.id);
    await rememberFolder(dir('thesis'));
    await tick();
    await rememberFolder(dir('course'));
    await tick();
    await rememberFolder(dir('thesis'));
    expect((await recentFolders()).map((f) => f.name)).toEqual(['thesis', 'course']);
    expect((await lastFolder())?.name).toBe('thesis');
  });

  it(`keeps at most ${MAX_FOLDERS}, and forgets one on request`, async () => {
    for (let i = 0; i < MAX_FOLDERS + 2; i++) {
      await rememberFolder(dir(`f${i}`));
      await tick();
    }
    const list = await recentFolders();
    expect(list).toHaveLength(MAX_FOLDERS);
    expect(list[0]!.name).toBe(`f${MAX_FOLDERS + 1}`);
    await forgetFolder(list[0]!.id);
    expect((await recentFolders()).map((f) => f.name)).not.toContain(`f${MAX_FOLDERS + 1}`);
  });
});
