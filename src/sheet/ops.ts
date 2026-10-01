/** Structural workbook operations (SHEET-010, SHEET-011, SHEET-013). */
import { cellKey, parseKey } from './address';
import { formatValue } from './number-format';
import { shiftFormula, tokenize, refText, type RefToken } from './formula';
import { parseInput, newSheet, type Cell, type Workbook } from './model';
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
