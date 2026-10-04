/**
 * SHEET-027: filling cells from a selection, as with the fill handle of other
 * spreadsheets — numbers and dates continued as a series, "Item 1" as
 * "Item 2", days and months in order, formulas copied with their relative
 * references moved, anything else repeated.
 */
import { cellKey } from './address';
import { translateFormula } from './formula';
import { isDateFormat } from './number-format';
import type { Cell, Workbook } from './model';
import type { Range } from './ops';

/** Lists continued in order; the first that holds every value of the source is used. */
const LISTS: string[][] = [
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
  ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
  ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
  ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
  ['Q1', 'Q2', 'Q3', 'Q4'],
];

/** The straight line a + b·i through the values (least squares). */
function trend(values: number[]): { a: number; b: number } {
  const n = values.length;
  if (n === 1) return { a: values[0]!, b: 0 };
  const mi = (n - 1) / 2;
  const mv = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((v, i) => {
    num += (i - mi) * (v - mv);
    den += (i - mi) ** 2;
  });
  const b = num / den;
  return { a: mv - b * mi, b };
}

/** The decimals a number is written with (at most 10). */
const decimalsOf = (v: number): number => Math.min(10, (String(v).split('.')[1] ?? '').length);

/** Rounded to the decimals of the source when it goes up by equal steps, so 0.1 steps give 0 and 0.3, not 1.4e-17 and 0.30000000000000004. */
function tidy(v: number, source: number[]): number {
  const steps = source.slice(1).map((x, i) => x - source[i]!);
  const even = steps.every((d) => Math.abs(d - steps[0]!) < 1e-9 * Math.max(1, Math.abs(d)));
  if (even && !source.some((x) => /e/i.test(String(x)))) return Number(v.toFixed(Math.max(...source.map(decimalsOf)))) || 0;
  return +v.toPrecision(12);
}

type Series = (p: number, source: Cell) => Cell;

/** How a line of source cells continues at position p (0 is the first source cell; negative before it). */
function seriesOf(cells: (Cell | undefined)[]): Series | undefined {
  if (cells.some((c) => !c || c.formula !== undefined)) return undefined;
  const values = cells.map((c) => c!.value);
  // Numbers and dates.
  if (values.every((v) => typeof v === 'number')) {
    const nums = values as number[];
    const { a, b } = trend(nums);
    // A single date goes on day by day; a single number is copied.
    const step = nums.length === 1 && isDateFormat(cells[0]!.numFmt) ? 1 : b;
    return (p, source) => ({ ...source, value: tidy(a + step * p, nums) });
  }
  if (!values.every((v) => typeof v === 'string')) return undefined;
  const texts = values as string[];
  // Days, months, quarters.
  for (const list of LISTS) {
    const lower = list.map((s) => s.toLowerCase());
    const idx = texts.map((s) => lower.indexOf(s.toLowerCase()));
    if (idx.some((i) => i < 0)) continue;
    const step = idx.length > 1 ? idx[1]! - idx[0]! || 1 : 1;
    const upper = texts.every((s) => s === s.toUpperCase() && s !== s.toLowerCase());
    return (p, source) => {
      const k = (((idx[0]! + step * p) % list.length) + list.length) % list.length;
      return { ...source, value: upper ? list[k]!.toUpperCase() : list[k]! };
    };
  }
  // A text ending with a number ("Item 1", "Week 01", "T3 2026" is not: the number must be last).
  const parts = texts.map((s) => /^(.*?)(\d+)(\D*)$/.exec(s));
  if (parts.every((m) => m) && parts.every((m) => m![1] === parts[0]![1] && m![3] === parts[0]![3])) {
    const nums = parts.map((m) => Number(m![2]));
    const { a, b } = trend(nums);
    const step = nums.length === 1 ? 1 : b;
    const width = parts[0]![2]!.startsWith('0') ? parts[0]![2]!.length : 0;
    const [, prefix, , suffix] = parts[0]!;
    return (p, source) => {
      const n = Math.round(a + step * p);
      // Below zero there is no "Item -1": the text is repeated instead.
      if (n < 0) return source;
      return { ...source, value: `${prefix}${String(n).padStart(width, '0')}${suffix}` };
    };
  }
  return undefined;
}

/**
 * Fill `target` (the source range extended up, down, left or right) from
 * `source`. Each column (filling up or down) or row (left or right) of the
 * source is continued on its own. Returns false when the target does not
 * extend the source in one direction. With `series: false`, the cells are
 * copied as they are (formulas still moved), as Ctrl+D and Ctrl+R do.
 */
export function fillRange(wb: Workbook, si: number, source: Range, target: Range, opts: { series?: boolean } = {}): boolean {
  const sheet = wb.sheets[si]!;
  const vertical = target.c1 === source.c1 && target.c2 === source.c2 && (target.r1 < source.r1 || target.r2 > source.r2);
  const horizontal = target.r1 === source.r1 && target.r2 === source.r2 && (target.c1 < source.c1 || target.c2 > source.c2);
  if (!vertical && !horizontal) return false;
  const [from, to] = vertical ? [source.r1, source.r2] : [source.c1, source.c2];
  const [first, last] = vertical ? [target.r1, target.r2] : [target.c1, target.c2];
  const n = to - from + 1;
  const lines = vertical ? [source.c1, source.c2] : [source.r1, source.r2];
  for (let line = lines[0]!; line <= lines[1]!; line++) {
    const at = (p: number): [number, number] => (vertical ? [from + p, line] : [line, from + p]);
    const cells = Array.from({ length: n }, (_, i) => sheet.cells.get(cellKey(...at(i))));
    const series = opts.series === false ? undefined : seriesOf(cells);
    for (let pos = first; pos <= last; pos++) {
      const p = pos - from;
      if (p >= 0 && p < n) continue;
      const i = ((p % n) + n) % n;
      const src = cells[i];
      const key = cellKey(...at(p));
      if (!src) {
        sheet.cells.delete(key);
        continue;
      }
      let cell: Cell;
      if (series) cell = series(p, src);
      else if (src.formula !== undefined) {
        const d = p - i;
        cell = { ...src, value: null, formula: translateFormula(src.formula, vertical ? d : 0, vertical ? 0 : d) };
      } else cell = { ...src };
      if (src.style) cell.style = { ...src.style };
      sheet.cells.set(key, cell);
    }
  }
  return true;
}

/**
 * The range a fill handle dragged to (row, col) covers: the source extended
 * in the direction the pointer went furthest, or the source itself when the
 * pointer is inside it.
 */
export function fillTarget(source: Range, row: number, col: number): Range {
  const down = row - source.r2;
  const up = source.r1 - row;
  const right = col - source.c2;
  const left = source.c1 - col;
  const most = Math.max(down, up, right, left);
  if (most <= 0) return { ...source };
  if (most === down) return { ...source, r2: row };
  if (most === up) return { ...source, r1: row };
  if (most === right) return { ...source, c2: col };
  return { ...source, c1: col };
}

/** The last row of the filled block next to the source (left, else right), for a double click on the handle. */
export function fillDownEnd(wb: Workbook, si: number, source: Range): number {
  const sheet = wb.sheets[si]!;
  const filled = (r: number, c: number): boolean => c >= 0 && sheet.cells.has(cellKey(r, c));
  for (const c of [source.c1 - 1, source.c2 + 1]) {
    if (!filled(source.r2, c) && !filled(source.r2 + 1, c)) continue;
    let r = source.r2;
    while (filled(r + 1, c)) r++;
    if (r > source.r2) return r;
  }
  return source.r2;
}
