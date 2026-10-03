/**
 * FORM-004: compiled answers sent to a Grist document — a real database —
 * as the records of a table: created with a column per field (typed: text,
 * number, yes/no), or completed when it exists (new fields become new
 * columns). A file whose row is already there is not sent twice.
 */
import type { GristClient, GristValue } from '../grist/client';
import type { AnswersTable } from './collect';
import type { Scalar } from '../sheet/model';

/** A Grist column id for a label: letters, digits and `_`, starting with a letter. */
export function gristColumnId(label: string, taken: Set<string>): string {
  let base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base) base = 'Field';
  if (!/^[A-Za-z]/.test(base)) base = `F_${base}`;
  base = base[0]!.toUpperCase() + base.slice(1);
  let id = base;
  for (let i = 2; taken.has(id.toLowerCase()); i++) id = `${base}_${i}`;
  taken.add(id.toLowerCase());
  return id;
}

/** The Grist type of a column's values: Bool, Numeric or Text. */
export function gristType(values: Scalar[]): string {
  const set = values.filter((v) => v !== null && v !== undefined);
  if (set.length && set.every((v) => typeof v === 'boolean')) return 'Bool';
  if (set.length && set.every((v) => typeof v === 'number')) return 'Numeric';
  return 'Text';
}

export interface SentAnswers {
  tableId: string;
  added: number;
  /** Rows not sent: their file is in the table already. */
  skipped: number;
  created: boolean;
}

export async function sendAnswersToGrist(client: GristClient, docId: string, table: AnswersTable, tableName = 'Form_answers'): Promise<SentAnswers> {
  const tables = await client.listTables(docId);
  const existing = tables.find((t) => t.toLowerCase() === tableName.toLowerCase());
  const ids: string[] = [];
  let tableId: string;
  let known = new Set<string>();
  if (existing) {
    tableId = existing;
    const current = await client.readTable(docId, tableId);
    const taken = new Set(current.columns.map((c) => c.id.toLowerCase()));
    const missing: { id: string; label: string; type: string }[] = [];
    table.header.forEach((label, c) => {
      const match = current.columns.find((col) => col.label === label || col.id === label);
      if (match) return void ids.push(match.id);
      const id = gristColumnId(label, taken);
      ids.push(id);
      missing.push({ id, label, type: gristType(table.rows.map((r) => r[c] ?? null)) });
    });
    await client.addColumns(docId, tableId, missing);
    const fileId = ids[0]!;
    known = new Set(current.records.map((r) => String(r.fields[fileId] ?? '')).filter(Boolean));
  } else {
    const taken = new Set<string>();
    const columns = table.header.map((label, c) => {
      const id = gristColumnId(label, taken);
      ids.push(id);
      return { id, label, type: gristType(table.rows.map((r) => r[c] ?? null)) };
    });
    tableId = await client.createTable(docId, tableName, columns);
  }
  const fresh = table.rows.filter((r) => !known.has(String(r[0] ?? '')));
  const add = fresh.map((row) => Object.fromEntries(row.map((v, c): [string, GristValue] => [ids[c]!, v as GristValue])));
  if (add.length) await client.apply(docId, [{ tableId, update: [], add, remove: [] }]);
  return { tableId, added: add.length, skipped: table.rows.length - fresh.length, created: !existing };
}
