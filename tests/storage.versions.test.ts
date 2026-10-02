import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deleteVersion, listVersions, loadVersion, MAX_VERSIONS, saveVersion } from '../src/storage/recent';

describe('FILE-025 local version history', () => {
  it('keeps versions per document, newest first, without duplicates', async () => {
    expect(await saveVersion('report.odt', 'report.odt', 'odt', new Uint8Array([1]))).toBe(true);
    expect(await saveVersion('report.odt', 'report.odt', 'odt', new Uint8Array([1]))).toBe(false);
    expect(await saveVersion('report.odt', 'report.odt', 'odt', new Uint8Array([1, 2]), 'Sent to Ann')).toBe(true);
    await saveVersion('other.md', 'other.md', 'md', new Uint8Array([9]));
    const list = await listVersions('report.odt');
    expect(list.map((v) => [v.size, v.label])).toEqual([
      [2, 'Sent to Ann'],
      [1, undefined],
    ]);
    expect(Array.from((await loadVersion(list[1]!.id))!)).toEqual([1]);
    await deleteVersion(list[0]!.id);
    expect(await listVersions('report.odt')).toHaveLength(1);
  });

  it('keeps the last versions only', async () => {
    for (let i = 0; i < MAX_VERSIONS + 5; i++) await saveVersion('long.md', 'long.md', 'md', new Uint8Array([i]));
    const list = await listVersions('long.md');
    expect(list).toHaveLength(MAX_VERSIONS);
    expect(list[0]!.size).toBe(1);
    expect(Array.from((await loadVersion(list[0]!.id))!)).toEqual([MAX_VERSIONS + 4]);
  });
});
