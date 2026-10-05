/**
 * DB-001, DB-005: the structure of a SQLite database — its tables, their
 * columns, keys and references — read with SQL (in the sandbox), and the
 * conceptual model it comes from, read back by the usual rules taken the
 * other way: a table whose key is made of references to other tables is an
 * association between them; another table is an entity, each of its
 * references an association with a side `x,1`.
 */

/** The queries reading the structure; their rows go to `readSchema`. */
export const SCHEMA_QUERIES = {
  tables: "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
  columns: "SELECT m.name, p.cid, p.name, p.type, p.\"notnull\", p.dflt_value, p.pk FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type IN ('table', 'view') AND m.name NOT LIKE 'sqlite_%' ORDER BY m.name, p.cid",
  foreignKeys: "SELECT m.name, f.id, f.seq, f.\"table\", f.\"from\", f.\"to\" FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' ORDER BY m.name, f.id, f.seq",
  unique: "SELECT m.name, i.name, c.name FROM sqlite_master m JOIN pragma_index_list(m.name) i JOIN pragma_index_info(i.name) c WHERE m.type = 'table' AND i.\"unique\" AND i.origin <> 'pk' AND m.name NOT LIKE 'sqlite_%' ORDER BY m.name, i.name, c.seqno",
} as const;

export interface TableColumn {
  name: string;
  type: string;
  notNull: boolean;
  default: string | null;
  /** Its place in the primary key, from 1 (0: not in it). */
  pk: number;
}

export interface TableInfo {
  name: string;
  kind: 'table' | 'view';
  sql: string;
  columns: TableColumn[];
  foreignKeys: { columns: string[]; table: string; to: string[] }[];
  /** Sets of columns whose values cannot repeat (besides the primary key). */
  unique: string[][];
}

type Rows = unknown[][];

/** The tables of a database, from the rows of `SCHEMA_QUERIES`. */
export function readSchema(rows: { tables: Rows; columns: Rows; foreignKeys: Rows; unique: Rows }): TableInfo[] {
  const tables = new Map<string, TableInfo>();
  for (const [name, type, sql] of rows.tables) tables.set(String(name), { name: String(name), kind: type === 'view' ? 'view' : 'table', sql: String(sql ?? ''), columns: [], foreignKeys: [], unique: [] });
  for (const [table, , name, type, notNull, dflt, pk] of rows.columns) tables.get(String(table))?.columns.push({ name: String(name), type: String(type ?? ''), notNull: !!Number(notNull), default: dflt === null || dflt === undefined ? null : String(dflt), pk: Number(pk) });
  const fks = new Map<string, { columns: string[]; table: string; to: string[] }>();
  for (const [table, id, , target, from, to] of rows.foreignKeys) {
    const key = `${String(table)}\n${String(id)}`;
    let fk = fks.get(key);
    if (!fk) {
      fk = { columns: [], table: String(target), to: [] };
      fks.set(key, fk);
      tables.get(String(table))?.foreignKeys.push(fk);
    }
    fk.columns.push(String(from));
    // A reference without columns named goes to the primary key.
    if (to !== null && to !== undefined) fk.to.push(String(to));
  }
  const unique = new Map<string, string[]>();
  for (const [table, index, column] of rows.unique) {
    const key = `${String(table)}\n${String(index)}`;
    if (!unique.has(key)) {
      const set: string[] = [];
      unique.set(key, set);
      tables.get(String(table))?.unique.push(set);
    }
    unique.get(key)!.push(String(column));
  }
  // References to the primary key, its columns named; in the order of their columns (SQLite lists them the other way).
  for (const t of tables.values()) {
    const at = (c: string): number => t.columns.findIndex((x) => x.name === c);
    t.foreignKeys.sort((x, y) => at(x.columns[0]!) - at(y.columns[0]!));
    for (const fk of t.foreignKeys) {
      if (fk.to.length) continue;
      const target = tables.get(fk.table);
      fk.to = target ? target.columns.filter((c) => c.pk).sort((a, b) => a.pk - b.pk).map((c) => c.name) : [];
    }
  }
  return [...tables.values()];
}

/** A type of SQLite as a type of the model. */
export function modelType(type: string, counter = false): string {
  if (counter) return 'serial';
  const t = type.trim().toLowerCase();
  const args = /\(([^)]*)\)/.exec(t)?.[1]?.replace(/\s+/g, '');
  const base = t.replace(/\(.*$/, '').trim();
  if (/^(int|integer|bigint|smallint|tinyint|mediumint)$/.test(base)) return 'integer';
  if (/^(real|float|double|double precision)$/.test(base)) return 'real';
  if (/^(numeric|decimal)$/.test(base)) return args ? `decimal(${args})` : 'decimal';
  if (/^(varchar|character varying|nvarchar)$/.test(base)) return args ? `varchar(${args})` : 'varchar';
  if (/^(char|character|nchar)$/.test(base)) return args ? `char(${args})` : 'char';
  if (/^(datetime|timestamp)$/.test(base)) return 'datetime';
  if (/^(date|time|boolean|blob|text)$/.test(base)) return base;
  if (base === 'bool') return 'boolean';
  return base || 'text';
}

