/**
 * Autofilter (SHEET-018): a range whose first row holds the headings, and
 * for some columns the values to show; the other rows of the range are
 * hidden. Values are compared as displayed (formatted), empty cells as "".
 */
import { cellKey } from './address';
import type { Calculator } from './engine';
import { formatValue } from './number-format';
import type { Range } from './ops';
import type { Workbook } from './model';

export interface AutoFilter {
  /** The range, its first row being the headings. */
  range: Range;
  /** Values shown, by column index; a column absent shows everything. */
  columns: Record<number, string[]>;
}

/** The text of a cell as shown in the grid. */
export function displayText(wb: Workbook, si: number, calc: Calculator, row: number, col: number): string {
  const cell = wb.sheets[si]!.cells.get(cellKey(row, col));
  if (!cell) return '';
  const v = calc.value(si, [row, col]);
  return v === null ? '' : formatValue(v, cell.numFmt);
}

/** Turn the filter on (on `range`) or off. */
export function toggleFilter(wb: Workbook, si: number, range: Range): void {
  const sheet = wb.sheets[si]!;
  if (sheet.filter) delete sheet.filter;
  else sheet.filter = { range: { ...range }, columns: {} };
}

/** Show only `values` in a column of the filter; undefined shows everything. */
export function setColumnFilter(wb: Workbook, si: number, col: number, values: string[] | undefined): void {
  const filter = wb.sheets[si]!.filter;
  if (!filter) return;
  if (values) filter.columns[col] = [...values];
  else delete filter.columns[col];
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** The distinct values of a column of the filter range, below its headings, in order. */
export function columnValues(wb: Workbook, si: number, calc: Calculator, col: number): string[] {
  const filter = wb.sheets[si]!.filter;
  if (!filter) return [];
  const values = new Set<string>();
  for (let r = filter.range.r1 + 1; r <= filter.range.r2; r++) values.add(displayText(wb, si, calc, r, col));
  return [...values].sort(collator.compare);
}

/** The rows the filter hides. */
export function hiddenRows(wb: Workbook, si: number, calc: Calculator): Set<number> {
  const hidden = new Set<number>();
  const filter = wb.sheets[si]!.filter;
  if (!filter) return hidden;
  const columns = Object.entries(filter.columns).map(([c, values]) => [Number(c), new Set(values)] as const);
  if (!columns.length) return hidden;
  for (let r = filter.range.r1 + 1; r <= filter.range.r2; r++) {
    if (columns.some(([c, shown]) => !shown.has(displayText(wb, si, calc, r, c)))) hidden.add(r);
  }
  return hidden;
}

/**
 * Rows of the grid with the filtered ones left out: a row's index among the
 * shown rows, and back (the grid lays rows out by index).
 */
export class RowMap {
  private readonly set: Set<number>;

  /** `hidden`: the hidden rows, in ascending order. */
  constructor(private readonly hidden: number[] = []) {
    this.set = new Set(hidden);
  }

  isHidden(row: number): boolean {
    return this.set.has(row);
  }

  /** Index of a row among the shown rows (for a hidden row, the index of the next shown one). */
  index(row: number): number {
    let lo = 0;
    let hi = this.hidden.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.hidden[mid]! < row) lo = mid + 1;
      else hi = mid;
    }
    return row - lo;
  }

  /** The shown row at an index. */
  rowAt(index: number): number {
    let row = Math.max(0, index);
    for (const h of this.hidden) {
      if (h <= row) row++;
      else break;
    }
    return row;
  }

  /** The shown row `steps` shown rows away (negative: up), never above row 0. */
  step(row: number, steps: number): number {
    return this.rowAt(Math.max(0, this.index(row) + steps));
  }
}
