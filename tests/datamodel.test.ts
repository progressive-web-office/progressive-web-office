import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { EXAMPLE_MODEL, logicalText, parseModel, sqlName, sqlType, toLogical, toSql } from '../src/datamodel/model';

// DB-002..DB-004: the conceptual model, the logical model derived, the SQL of the tables.

const logical = (text: string) => {
  const { model, errors } = parseModel(text);
  expect(errors).toEqual([]);
  return toLogical(model);
};

describe('DB-002 the conceptual model', () => {
  it('reads entities, identifiers, associations and cardinalities', () => {
    const { model, errors } = parseModel(EXAMPLE_MODEL);
    expect(errors).toEqual([]);
    expect(model.entities.map((e) => [e.name, e.attributes.filter((a) => a.identifier).map((a) => a.name)])).toEqual([
      ['Customer', ['customer_id']],
      ['Order', ['order_id']],
      ['Product', ['product_id']],
    ]);
    expect(model.associations[1]).toMatchObject({ name: 'Contains', participants: [{ entity: 'Order', cardinality: '1,n' }, { entity: 'Product', cardinality: '0,n' }], attributes: [{ name: 'quantity', type: 'integer' }] });
  });

  it('accepts the French words and the short cardinalities, and tells the errors by line', () => {
    const { model, errors } = parseModel('entité Élève\n  #num\n  nom\n\nassociation Suivre\n  élève 0N (inscrit)\n  Cours 11\n\nCours\n');
    expect(model.associations[0]!.participants).toEqual([
      { entity: 'Élève', cardinality: '0,n', role: 'inscrit', line: 6 },
      { entity: 'Cours', cardinality: '1,1', line: 7 },
    ]);
    expect(errors).toEqual([
      { line: 7, code: 'unknownEntity', name: 'Cours' },
      { line: 9, code: 'syntax' },
    ]);
    expect(parseModel('entity A\n  name\nentity A\n  #id\n').errors).toEqual([
      { line: 1, code: 'noIdentifier', name: 'A' },
      { line: 3, code: 'duplicate', name: 'A' },
    ]);
    expect(parseModel('  #id\n').errors).toEqual([{ line: 1, code: 'outside' }]);
    expect(parseModel('-- nothing yet\n').errors).toEqual([{ line: 1, code: 'empty' }]);
  });
});

describe('DB-003 the logical model', () => {
  it('derives relations by the usual rules', () => {
    expect(logicalText(logical(EXAMPLE_MODEL))).toBe(
      ['Customer (_customer_id_, name, email)', 'Order (_order_id_, date, #customer_id)', 'Product (_product_id_, label, price)', 'Contains (#_order_id_, #_product_id_, quantity)'].join('\n'),
    );
    const order = logical(EXAMPLE_MODEL).relations[1]!;
    expect(order.columns.find((c) => c.name === 'customer_id')).toEqual({ name: 'customer_id', type: 'integer', nullable: false, primary: false, references: { relation: 'Customer', column: 'customer_id' } });
  });

  it('makes a 0,1 link nullable, a one-to-one link unique, and tells roles apart', () => {
    const m = logical(
      'entity Employee\n  #id\n  name\n\nentity Car\n  #plate: varchar(10)\n\n' +
        'association Manages\n  Employee 0,1 (report)\n  Employee 0,n (manager)\n\n' +
        'association Drives\n  Employee 0,1\n  Car 1,1\n  since: date\n\n' +
        'association Knows\n  Employee 0,n\n  Employee 0,n\n',
    );
    expect(logicalText(m)).toBe(['Employee (_id_, name, #id_manager)', 'Car (_plate_, #id, since)', 'Knows (#_id_1_, #_id_2_)'].join('\n'));
    expect(m.relations[0]!.columns[2]!.nullable).toBe(true);
    expect(m.relations[1]!.unique).toEqual([['id']]);
    expect(m.relations[1]!.columns[1]!.nullable).toBe(false);
  });

  it('keeps the names of SQL simple', () => {
    expect(sqlName('Élève inscrit')).toBe('Eleve_inscrit');
    expect(sqlName('2nd')).toBe('_2nd');
  });
});

describe('DB-004 the physical model', () => {
  it('writes the types of each database', () => {
    expect(['integer', 'serial', 'varchar(80)', 'decimal(8,2)', 'boolean', 'datetime', 'text'].map((t) => sqlType(t, 'postgresql'))).toEqual(['INTEGER', 'INTEGER GENERATED ALWAYS AS IDENTITY', 'VARCHAR(80)', 'NUMERIC(8,2)', 'BOOLEAN', 'TIMESTAMP', 'TEXT']);
    expect(['integer', 'serial', 'varchar(80)', 'decimal', 'boolean', 'datetime'].map((t) => sqlType(t, 'mysql'))).toEqual(['INT', 'INT AUTO_INCREMENT', 'VARCHAR(80)', 'DECIMAL(10,2)', 'BOOLEAN', 'DATETIME']);
    expect(sqlType('text', 'mysql', true)).toBe('VARCHAR(255)');
    expect(sqlType('boolean', 'sqlite')).toBe('INTEGER');
  });

  it('makes tables in an order where each follows those it refers to', () => {
    const sql = toSql(logical(EXAMPLE_MODEL), 'postgresql');
    expect(sql).toContain('CREATE TABLE "Order" (\n  "order_id" INTEGER GENERATED ALWAYS AS IDENTITY NOT NULL,\n  "date" DATE,\n  "customer_id" INTEGER NOT NULL,\n  PRIMARY KEY ("order_id"),\n  FOREIGN KEY ("customer_id") REFERENCES "Customer" ("customer_id")\n);');
    expect(sql.indexOf('"Customer" (')).toBeLessThan(sql.indexOf('CREATE TABLE "Order"'));
    expect(sql.indexOf('CREATE TABLE "Order"')).toBeLessThan(sql.indexOf('CREATE TABLE "Contains"'));
    expect(toSql(logical(EXAMPLE_MODEL), 'mysql')).toContain('CREATE TABLE `Contains` (\n  `order_id` INT NOT NULL,\n  `product_id` INT NOT NULL,\n  `quantity` INT,\n  PRIMARY KEY (`order_id`, `product_id`),\n  FOREIGN KEY (`order_id`) REFERENCES `Order` (`order_id`),\n  FOREIGN KEY (`product_id`) REFERENCES `Product` (`product_id`)\n) ENGINE=InnoDB;');
  });

  it('makes tables SQLite accepts, whose keys hold', async () => {
    const wasm = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm');
    const SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer });
    const db = new SQL.Database();
    const sql = toSql(logical(EXAMPLE_MODEL), 'sqlite');
    expect(sql).toContain('"customer_id" INTEGER PRIMARY KEY AUTOINCREMENT');
    db.run(sql);
    db.run(`INSERT INTO Customer (name) VALUES ('Ada'); INSERT INTO "Order" (date, customer_id) VALUES ('2026-10-05', 1); INSERT INTO Product (label, price) VALUES ('Gear', 2.5); INSERT INTO Contains VALUES (1, 1, 3);`);
    expect(db.exec('SELECT c.name, p.label, x.quantity FROM Contains x JOIN "Order" o USING (order_id) JOIN Customer c USING (customer_id) JOIN Product p USING (product_id)')[0]!.values).toEqual([['Ada', 'Gear', 3]]);
    // An order of no customer is refused.
    expect(() => db.run(`INSERT INTO "Order" (date, customer_id) VALUES ('2026-10-05', 99)`)).toThrow(/FOREIGN KEY/);
  });
});
