/**
 * DB-002..DB-004: data modelling at its three levels, as taught.
 *
 * - The conceptual model (MCD): entities with their attributes and their
 *   identifier, associations between entities with their cardinalities, kept
 *   as text (a `.mcd` file):
 *
 *   ```
 *   entity Customer
 *     #customer_id: integer
 *     name: varchar(80)
 *
 *   entity Order
 *     #order_id: integer
 *     date: date
 *
 *   association Places
 *     Customer 0,n
 *     Order 1,1
 *   ```
 *
 * - The logical model (MLD), derived by the usual rules: an entity becomes a
 *   relation, its identifier the primary key; an association with a side
 *   `x,1` becomes a foreign key of that side (with the association's
 *   attributes); any other association becomes a relation whose primary key
 *   is made of the identifiers of its entities.
 *
 * - The physical model (MPD): the SQL making the tables, for SQLite,
 *   PostgreSQL or MySQL.
 */

export type Cardinality = '0,1' | '1,1' | '0,n' | '1,n';

export interface Attribute {
  name: string;
  /** As written (`integer`, `varchar(80)`…); empty when not given. */
  type: string;
  identifier: boolean;
  line: number;
}

export interface Entity {
  name: string;
  attributes: Attribute[];
  line: number;
}

export interface Participant {
  entity: string;
  cardinality: Cardinality;
  /** The role of the entity in the association (to tell two links to one entity apart). */
  role?: string;
  line: number;
}

export interface Association {
  name: string;
  participants: Participant[];
  attributes: Attribute[];
  line: number;
}

export interface ConceptualModel {
  entities: Entity[];
  associations: Association[];
}

export interface ModelError {
  line: number;
  /** A key of the messages, with its values (shown in the user's language). */
  code: 'syntax' | 'duplicate' | 'noIdentifier' | 'unknownEntity' | 'fewParticipants' | 'cardinality' | 'outside' | 'empty';
  name?: string;
}

const KIND = /^(entity|entité|entite|association)\s+(.+?)\s*:?\s*$/i;
const CARD = /^(.+?)\s+([01])\s*[,.]?\s*([1nN])\s*(?:\((.+)\))?$/;
const ATTRIBUTE = /^(#)?\s*([^:#]+?)\s*(?::\s*(.+))?$/;

/** Read the text of a conceptual model; what could not be read is told by line. */
export function parseModel(text: string): { model: ConceptualModel; errors: ModelError[] } {
  const model: ConceptualModel = { entities: [], associations: [] };
  const errors: ModelError[] = [];
  let current: Entity | Association | undefined;
  text.split('\n').forEach((raw, i) => {
    const line = i + 1;
    const content = raw.replace(/\s--.*$|^--.*$|\s\/\/.*$|^\/\/.*$/, '').replace(/\s+$/, '');
    if (!content.trim()) return;
    if (!/^\s/.test(content)) {
      const m = KIND.exec(content.trim());
      if (!m) return void errors.push({ line, code: 'syntax' });
      const name = m[2]!.trim();
      const taken = [...model.entities, ...model.associations].some((x) => x.name.toLowerCase() === name.toLowerCase());
      if (taken) errors.push({ line, code: 'duplicate', name });
      if (/^assoc/i.test(m[1]!)) {
        current = { name, participants: [], attributes: [], line };
        model.associations.push(current);
      } else {
        current = { name, attributes: [], line };
        model.entities.push(current);
      }
      return;
    }
    if (!current) return void errors.push({ line, code: 'outside' });
    const body = content.trim();
    if ('participants' in current) {
      const c = CARD.exec(body);
      if (c && !body.includes(':')) {
        const cardinality = `${c[2]},${c[3]!.toLowerCase()}` as Cardinality;
        current.participants.push({ entity: c[1]!.trim(), cardinality, ...(c[4] ? { role: c[4].trim() } : {}), line });
        return;
      }
    }
    const a = ATTRIBUTE.exec(body);
    if (!a) return void errors.push({ line, code: 'syntax' });
    const name = a[2]!.trim();
    if (current.attributes.some((x) => x.name.toLowerCase() === name.toLowerCase())) errors.push({ line, code: 'duplicate', name });
    current.attributes.push({ name, type: (a[3] ?? '').trim(), identifier: !!a[1], line });
  });
  const entities = new Map(model.entities.map((e) => [e.name.toLowerCase(), e]));
  for (const e of model.entities) if (!e.attributes.some((a) => a.identifier)) errors.push({ line: e.line, code: 'noIdentifier', name: e.name });
  for (const a of model.associations) {
    if (a.participants.length < 2) errors.push({ line: a.line, code: 'fewParticipants', name: a.name });
    for (const p of a.participants) {
      const e = entities.get(p.entity.toLowerCase());
      if (!e) errors.push({ line: p.line, code: 'unknownEntity', name: p.entity });
      else p.entity = e.name;
    }
  }
  if (!model.entities.length && !errors.length) errors.push({ line: 1, code: 'empty' });
  return { model, errors: errors.sort((a, b) => a.line - b.line) };
}

// --- the logical model ---------------------------------------------------------

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primary: boolean;
  /** The relation and column it refers to. */
  references?: { relation: string; column: string };
}

