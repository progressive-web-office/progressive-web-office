/**
 * Grist tables <-> workbook sheets (GRIST-002, GRIST-003). Each table becomes
 * a sheet named after it: the first row holds the column labels, the first
 * column the record ids, which tell existing rows from new ones on save.
 */
import { dateToSerial, getCell, serialToDate, setCell, type Cell, type Scalar, type Sheet, type Workbook } from '../sheet/model';
import type { GristColumn, GristTable, GristTableChanges, GristValue } from './client';

export interface GristSnapshot {
  docId: string;
  tables: GristTable[];
}

/** Columns written back: formula columns and complex types (lists, references…) are read-only here. */
export function isEditable(column: GristColumn): boolean {
  if (column.isFormula) return false;
  const type = column.type.split(':')[0];
  return ['Text', 'Numeric', 'Int', 'Bool', 'Date', 'Choice', 'Any'].includes(type ?? '');
}

const SECONDS_PER_DAY = 86_400;

function toCell(column: GristColumn, value: GristValue): Cell | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (Array.isArray(value)) {
    // Encoded values: ['L', a, b] lists, ['R', table, id] references, ['E', ...] errors…
    const [code, ...rest] = value;
    if (code === 'L') return rest.length ? { value: rest.map(String).join(', ') } : undefined;
    if (code === 'E') return { value: `#${String(rest[0] ?? 'ERROR')}` };
    return { value: JSON.stringify(value) };
  }
  const type = column.type.split(':')[0];
  if ((type === 'Date' || type === 'DateTime') && typeof value === 'number') {
    const date = new Date(value * 1000);
    const serial = dateToSerial(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()) + (type === 'DateTime' ? (value % SECONDS_PER_DAY) / SECONDS_PER_DAY : 0);
    return { value: serial, numFmt: type === 'Date' ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm' };
  }
  return { value: value as Scalar };
}

function fromCell(column: GristColumn, cell: Cell | undefined): GristValue {
  const value = cell?.value ?? null;
  if (value === null) return null;
  const type = column.type.split(':')[0];
  if (type === 'Date' && typeof value === 'number') {
    const d = serialToDate(value);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
  }
  if ((type === 'Numeric' || type === 'Int') && typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

export function gristToWorkbook(snapshot: GristSnapshot): Workbook {
  const sheets: Sheet[] = snapshot.tables.map((table) => {
    const sheet: Sheet = { name: table.tableId, cells: new Map() };
    setCell(sheet, [0, 0], { value: 'id' });
    table.columns.forEach((c, i) => setCell(sheet, [0, i + 1], { value: c.label }));
    table.records.forEach((r, row) => {
      setCell(sheet, [row + 1, 0], { value: r.id });
      table.columns.forEach((c, i) => setCell(sheet, [row + 1, i + 1], toCell(c, r.fields[c.id] ?? null)));
    });
    return sheet;
  });
  return { sheets: sheets.length ? sheets : [{ name: 'Sheet1', cells: new Map() }] };
}

const same = (a: GristValue, b: GristValue): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Changes to send to Grist so that it matches the edited workbook. */
export function gristChanges(snapshot: GristSnapshot, workbook: Workbook): GristTableChanges[] {
  const out: GristTableChanges[] = [];
  for (const table of snapshot.tables) {
    const sheet = workbook.sheets.find((s) => s.name === table.tableId);
    if (!sheet) continue;
    // Match columns by their label in the header row, wherever they moved.
    const columns = new Map<number, GristColumn>();
    let lastRow = 0;
    let idColumn = -1;
    for (const key of sheet.cells.keys()) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      lastRow = Math.max(lastRow, r);
      if (r !== 0) continue;
      const label = String(getCell(sheet, [0, c])?.value ?? '');
      if (label === 'id') idColumn = c;
      const column = table.columns.find((col) => col.label === label);
      if (column) columns.set(c, column);
    }
    if (idColumn < 0) continue;
    const original = new Map(table.records.map((r) => [r.id, r]));
    const seen = new Set<number>();
    const changes: GristTableChanges = { tableId: table.tableId, update: [], add: [], remove: [] };
    for (let r = 1; r <= lastRow; r++) {
      const idValue = getCell(sheet, [r, idColumn])?.value;
      const fields: Record<string, GristValue> = {};
      for (const [c, column] of columns) {
        if (!isEditable(column)) continue;
        fields[column.id] = fromCell(column, getCell(sheet, [r, c]));
      }
      const record = typeof idValue === 'number' ? original.get(idValue) : undefined;
      if (record) {
        seen.add(record.id);
        const changed = Object.fromEntries(Object.entries(fields).filter(([id, v]) => !same(v, fromCell(columnById(table, id), toCell(columnById(table, id), record.fields[id] ?? null)))));
        if (Object.keys(changed).length) changes.update.push({ id: record.id, fields: changed });
      } else {
        const filled = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null));
        if (Object.keys(filled).length) changes.add.push(filled);
      }
    }
    changes.remove = table.records.map((r) => r.id).filter((id) => !seen.has(id));
    if (changes.update.length || changes.add.length || changes.remove.length) out.push(changes);
  }
  return out;
}

function columnById(table: GristTable, id: string): GristColumn {
  return table.columns.find((c) => c.id === id)!;
}