const word = (name: string): string => (/^[\p{L}\p{N}_]+$/u.test(name) ? name : name.replace(/[^\p{L}\p{N}_]+/gu, '_'));

/**
 * DB-005: the conceptual model (the text of a `.mcd` file) a database comes
 * from, read back from its tables.
 */
export function toConceptual(tables: TableInfo[]): string {
  const real = tables.filter((t) => t.kind === 'table');
  const byName = new Map(real.map((t) => [t.name, t]));
  // A table whose primary key is made of its references to two tables or more: an association.
  const isAssociation = (t: TableInfo): boolean => {
    const pk = t.columns.filter((c) => c.pk).map((c) => c.name);
    if (t.foreignKeys.length < 2 || !pk.length) return false;
    const inFk = new Set(t.foreignKeys.flatMap((f) => f.columns));
    return pk.every((c) => inFk.has(c)) && t.foreignKeys.every((f) => f.columns.every((c) => pk.includes(c)) && byName.has(f.table));
  };
  const entities = real.filter((t) => !isAssociation(t));
  const associations = real.filter(isAssociation);
  const out: string[] = ['-- Read back from the tables of a database.'];
  const counter = (t: TableInfo, c: TableColumn): boolean => c.pk === 1 && t.columns.filter((x) => x.pk).length === 1 && /^integer$/i.test(c.type.trim()) && /autoincrement/i.test(t.sql);
  const links: string[] = [];
  const names = new Set<string>([...entities, ...associations].map((t) => t.name.toLowerCase()));
  const freeName = (base: string): string => {
    let name = word(base);
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${word(base)}_${i}`;
    names.add(name.toLowerCase());
    return name;
  };
  for (const t of entities) {
    const fkCols = new Set(t.foreignKeys.filter((f) => byName.has(f.table)).flatMap((f) => f.columns));
    out.push('', `entity ${word(t.name)}`);
    for (const c of t.columns) {
      if (fkCols.has(c.name) && !c.pk) continue;
      out.push(`  ${c.pk ? '#' : ''}${word(c.name)}: ${modelType(c.type, counter(t, c))}`);
    }
    for (const fk of t.foreignKeys) {
      const target = byName.get(fk.table);
      if (!target) continue;
      // Part of the identifier (an entity identified by another): kept as it is, the link told.
      if (fk.columns.some((c) => t.columns.find((x) => x.name === c)?.pk)) {
        out.push(`  -- ${fk.columns.join(', ')} refers to ${fk.table}`);
        continue;
      }
      const notNull = fk.columns.every((c) => t.columns.find((x) => x.name === c)?.notNull);
      const unique = t.unique.some((u) => u.length === fk.columns.length && u.every((c) => fk.columns.includes(c)));
      // The role of the referred side, when the column says more than the key it copies.
      const col = fk.columns[0]!;
      const to = fk.to[0] ?? col;
      const role = fk.columns.length === 1 && col !== to ? (col.startsWith(`${to}_`) ? col.slice(to.length + 1) : col) : undefined;
      const reflexive = target === t;
      links.push(
        '',
        `association ${freeName(`${t.name}_${fk.table}`)}`,
        `  ${word(t.name)} ${notNull ? '1,1' : '0,1'}`,
        `  ${word(target.name)} ${unique ? '0,1' : '0,n'}${role || reflexive ? ` (${word(role ?? 'ref')})` : ''}`,
      );
    }
  }
  for (const t of associations) {
    const fkCols = new Set(t.foreignKeys.flatMap((f) => f.columns));
    out.push('', `association ${word(t.name)}`);
    const counts = new Map<string, number>();
    for (const f of t.foreignKeys) counts.set(f.table, (counts.get(f.table) ?? 0) + 1);
    for (const f of t.foreignKeys) {
      const col = f.columns[0]!;
      const to = f.to[0] ?? col;
      const role = (counts.get(f.table) ?? 0) > 1 || (f.columns.length === 1 && col !== to) ? (col.startsWith(`${to}_`) ? col.slice(to.length + 1) : col) : undefined;
      out.push(`  ${word(f.table)} 0,n${role ? ` (${word(role)})` : ''}`);
    }
    for (const c of t.columns) if (!fkCols.has(c.name)) out.push(`  ${word(c.name)}: ${modelType(c.type)}`);
  }
  return `${[...out, ...links].join('\n')}\n`;
}

/** A name of SQLite, quoted. */
export const ident = (name: string): string => `"${name.replace(/"/g, '""')}"`;