export interface Relation {
  name: string;
  columns: Column[];
  primaryKey: string[];
  foreignKeys: { columns: string[]; relation: string; refColumns: string[] }[];
  /** Columns whose values cannot repeat (a one-to-one link). */
  unique: string[][];
  /** What it comes from in the conceptual model. */
  from: { kind: 'entity' | 'association'; name: string };
}

export interface LogicalModel {
  relations: Relation[];
}

const isOne = (c: Cardinality): boolean => c.endsWith(',1');

/** A name of SQL: letters, digits and `_`, without accents. */
export function sqlName(name: string): string {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return /^\d/.test(s) ? `_${s}` : s || '_';
}

/** A part of a name (`_2` after a name, not `__2`). */
const suffix = (s: string): string => sqlName(s).replace(/^_(?=\d)/, '');

/** A column name not yet taken in a relation. */
function free(taken: Column[], name: string, by: string): string {
  const has = (n: string): boolean => taken.some((c) => c.name.toLowerCase() === n.toLowerCase());
  if (!has(name)) return name;
  let candidate = `${name}_${suffix(by)}`;
  for (let i = 2; has(candidate); i++) candidate = `${name}_${suffix(by)}_${i}`;
  return candidate;
}

/** The type a key keeps when it is copied as a foreign key (a counter is a plain integer there). */
const keyType = (type: string): string => (/^(serial|counter|auto_?increment|autoincrement)$/i.test(type.trim()) ? 'integer' : type);

