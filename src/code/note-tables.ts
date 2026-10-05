/**
 * NOTE-002: the notes of the open folder as tables of the SQL cells — read
 * from the index of the notes (FOLDER-025), the notes themselves staying the
 * only source: the tables are made again before each query that names them,
 * as temporary tables (a table of the user's of the same name is hidden while
 * they last), and changing them changes no note.
 *
 * No imports: the sandbox worker bundles this module.
 */

export interface NoteTables {
  /** path, name, folder, size, modified (ISO date and time). */
  notes: [string, string, string, number | null, string | null][];
  /** path, key, position in a list (0 for a single value), value. */
  props: [string, string, number, string | number | null][];
  /** path, tag (without `#`). */
  tags: [string, string][];
  /** source, target (the path of the note, or the name written when there is none), resolved (1 or 0). */
  links: [string, string, number][];
  /** path, line (from 1), text, done (1 or 0). */
  tasks: [string, number, string, number][];
}

export const NOTE_TABLES_SQL = `
DROP TABLE IF EXISTS temp.notes; DROP TABLE IF EXISTS temp.props; DROP TABLE IF EXISTS temp.tags; DROP TABLE IF EXISTS temp.links; DROP TABLE IF EXISTS temp.tasks;
CREATE TEMP TABLE notes (path TEXT PRIMARY KEY, name TEXT, folder TEXT, size INTEGER, modified TEXT);
CREATE TEMP TABLE props (path TEXT, key TEXT, pos INTEGER, value);
CREATE TEMP TABLE tags (path TEXT, tag TEXT);
CREATE TEMP TABLE links (source TEXT, target TEXT, resolved INTEGER);
CREATE TEMP TABLE tasks (path TEXT, line INTEGER, text TEXT, done INTEGER);
CREATE INDEX temp.props_path ON props (path, key);
`;

/** Whether a query names the tables of the notes (or the function `prop`). */
export const usesNoteTables = (code: string): boolean => /\b(notes|props|tags|links|tasks|prop)\b/i.test(code.replace(/--[^\n]*/g, ''));

/** What the SQL engine (sql.js) offers to fill the tables. */
export interface SqlFill {
  run(sql: string): unknown;
  prepare(sql: string): { run(values: unknown[]): unknown; free(): unknown };
  create_function(name: string, fn: (...args: unknown[]) => unknown): unknown;
}

/**
 * Make the tables of the notes in `db`, and the function `prop(path, key)`:
 * the first value of a property of a note (`prop(path, 'status')`).
 */
export function loadNoteTables(db: SqlFill, tables: NoteTables): void {
  db.run(NOTE_TABLES_SQL);
  db.run('BEGIN');
  try {
    for (const [name, rows] of Object.entries(tables) as [keyof NoteTables, unknown[][]][]) {
      if (!rows.length) continue;
      const stmt = db.prepare(`INSERT INTO temp.${name} VALUES (${rows[0]!.map(() => '?').join(', ')})`);
      try {
        for (const row of rows) stmt.run(row);
      } finally {
        stmt.free();
      }
    }
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
  const first = new Map<string, string | number | null>();
  for (const [path, key, , value] of tables.props) {
    const k = `${path}\n${key.toLowerCase()}`;
    if (!first.has(k)) first.set(k, value);
  }
  db.create_function('prop', (path, key) => first.get(`${String(path)}\n${String(key).toLowerCase()}`) ?? null);
}
