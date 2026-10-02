/** Structural workbook operations (SHEET-010, SHEET-011, SHEET-013). */
import { cellKey, parseKey } from './address';
import { formatValue } from './number-format';
import { shiftFormula, tokenize, refText, translateFormula, type RefToken } from './formula';
import { isError, parseInput, newSheet, type Cell, type Value, type Workbook } from './model';
import type { Calculator } from './engine';

export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

function shiftAll(wb: Workbook, si: number, axis: 'rows' | 'cols', index: number, count: number): void {
  const target = wb.sheets[si]!.name;
  for (const sheet of wb.sheets) {
    for (const cell of sheet.cells.values()) {
      if (cell.formula !== undefined) cell.formula = shiftFormula(cell.formula, axis, index, count, { formulaSheet: sheet.name, targetSheet: target });
    }
  }
}

function moveCells(wb: Workbook, si: number, axis: 'rows' | 'cols', index: number, count: number): void {
  const sheet = wb.sheets[si]!;
  const moved = new Map<string, Cell>();
  for (const [key, cell] of sheet.cells) {
    let [r, c] = parseKey(key);
    const p = axis === 'rows' ? r : c;
    if (count < 0 && p >= index && p < index - count) continue; // deleted
    if (p >= index) {
      if (axis === 'rows') r += count;
      else c += count;
    }
    moved.set(cellKey(r, c), cell);
  }
  sheet.cells = moved;
  // SHEET-020: charts follow their data; a chart whose data is deleted goes too.
  if (sheet.charts) {
    sheet.charts = sheet.charts.flatMap((chart) => {
      const range = shiftFormula(chart.range, axis, index, count, { formulaSheet: sheet.name, targetSheet: sheet.name });
      if (range.includes('#REF!')) return [];
      const anchor = { ...chart.anchor };
      const key = axis === 'rows' ? 'row' : 'col';
      if (anchor[key] >= index) anchor[key] = count < 0 && anchor[key] < index - count ? index : anchor[key] + count;
      return [{ ...chart, range, anchor }];
    });
  }
  if (axis === 'cols' && sheet.colWidths) {
    const widths = new Map<number, number>();
    for (const [c, w] of sheet.colWidths) {
      if (count < 0 && c >= index && c < index - count) continue;
      widths.set(c >= index ? c + count : c, w);
    }
    sheet.colWidths = widths;
  }
}

export function insertCells(wb: Workbook, si: number, axis: 'rows' | 'cols', index: number, count: number): void {
  shiftAll(wb, si, axis, index, count);
  moveCells(wb, si, axis, index, count);
}

export function deleteCells(wb: Workbook, si: number, axis: 'rows' | 'cols', index: number, count: number): void {
  shiftAll(wb, si, axis, index, -count);
  moveCells(wb, si, axis, index, -count);
}

export function uniqueSheetName(wb: Workbook, base = 'Sheet'): string {
  for (let i = wb.sheets.length + 1; ; i++) {
    const name = `${base}${i}`;
    if (!wb.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) return name;
  }
}

/** Append a new empty sheet; returns its index. */
export function addSheet(wb: Workbook, name = uniqueSheetName(wb)): number {
  wb.sheets.push(newSheet(name));
  return wb.sheets.length - 1;
}

export function validateSheetName(wb: Workbook, si: number, name: string): string | undefined {
  const n = name.trim();
  if (!n) return 'The sheet name cannot be empty.';
  if (n.length > 31) return 'The sheet name cannot exceed 31 characters.';
  if (/[[\]:*?/\\]/.test(n)) return 'The sheet name contains a forbidden character ([ ] : * ? / \\).';
  if (wb.sheets.some((s, i) => i !== si && s.name.toLowerCase() === n.toLowerCase())) return `A sheet named “${n}” already exists.`;
  return undefined;
}

export function renameSheet(wb: Workbook, si: number, name: string): void {
  const error = validateSheetName(wb, si, name);
  if (error) throw new Error(error);
  const old = wb.sheets[si]!.name;
  const next = name.trim();
  for (const sheet of wb.sheets) {
    for (const cell of sheet.cells.values()) {
      if (cell.formula === undefined) continue;
      let tokens;
      try {
        tokens = tokenize(cell.formula);
      } catch {
        continue;
      }
      let out = '';
      let last = 0;
      for (const tok of tokens) {
        if (tok.type === 'ref' && tok.sheet?.toLowerCase() === old.toLowerCase()) {
          out += cell.formula.slice(last, tok.start) + refText({ ...(tok as RefToken), sheet: next });
          last = tok.end;
        }
      }
      cell.formula = out + cell.formula.slice(last);
    }
  }
  wb.sheets[si]!.name = next;
}