/** The logical model of a conceptual one (read without errors). */
export function toLogical(model: ConceptualModel): LogicalModel {
  const relations = new Map<string, Relation>();
  for (const e of model.entities) {
    const columns: Column[] = e.attributes.map((a) => ({ name: sqlName(a.name), type: a.type || (a.identifier ? 'integer' : 'text'), nullable: !a.identifier, primary: a.identifier }));
    relations.set(e.name, { name: sqlName(e.name), columns, primaryKey: columns.filter((c) => c.primary).map((c) => c.name), foreignKeys: [], unique: [], from: { kind: 'entity', name: e.name } });
  }
  /** Copy the key of `target` into `into`, as a foreign key. */
  const copyKey = (into: Relation, target: Relation, opts: { nullable: boolean; primary: boolean; role?: string; via: string }): string[] => {
    const names: string[] = [];
    for (const pk of target.primaryKey) {
      const col = target.columns.find((c) => c.name === pk)!;
      const base = opts.role ? `${pk}_${suffix(opts.role)}` : pk;
      const name = free(into.columns, base, opts.role ?? opts.via);
      into.columns.push({ name, type: keyType(col.type), nullable: opts.nullable, primary: opts.primary, references: { relation: target.name, column: pk } });
      names.push(name);
    }
    into.foreignKeys.push({ columns: names, relation: target.name, refColumns: [...target.primaryKey] });
    return names;
  };
  for (const a of model.associations) {
    const parts = a.participants.filter((p) => relations.has(p.entity));
    if (parts.length < 2) continue;
    // A side x,1 (a binary association): the entity of that side refers to the other.
    const one = parts.length === 2 ? [...parts].sort((x, y) => Number(y.cardinality === '1,1') - Number(x.cardinality === '1,1')).find((p) => isOne(p.cardinality)) : undefined;
    if (one) {
      const other = parts.find((p) => p !== one)!;
      const into = relations.get(one.entity)!;
      const target = relations.get(other.entity)!;
      const reflexive = one.entity === other.entity;
      const cols = copyKey(into, target, { nullable: one.cardinality === '0,1', primary: false, role: reflexive ? (other.role ?? a.name) : other.role, via: a.name });
      // One to one: the foreign key cannot repeat.
      if (isOne(other.cardinality)) into.unique.push(cols);
      for (const attr of a.attributes) into.columns.push({ name: free(into.columns, sqlName(attr.name), a.name), type: attr.type || 'text', nullable: true, primary: false });
      continue;
    }
    // Otherwise: a relation of its own, its key made of the keys of its entities.
    const rel: Relation = { name: sqlName(a.name), columns: [], primaryKey: [], foreignKeys: [], unique: [], from: { kind: 'association', name: a.name } };
    const seen = new Map<string, number>();
    for (const p of parts) {
      const n = (seen.get(p.entity) ?? 0) + 1;
      seen.set(p.entity, n);
      const twice = parts.filter((x) => x.entity === p.entity).length > 1;
      const role = p.role ?? (twice ? String(n) : undefined);
      rel.primaryKey.push(...copyKey(rel, relations.get(p.entity)!, { nullable: false, primary: true, ...(role ? { role } : {}), via: a.name }));
    }
    for (const attr of a.attributes) rel.columns.push({ name: free(rel.columns, sqlName(attr.name), a.name), type: attr.type || 'text', nullable: true, primary: false });
    relations.set(`assoc:${a.name}`, rel);
  }
  return { relations: [...relations.values()] };
}

/** The logical model in the usual notation: `Order (order_id, date, #customer_id)`, the key underlined by `_…_`. */
export function logicalText(model: LogicalModel): string {
  return model.relations
    .map((r) => `${r.name} (${r.columns.map((c) => `${c.references ? '#' : ''}${c.primary ? `_${c.name}_` : c.name}`).join(', ')})`)
    .join('\n');
}

// --- the physical model -----------------------------------------------------------

export type Dialect = 'sqlite' | 'postgresql' | 'mysql';
export const DIALECTS: Dialect[] = ['sqlite', 'postgresql', 'mysql'];

/** A type of the model as a type of the database. */
export function sqlType(type: string, dialect: Dialect, inKey = false): string {
  const t = type.trim().toLowerCase();
  const args = /\(([^)]*)\)/.exec(t)?.[1]?.replace(/\s+/g, '');
  const base = t.replace(/\(.*$/, '').trim();
  const sized = (name: string, fallback?: string): string => (args ? `${name}(${args})` : fallback ?? name);
  switch (base) {
    case 'int':
    case 'integer':
    case 'entier':
      return dialect === 'mysql' ? 'INT' : 'INTEGER';
    case 'bigint':
      return dialect === 'sqlite' ? 'INTEGER' : 'BIGINT';
    case 'smallint':
      return dialect === 'sqlite' ? 'INTEGER' : 'SMALLINT';
    case 'serial':
    case 'counter':
    case 'compteur':
    case 'autoincrement':
    case 'auto_increment':
      return dialect === 'mysql' ? 'INT AUTO_INCREMENT' : dialect === 'postgresql' ? 'INTEGER GENERATED ALWAYS AS IDENTITY' : 'INTEGER';
    case 'real':
    case 'float':
    case 'double':
    case 'réel':
    case 'reel':
      return dialect === 'sqlite' ? 'REAL' : dialect === 'mysql' ? 'DOUBLE' : 'DOUBLE PRECISION';
    case 'decimal':
    case 'numeric':
    case 'money':
    case 'décimal':
      return dialect === 'sqlite' ? sized('NUMERIC') : sized(dialect === 'mysql' ? 'DECIMAL' : 'NUMERIC', dialect === 'mysql' ? 'DECIMAL(10,2)' : 'NUMERIC');
    case 'varchar':
    case 'string':
    case 'chaîne':
    case 'chaine':
      return sized('VARCHAR', dialect === 'mysql' ? 'VARCHAR(255)' : dialect === 'sqlite' ? 'TEXT' : 'VARCHAR');
    case 'char':
      return sized('CHAR', 'CHAR(1)');
    case 'date':
      return 'DATE';
    case 'time':
    case 'heure':
      return 'TIME';
    case 'datetime':
    case 'timestamp':
      return dialect === 'mysql' ? 'DATETIME' : dialect === 'postgresql' ? 'TIMESTAMP' : 'DATETIME';
    case 'bool':
    case 'boolean':
    case 'booléen':
    case 'booleen':
      return dialect === 'sqlite' ? 'INTEGER' : 'BOOLEAN';
    case 'blob':
    case 'binary':
      return dialect === 'postgresql' ? 'BYTEA' : 'BLOB';
    case 'text':
    case 'texte':
    case '':
      // MySQL cannot index TEXT without a length.
      return dialect === 'mysql' && inKey ? 'VARCHAR(255)' : 'TEXT';
    default:
      return type.trim().toUpperCase();
  }
}

