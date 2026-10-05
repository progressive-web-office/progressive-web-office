import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { MemoryProvider } from '../src/fs';
import { NoteIndex } from '../src/folder/note-index';
import { loadNoteTables, usesNoteTables } from '../src/code/note-tables';

// NOTE-002: the notes of the folder queried in SQL, by the SQLite of the SQL cells.

const files: Record<string, string> = {
  'People/Ada Lovelace.md': '---\ntitle: Ada Lovelace\ntype: "[[Person]]"\norganization: Analytical Engines\ntags:\n  - person\n  - math\n---\n# Ada\n',
  'People/Charles Babbage.md': '---\ntype: "[[Person]]"\norganization: Analytical Engines\nborn: 1791\nalive: false\n---\n',
  'Projects/Engine.md': '---\ntype: "[[Project]]"\nstatus: active\nlead: "[[Ada Lovelace]]"\n---\n# Engine\n\n- [ ] Draw the mill\n- [x] Order the gears\n\n```md\n- [ ] not a task\n```\n\nSee [[Charles Babbage]] and [[Nobody]]. #engine\n',
};

async function tables() {
  const index = new NoteIndex(new MemoryProvider('m', 'M', files));
  await index.update(Object.keys(files).map((path) => ({ path, size: files[path]!.length, modified: Date.UTC(2026, 9, 5, 8) })));
  return index.tables();
}

describe('NOTE-002 the notes as tables of SQL', () => {
  it('makes tables of the notes, their properties, tags, links and tasks', async () => {
    const t = await tables();
    expect(t.notes).toContainEqual(['Projects/Engine.md', 'Engine', 'Projects', files['Projects/Engine.md']!.length, '2026-10-05T08:00:00']);
    expect(t.props.filter((p) => p[0] === 'People/Charles Babbage.md')).toEqual([
      ['People/Charles Babbage.md', 'type', 0, '[[Person]]'],
      ['People/Charles Babbage.md', 'organization', 0, 'Analytical Engines'],
      ['People/Charles Babbage.md', 'born', 0, 1791],
      ['People/Charles Babbage.md', 'alive', 0, 0],
    ]);
    expect(t.props.filter((p) => p[1] === 'tags')).toEqual([
      ['People/Ada Lovelace.md', 'tags', 0, 'person'],
      ['People/Ada Lovelace.md', 'tags', 1, 'math'],
    ]);
    // Resolved to the notes they point to; the others by the name written.
    expect(t.links.filter((l) => l[0] === 'Projects/Engine.md')).toEqual([
      ['Projects/Engine.md', 'Project', 0],
      ['Projects/Engine.md', 'People/Ada Lovelace.md', 1],
      ['Projects/Engine.md', 'People/Charles Babbage.md', 1],
      ['Projects/Engine.md', 'Nobody', 0],
    ]);
    expect(t.tasks).toEqual([
      ['Projects/Engine.md', 8, 'Draw the mill', 0],
      ['Projects/Engine.md', 9, 'Order the gears', 1],
    ]);
    expect(t.tags).toContainEqual(['Projects/Engine.md', 'engine']);
  });

  it('answers queries in SQL, with prop(path, key)', async () => {
    const wasm = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm');
    const SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer });
    const db = new SQL.Database();
    db.run('CREATE TABLE notes (x)'); // a table of the user's: hidden while the notes are queried
    const t = await tables();
    loadNoteTables(db as never, t);
    const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];
    expect(rows("SELECT name, prop(path, 'organization') FROM notes WHERE prop(path, 'type') = '[[Person]]' ORDER BY name")).toEqual([
      ['Ada Lovelace', 'Analytical Engines'],
      ['Charles Babbage', 'Analytical Engines'],
    ]);
    expect(rows("SELECT n.name, count(*) FROM notes n JOIN tasks k ON k.path = n.path WHERE NOT k.done GROUP BY n.name")).toEqual([['Engine', 1]]);
    expect(rows("SELECT source FROM links WHERE target = 'People/Charles Babbage.md'")).toEqual([['Projects/Engine.md']]);
    expect(rows("SELECT path FROM props WHERE key = 'born' AND value > 1700")).toEqual([['People/Charles Babbage.md']]);
    // Made again for the next query: the same rows, not twice as many.
    loadNoteTables(db as never, t);
    expect(rows('SELECT count(*) FROM notes')).toEqual([[3]]);
    db.run('DROP TABLE temp.notes');
    expect(rows('SELECT count(*) FROM notes')).toEqual([[0]]);
  });

  it('makes the tables only for queries naming them', () => {
    expect(usesNoteTables("SELECT name FROM notes")).toBe(true);
    expect(usesNoteTables("SELECT prop(path, 'x') FROM t")).toBe(true);
    expect(usesNoteTables('SELECT 1 + 1 -- the notes')).toBe(false);
    expect(usesNoteTables('CREATE TABLE cities (name)')).toBe(false);
  });
});