export function deleteSheet(wb: Workbook, si: number): void {
  if (wb.sheets.length <= 1) throw new Error('The last sheet cannot be deleted.');
  wb.sheets.splice(si, 1);
}

/** Displayed values of a range as tab-separated text. */
export function copyRange(wb: Workbook, si: number, calc: Calculator, range: Range): string {
  const sheet = wb.sheets[si]!;
  const lines: string[] = [];
  for (let r = range.r1; r <= range.r2; r++) {
    const row: string[] = [];
    for (let c = range.c1; c <= range.c2; c++) {
      const cell = sheet.cells.get(cellKey(r, c));
      row.push(cell ? formatValue(calc.value(si, [r, c]), cell.numFmt).replace(/[\t\n]/g, ' ') : '');
    }
    lines.push(row.join('\t'));
  }
  return lines.join('\n');
}

/** Paste tab/newline separated text at a position (spreadsheet input rules). */
export function pasteText(wb: Workbook, si: number, at: { row: number; col: number }, text: string): Range {
  const sheet = wb.sheets[si]!;
  const rows = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
  rows.forEach((cols, dr) =>
    cols.forEach((value, dc) => {
      const key = cellKey(at.row + dr, at.col + dc);
      const cell = parseInput(value);
      if (cell) sheet.cells.set(key, cell);
      else sheet.cells.delete(key);
    }),
  );
  return { r1: at.row, c1: at.col, r2: at.row + rows.length - 1, c2: at.col + Math.max(...rows.map((r) => r.length)) - 1 };
}

export function clearRange(wb: Workbook, si: number, range: Range): void {
  const sheet = wb.sheets[si]!;
  for (const key of [...sheet.cells.keys()]) {
    const [r, c] = parseKey(key);
    if (r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2) sheet.cells.delete(key);
  }
}

export interface SortOptions {
  /** Column (absolute index) holding the sort key. */
  col: number;
  descending: boolean;
  /** The first row of the range is a header and stays in place. */
  header: boolean;
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const blank = (v: Value): boolean => v === null || v === '';
/** Numbers, then text, then booleans, then errors (empty cells are handled apart). */
const kind = (v: Value): number => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);

function compareValues(a: Value, b: Value): number {
  const ka = kind(a);
  const kb = kind(b);
  if (ka !== kb) return ka - kb;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return collator.compare(a, b);
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return isError(a) && isError(b) ? a.error.localeCompare(b.error) : 0;
}

/**
 * Sort the rows of a range by the computed values of one column (SHEET-016).
 * Rows move as a whole within the range; their formulas are translated like
 * a copy. The sort is stable and empty keys always go last.
 */
export function sortRange(wb: Workbook, si: number, calc: Calculator, range: Range, opts: SortOptions): void {
  const sheet = wb.sheets[si]!;
  const first = range.r1 + (opts.header ? 1 : 0);
  const rows: { from: number; key: Value; cells: (Cell | undefined)[] }[] = [];
  for (let r = first; r <= range.r2; r++) {
    const cells: (Cell | undefined)[] = [];
    for (let c = range.c1; c <= range.c2; c++) cells.push(sheet.cells.get(cellKey(r, c)));
    rows.push({ from: r, key: sheet.cells.has(cellKey(r, opts.col)) ? calc.value(si, [r, opts.col]) : null, cells });
  }
  const dir = opts.descending ? -1 : 1;
  rows.sort((a, b) => (blank(a.key) || blank(b.key) ? Number(blank(a.key)) - Number(blank(b.key)) : dir * compareValues(a.key, b.key)));
  rows.forEach((row, i) => {
    const r = first + i;
    row.cells.forEach((cell, j) => {
      const key = cellKey(r, range.c1 + j);
      if (!cell) return void sheet.cells.delete(key);
      sheet.cells.set(key, cell.formula !== undefined && r !== row.from ? { ...cell, formula: translateFormula(cell.formula, r - row.from, 0) } : cell);
    });
  });
}

/** Whether the first row of a range looks like a header: text above columns holding something else. */
export function guessHeader(wb: Workbook, si: number, calc: Calculator, range: Range): boolean {
  if (range.r2 <= range.r1) return false;
  const sheet = wb.sheets[si]!;
  let otherBelow = false;
  for (let c = range.c1; c <= range.c2; c++) {
    if (!sheet.cells.has(cellKey(range.r1, c))) continue;
    if (typeof calc.value(si, [range.r1, c]) !== 'string') return false;
    for (let r = range.r1 + 1; r <= range.r2 && !otherBelow; r++) {
      const v = sheet.cells.has(cellKey(r, c)) ? calc.value(si, [r, c]) : null;
      if (v !== null && typeof v !== 'string') otherBelow = true;
    }
  }
  return otherBelow;
}