const quote = (name: string, dialect: Dialect): string => (dialect === 'mysql' ? `\`${name}\`` : `"${name}"`);

/** The relations in an order where each comes after those it refers to (cycles kept as they come). */
function ordered(relations: Relation[]): Relation[] {
  const out: Relation[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const byName = new Map(relations.map((r) => [r.name, r]));
  const visit = (r: Relation): void => {
    if (state.get(r.name)) return;
    state.set(r.name, 'visiting');
    for (const fk of r.foreignKeys) {
      const target = byName.get(fk.relation);
      if (target && target !== r) visit(target);
    }
    state.set(r.name, 'done');
    out.push(r);
  };
  relations.forEach(visit);
  return out;
}

/** The SQL making the tables of a logical model. */
export function toSql(model: LogicalModel, dialect: Dialect): string {
  const q = (n: string): string => quote(n, dialect);
  const tables = ordered(model.relations).map((r) => {
    const inKey = new Set([...r.primaryKey, ...r.foreignKeys.flatMap((f) => f.columns), ...r.unique.flat()]);
    const counter = (c: Column): boolean => /^(serial|counter|compteur|auto_?increment|autoincrement)$/i.test(c.type.trim());
    // SQLite: a counter is a lone integer primary key.
    const sqliteRowid = dialect === 'sqlite' && r.primaryKey.length === 1 && counter(r.columns.find((c) => c.name === r.primaryKey[0])!);
    const lines = r.columns.map((c) => {
      if (sqliteRowid && c.name === r.primaryKey[0]) return `  ${q(c.name)} INTEGER PRIMARY KEY AUTOINCREMENT`;
      return `  ${q(c.name)} ${sqlType(c.type, dialect, inKey.has(c.name))}${c.nullable ? '' : ' NOT NULL'}`;
    });
    if (!sqliteRowid && r.primaryKey.length) lines.push(`  PRIMARY KEY (${r.primaryKey.map(q).join(', ')})`);
    for (const u of r.unique) lines.push(`  UNIQUE (${u.map(q).join(', ')})`);
    for (const fk of r.foreignKeys) lines.push(`  FOREIGN KEY (${fk.columns.map(q).join(', ')}) REFERENCES ${q(fk.relation)} (${fk.refColumns.map(q).join(', ')})`);
    return `CREATE TABLE ${q(r.name)} (\n${lines.join(',\n')}\n)${dialect === 'mysql' ? ' ENGINE=InnoDB' : ''};`;
  });
  const head = dialect === 'sqlite' ? 'PRAGMA foreign_keys = ON;\n\n' : '';
  return `${head}${tables.join('\n\n')}\n`;
}

/** An example model: customers, orders and products. */
export const EXAMPLE_MODEL = `-- Customers, their orders and the products ordered.
entity Customer
  #customer_id: serial
  name: varchar(80)
  email: varchar(120)

entity Order
  #order_id: serial
  date: date

entity Product
  #product_id: serial
  label: varchar(80)
  price: decimal(8,2)

association Places
  Customer 0,n
  Order 1,1

association Contains
  Order 1,n
  Product 0,n
  quantity: integer
`;
