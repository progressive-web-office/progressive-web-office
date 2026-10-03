/**
 * UNIT-004: cells shown in another unit — a quantity is converted (12 mm →
 * 1.2 cm), a plain number gets the unit, a formula is shown in it.
 */
import { parseKey } from './address';
import type { Sheet } from './model';
import { inUnit, parseUnit, quantity, unitOfFormat, withUnit } from './units';

export interface UnitChange {
  changed: number;
  /** Cells left as they were: their dimension is not that of the unit. */
  refused: number;
}

/** The format without its unit: `0.00" mm"` → `0.00`. */
const baseOf = (fmt: string | undefined): string => {
  const base = (fmt ?? '').replace(/\s*"[^"]*"\s*$/, '').trim();
  return base && /^(general|[#0?][#0?,.]*)$/i.test(base) ? base : 'General';
};

export function setCellsUnit(sheet: Sheet, range: { r1: number; c1: number; r2: number; c2: number }, unit: string): UnitChange {
  if (!parseUnit(unit)) throw new Error(`Unknown unit: ${unit}`);
  const out: UnitChange = { changed: 0, refused: 0 };
  for (const [key, cell] of sheet.cells) {
    const [r, c] = parseKey(key);
    if (r < range.r1 || r > range.r2 || c < range.c1 || c > range.c2) continue;
    if (cell.formula === undefined && typeof cell.value !== 'number') continue;
    const fmt = withUnit(unit, baseOf(cell.numFmt));
    const from = unitOfFormat(cell.numFmt);
    if (cell.formula === undefined && from) {
      const x = inUnit(quantity(cell.value as number, from)!, unit);
      if (x === undefined) {
        out.refused++;
        continue;
      }
      cell.value = +x.toPrecision(15);
    }
    cell.numFmt = fmt;
    out.changed++;
  }
  return out;
}
