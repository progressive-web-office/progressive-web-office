import { describe, expect, it } from 'vitest';
import { MemoryProvider } from '../src/fs';
import { NoteIndex } from '../src/folder/note-index';
import { applyView, knownColumns, newNoteValues, noteRecords, parseFilter, readViewSpec, valuesOf, writeViewSpec, type ViewSpec } from '../src/folder/note-views';

// NOTE-003: views of the notes — table, cards, board — kept as a file of the folder.

const files: Record<string, string> = {
  'Projects/Engine.md': '---\ntype: "[[Project]]"\nstatus: doing\ndue: 2026-10-20\nlead: "[[Ada Lovelace]]"\ntags: [project]\n---\n- [ ] Draw the mill\n- [x] Order the gears\n',
  'Projects/Loom.md': '---\ntype: "[[Project]]"\nstatus: todo\ndue: 2026-09-30\n---\n#project\n',
  'Projects/Archive.md': '---\ntype: "[[Project]]"\nstatus: done\npriority: 2\n---\n',
  'Projects/Notes.md': '# Free notes\n',
  'People/Ada Lovelace.md': '---\ntype: "[[Person]]"\n---\n',
};

async function records() {
  const index = new NoteIndex(new MemoryProvider('m', 'M', files));
  await index.update(Object.keys(files).map((path) => ({ path, size: files[path]!.length, modified: 1 })));
  return noteRecords(index.tables());
}

describe('NOTE-003 views of the notes', () => {
  it('reads and writes the file of a view', () => {
    const text = 'title: Projects\nfrom: Projects\nwhere:\n  - type = Project\n  - "#project"\ncolumns: [name, status, due]\nsort: [-due]\nlayout: board\ngroup: status\ngroups: [todo, doing, done]\n';
    const spec = readViewSpec(text);
    expect(spec).toEqual({ title: 'Projects', from: 'Projects', where: ['type = Project', '#project'], columns: ['name', 'status', 'due'], sort: ['-due'], layout: 'board', group: 'status', groups: ['todo', 'doing', 'done'] });
    expect(readViewSpec(writeViewSpec(spec))).toEqual(spec);
    expect(readViewSpec('')).toEqual({ where: [], columns: ['name'], sort: [], layout: 'table', groups: [] });
    expect(readViewSpec('layout: spiral').layout).toBe('table');
  });

  it('reads filters: comparisons, presence, tags', () => {
    expect(parseFilter('status = done')).toEqual({ key: 'status', op: '=', value: 'done' });
    expect(parseFilter('due <= today')).toEqual({ key: 'due', op: '<=', value: 'today' });
    expect(parseFilter('last contact != "2026-01-01"')).toEqual({ key: 'last contact', op: '!=', value: '2026-01-01' });
    expect(parseFilter('title contains engine')).toEqual({ key: 'title', op: 'contains', value: 'engine' });
    expect(parseFilter('title !contains draft')).toEqual({ key: 'title', op: '!contains', value: 'draft' });
    expect(parseFilter('has due')).toEqual({ key: 'due', op: 'has', value: '' });
    expect(parseFilter('!has due')).toEqual({ key: 'due', op: '!has', value: '' });
    expect(parseFilter('#project')).toEqual({ key: 'tags', op: '=', value: 'project' });
    expect(parseFilter('!#archive')).toEqual({ key: 'tags', op: '!=', value: 'archive' });
    expect(parseFilter('nonsense')).toBeUndefined();
  });

  it('filters, sorts and groups the notes', async () => {
    const all = await records();
    const spec: ViewSpec = { from: 'Projects', where: ['type = "[[Project]]"', 'status != done'], columns: ['name', 'status', 'due', 'tasks'], sort: ['due'], layout: 'table', groups: [] };
    const { rows, invalid } = applyView(spec, all, '2026-10-05');
    expect(rows.map((r) => r.name)).toEqual(['Loom', 'Engine']);
    expect(invalid).toEqual([]);
    expect(valuesOf(rows[1]!, 'tasks')).toEqual(['1/2']);
    expect(valuesOf(rows[1]!, 'tags')).toEqual(['project']);
    expect(applyView({ ...spec, where: ['due < today'] }, all, '2026-10-05').rows.map((r) => r.name)).toEqual(['Loom']);
    expect(applyView({ ...spec, where: ['#project'] }, all, '2026-10-05').rows.map((r) => r.name)).toEqual(['Loom', 'Engine']);
    // Notes without the value last, whatever the order.
    expect(applyView({ ...spec, where: [], sort: ['-due'] }, all, '2026-10-05').rows.map((r) => r.name)).toEqual(['Engine', 'Loom', 'Archive', 'Notes']);
    expect(applyView({ ...spec, where: ['lead = Ada Lovelace'] }, all, '').rows.map((r) => r.name)).toEqual(['Engine']);
    expect(applyView({ ...spec, where: ['nonsense'] }, all, '').invalid).toEqual(['nonsense']);
    const board = applyView({ ...spec, where: [], group: 'status', groups: ['todo', 'doing', 'done', 'blocked'] }, all, '');
    expect(board.groups.map((g) => [g.value, g.rows.map((r) => r.name)])).toEqual([
      ['todo', ['Loom']],
      ['doing', ['Engine']],
      ['done', ['Archive']],
      ['blocked', []],
      ['', ['Notes']],
    ]);
  });

  it('offers the properties used, and fills the notes made from a view', async () => {
    const columns = knownColumns(await records());
    expect(columns.slice(0, 6)).toEqual(['name', 'path', 'folder', 'modified', 'tags', 'tasks']);
    expect(columns.slice(6, 9)).toEqual(['type', 'status', 'due']);
    const spec = readViewSpec('where:\n  - type = "[[Project]]"\n  - "#project"\n  - due > today\ngroup: status\n');
    expect(newNoteValues(spec, 'todo')).toEqual([
      ['type', '[[Project]]'],
      ['tags', ['project']],
      ['status', 'todo'],
    ]);
  });
});

describe('NOTE-003 the schema of a view', () => {
  it('accepts the views written and the example of the guide', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: Ajv2020 } = await import('ajv/dist/2020');
    const ajv = new Ajv2020({ strict: true });
    const validate = ajv.compile(JSON.parse(readFileSync('schemas/notes-view-1.schema.json', 'utf8')) as object);
    const spec = readViewSpec('title: Projects\nfrom: Projects\nwhere:\n  - type = Project\ncolumns: [name, status]\nsort: [-due]\nlayout: board\ngroup: status\ngroups: [todo, done]\n');
    expect(validate(JSON.parse(JSON.stringify(spec)))).toBe(true);
    expect(validate({ layout: 'spiral' })).toBe(false);
    // The example of the guide reads as it is written.
    const guide = readFileSync('docs/guide/folders.md', 'utf8');
    const example = /```yaml\n(title: Projects[\s\S]*?)```/.exec(guide)![1]!;
    expect(validate(JSON.parse(JSON.stringify(readViewSpec(example))))).toBe(true);
    expect(readViewSpec(example).layout).toBe('board');
  });
});
