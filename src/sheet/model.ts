/** Workbook model: sheets of sparse cells holding values and/or formulas. */
import { cellKey, parseKey, parseRef } from './address';

export type Scalar = string | number | boolean | null;
export interface ErrorValue {
  error: string;
}
export type Value = Scalar | ErrorValue;

export interface Cell {
  /** Literal value (for formula cells: the last cached result, may be null). */
  value: Scalar;
  /** Formula in Excel A1 syntax, without the leading `=`. */
  formula?: string;
  /** Number format code (e.g. `0.00`, `0%`, `yyyy-mm-dd`). */
  numFmt?: string;
  /** Character and cell formatting (SHEET-014). */
  style?: CellStyle;
}

/** Formatting of a cell (SHEET-014); colours are `#rrggbb`. */
export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fill?: string;
  align?: 'left' | 'center' | 'right';
  /** A thin border on the four sides. */
  border?: boolean;
}

/** Drop unset values; undefined when nothing is left. */
export function cleanCellStyle(style: CellStyle | undefined): CellStyle | undefined {
  if (!style) return undefined;
  const out: CellStyle = {};
  if (style.bold) out.bold = true;
  if (style.italic) out.italic = true;
  if (style.underline) out.underline = true;
  if (style.color && /^#[0-9a-f]{6}$/i.test(style.color)) out.color = style.color.toLowerCase();
  if (style.fill && /^#[0-9a-f]{6}$/i.test(style.fill)) out.fill = style.fill.toLowerCase();
  if (style.align === 'left' || style.align === 'center' || style.align === 'right') out.align = style.align;
  if (style.border) out.border = true;
  return Object.keys(out).length ? out : undefined;
}

export type ChartType = 'column' | 'bar' | 'line' | 'pie' | 'scatter';

/** A chart drawn from a range of its sheet (SHEET-020). */
export interface Chart {
  type: ChartType;
  title?: string;
  /** Data range in A1 notation: the first column holds categories (x values for scatter), the others series. */
  range: string;
  /** The first row of the range holds series names. */
  headers: boolean;
  /** Top-left cell the chart is anchored to. */
  anchor: { row: number; col: number };
  /** Size in CSS pixels. */
  width: number;
  height: number;
}

export interface Sheet {
  name: string;
  cells: Map<string, Cell>;
  /** Column widths in pixels, by column index. */
  colWidths?: Map<number, number>;
  charts?: Chart[];
  /** Rows above and columns left of the scrolling area, always shown (SHEET-017). */
  freeze?: { rows: number; cols: number };
}

export interface Workbook {
  sheets: Sheet[];
}

export const isError = (v: unknown): v is ErrorValue => typeof v === 'object' && v !== null && 'error' in v;

export function newSheet(name: string): Sheet {
  return { name, cells: new Map() };
}

export function newWorkbook(): Workbook {
  return { sheets: [newSheet('Sheet1')] };
}

function toRowCol(ref: string | [number, number]): [number, number] {
  if (Array.isArray(ref)) return ref;
  const r = parseRef(ref);
  if (!r) throw new Error(`Invalid cell reference: ${ref}`);
  return [r.row, r.col];
}

export function getCell(sheet: Sheet, ref: string | [number, number]): Cell | undefined {
  const [r, c] = toRowCol(ref);
  return sheet.cells.get(cellKey(r, c));
}

export function setCell(sheet: Sheet, ref: string | [number, number], cell: Cell | undefined): void {
  const [r, c] = toRowCol(ref);
  if (!cell || (cell.value === null && !cell.formula)) sheet.cells.delete(cellKey(r, c));
  else sheet.cells.set(cellKey(r, c), cell);
}

/** Days between 1899-12-30 (Excel epoch, 1900 date system) and a UTC date. */
export function dateToSerial(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

export function serialToDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000));
}

/** Interpret user input like a spreadsheet does. */
export function parseInput(input: string): Cell | undefined {
  if (input === '') return undefined;
  if (input.startsWith("'")) return { value: input.slice(1) };
  if (input.startsWith('=') && input.length > 1) return { value: null, formula: input.slice(1) };
  const t = input.trim();
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return { value: Number(t) };
  const pct = /^([+-]?(?:\d+\.?\d*|\.\d+))\s*%$/.exec(t);
  if (pct) {
    const decimals = pct[1]!.includes('.') ? pct[1]!.split('.')[1]!.length : 0;
    return { value: Number(pct[1]) / 100, numFmt: decimals ? `0.${'0'.repeat(decimals)}%` : '0%' };
  }
  const upper = t.toUpperCase();
  if (upper === 'TRUE' || upper === 'FALSE') return { value: upper === 'TRUE' };
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (date) {
    const [y, m, d] = [Number(date[1]), Number(date[2]), Number(date[3])];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return { value: dateToSerial(y, m, d), numFmt: 'yyyy-mm-dd' };
  }
  return { value: input };
}

export function setInput(sheet: Sheet, ref: string | [number, number], input: string): void {
  const previous = getCell(sheet, ref);
  const cell = parseInput(input);
  // Keep an explicit number format when typing a plain number into a formatted cell.
  if (cell && previous?.numFmt && !cell.numFmt && typeof cell.value === 'number') cell.numFmt = previous.numFmt;
  setCell(sheet, ref, cell);
}

/** Text shown in the formula bar for a cell. */
export function cellInput(cell: Cell | undefined): string {
  if (!cell) return '';
  if (cell.formula !== undefined) return `=${cell.formula}`;
  if (cell.value === null) return '';
  if (typeof cell.value === 'boolean') return cell.value ? 'TRUE' : 'FALSE';
  if (typeof cell.value === 'number' && cell.numFmt) {
    if (/y|d/.test(cell.numFmt) && !cell.numFmt.includes('%')) return serialToDate(cell.value).toISOString().slice(0, 10);
    if (cell.numFmt.includes('%')) return `${+(cell.value * 100).toPrecision(15)}%`;
  }
  if (typeof cell.value === 'string' && parseInput(cell.value)?.value !== cell.value) return `'${cell.value}`;
  return String(cell.value);
}

/** Bounding box of used cells: [rows, cols] counts (at least 1x1). */
export function usedSize(sheet: Sheet): [number, number] {
  let rows = 0;
  let cols = 0;
  for (const key of sheet.cells.keys()) {
    const [r, c] = parseKey(key);
    if (r + 1 > rows) rows = r + 1;
    if (c + 1 > cols) cols = c + 1;
  }
  return [Math.max(1, rows), Math.max(1, cols)];
}
