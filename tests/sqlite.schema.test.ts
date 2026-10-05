import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { EXAMPLE_MODEL, logicalText, parseModel, toLogical, toSql } from '../src/datamodel/model';
import { modelType, readSchema, SCHEMA_QUERIES, toConceptual } from '../src/sqlite/schema';

// DB-001, DB-005: the structure of a SQLite database, and the model it comes from.

async function database(sql: string) {
  const wasm = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer });
  const db = new SQL.Database();
  db.run(sql);
  const rows = (q: string) => db.exec(q)[0]?.values ?? [];
  return readSchema({ tables: rows(SCHEMA_QUERIES.tables), columns: rows(SCHEMA_QUERIES.columns), foreignKeys: rows(SCHEMA_QUERIES.foreignKeys), unique: rows(SCHEMA_QUERIES.unique) });
}

const roundTrip = async (model: string) => {
  const logical = toLogical(parseModel(model).model);
  const back = parseModel(toConceptual(await database(toSql(logical, 'sqlite'))));
  expect(back.errors).toEqual([]);
  return { before: logicalText(logical).split('\n').sort(), after: logicalText(toLogical(back.model)).split('\n').sort(), text: toConceptual(await database(toSql(logical, 'sqlite'))) };
};

describe('DB-001 the structure of a database', () => {
  it('reads tables, columns, keys, references and unique columns', async () => {
    const tables = await database('CREATE TABLE a (id INTEGER PRIMARY KEY, code TEXT UNIQUE); CREATE TABLE b (x INTEGER NOT NULL REFERENCES a, y VARCHAR(20) DEFAULT \'z\', PRIMARY KEY (x, y)); CREATE VIEW v AS SELECT * FROM a;');
    expect(tables.map((t) => [t.name, t.kind])).toEqual([
      ['a', 'table'],
      ['b', 'table'],
      ['v', 'view'],
    ]);
    const b = tables[1]!;
    expect(b.columns).toEqual([
      { name: 'x', type: 'INTEGER', notNull: true, default: null, pk: 1 },
      { name: 'y', type: 'VARCHAR(20)', notNull: false, default: "'z'", pk: 2 },
    ]);
    expect(b.foreignKeys).toEqual([{ columns: ['x'], table: 'a', to: ['id'] }]);
    expect(tables[0]!.unique).toEqual([['code']]);
  });

  it('turns types of SQL back into types of the model', () => {
    expect(['INTEGER', 'VARCHAR(80)', 'NUMERIC(8,2)', 'DOUBLE PRECISION', 'TIMESTAMP', 'BOOL', 'whatever'].map((t) => modelType(t))).toEqual(['integer', 'varchar(80)', 'decimal(8,2)', 'real', 'datetime', 'boolean', 'whatever']);
  });
});

describe('DB-005 the conceptual model read back', () => {
  it('finds the entities and associations the tables were made from', async () => {
    const { before, after, text } = await roundTrip(EXAMPLE_MODEL);
    expect(after).toEqual(before);
    expect(text).toContain('entity Customer\n  #customer_id: serial\n  name: varchar(80)\n  email: varchar(120)\n');
    expect(text).toContain('association Contains\n  Order 0,n\n  Product 0,n\n  quantity: integer\n');
    expect(text).toContain('association Order_Customer\n  Order 1,1\n  Customer 0,n\n');
  });

  it('keeps optional, one-to-one and reflexive links, and roles', async () => {
    const model = 'entity Employee\n  #id\n  name\n\nentity Car\n  #plate: varchar(10)\n\n' +
      'association Manages\n  Employee 0,1 (report)\n  Employee 0,n (manager)\n\n' +
      'association Drives\n  Employee 0,1\n  Car 1,1\n\n' +
      'association Knows\n  Employee 0,n\n  Employee 0,n\n';
    const { before, after } = await roundTrip(model);
    expect(after).toEqual(before);
  });
});
