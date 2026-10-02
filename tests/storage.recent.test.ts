import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addRecent, clearRecent, getRecent, listRecent, removeRecent, MAX_RECENT, saveDraft, loadDraft, clearDraft } from '../src/storage/recent';

beforeEach(async () => {
  await clearRecent();
  await clearDraft();
});

const file = (name: string, text = 'x') => new File([text], name);

describe('FILE-008 recent files', () => {
  it('stores files with metadata, most recent first', async () => {
    await addRecent(file('a.docx', 'aaa'), 'docx');
    await new Promise((r) => setTimeout(r, 2));
    await addRecent(file('b.xlsx', 'bb'), 'xlsx');
    const list = await listRecent();
    expect(list.map((e) => e.name)).toEqual(['b.xlsx', 'a.docx']);
    expect(list[1]).toMatchObject({ format: 'docx', size: 3 });
    const back = await getRecent(list[1]!.id);
    expect(await back!.text()).toBe('aaa');
  });

  it('re-opening the same file updates it instead of duplicating', async () => {
    await addRecent(file('a.docx', '1'), 'docx');
    await addRecent(file('a.docx', '22'), 'docx');
    const list = await listRecent();
    expect(list).toHaveLength(1);
    expect(list[0]!.size).toBe(2);
  });

  it(`keeps at most ${MAX_RECENT} entries`, async () => {
    for (let i = 0; i < MAX_RECENT + 3; i++) await addRecent(file(`f${i}.md`), 'md');
    expect(await listRecent()).toHaveLength(MAX_RECENT);
  });

  it('FILE-009 removing an entry deletes its content', async () => {
    await addRecent(file('a.md'), 'md');
    const [entry] = await listRecent();
    await removeRecent(entry!.id);
    expect(await listRecent()).toEqual([]);
    expect(await getRecent(entry!.id)).toBeUndefined();
  });
});

describe('FILE-011 drafts', () => {
  it('saves, loads and clears the autosaved draft', async () => {
    expect(await loadDraft()).toBeUndefined();
    await saveDraft({ name: 'x.docx', format: 'docx', bytes: new Uint8Array([1, 2]) });
    const draft = await loadDraft();
    expect(draft).toMatchObject({ name: 'x.docx', format: 'docx' });
    expect(Array.from(draft!.bytes)).toEqual([1, 2]);
    await clearDraft();
    expect(await loadDraft()).toBeUndefined();
  });
});

describe('FILE-026 a renamed file in the recent files', () => {
  it('keeps its entry under the new name, with the content saved last', async () => {
    const { renameRecent } = await import('../src/storage/recent');
    await addRecent(file('notes.md', 'old'), 'md');
    await addRecent(file('other.md'), 'md');
    expect(await renameRecent('notes.md', 'CR TP 1.md')).toBe(1);
    expect((await listRecent()).map((e) => e.name).sort()).toEqual(['CR TP 1.md', 'other.md']);
    expect(await (await getRecent('CR TP 1.md:md'))!.text()).toBe('old');
    expect(await getRecent('notes.md:md')).toBeUndefined();
    expect(await renameRecent('missing.md', 'x.md')).toBe(0);
  });
});
