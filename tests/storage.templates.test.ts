import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deleteTemplate, listTemplates, loadTemplate, saveTemplate } from '../src/storage/recent';

describe('FILE-019 user templates in the browser', () => {
  it('saves, lists, loads and deletes templates', async () => {
    const id = await saveTemplate('Weekly report', 'odt', new Uint8Array([1, 2, 3]));
    await saveTemplate('Budget 2027', 'xlsx', new Uint8Array([4]));
    const list = await listTemplates();
    expect(list.map((t) => t.name).sort()).toEqual(['Budget 2027', 'Weekly report']);
    expect(list.find((t) => t.id === id)).toMatchObject({ format: 'odt', size: 3 });
    expect(Array.from((await loadTemplate(id))!)).toEqual([1, 2, 3]);
    await deleteTemplate(id);
    expect((await listTemplates()).map((t) => t.name)).toEqual(['Budget 2027']);
    expect(await loadTemplate(id)).toBeUndefined();
  });

  it('replaces a template saved again under the same name and format', async () => {
    await saveTemplate('Letter', 'odt', new Uint8Array([1]));
    await saveTemplate('Letter', 'odt', new Uint8Array([2, 2]));
    const letters = (await listTemplates()).filter((t) => t.name === 'Letter');
    expect(letters).toHaveLength(1);
    expect(Array.from((await loadTemplate(letters[0]!.id))!)).toEqual([2, 2]);
  });
});
