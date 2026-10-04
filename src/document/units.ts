/**
 * DOC-054: the unit of the lengths of the page — its size, its margins, the
 * indents — chosen once and used by the page setup, the paragraph spacing and
 * the rulers; and which rulers are shown, each on its own.
 */

export type LengthUnit = 'mm' | 'cm' | 'in' | 'pt';
export const LENGTH_UNITS: LengthUnit[] = ['mm', 'cm', 'in', 'pt'];

/** Millimetres in one unit. */
export const MM_PER: Record<LengthUnit, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 };
/** The step of a number field in that unit, and its decimals. */
export const UNIT_STEP: Record<LengthUnit, string> = { mm: '1', cm: '0.05', in: '0.01', pt: '1' };
const DECIMALS: Record<LengthUnit, number> = { mm: 1, cm: 2, in: 3, pt: 1 };

const round = (n: number, d: number): number => Math.round(n * 10 ** d) / 10 ** d;

/** A length in millimetres, in `unit` (rounded as shown in a field). */
export const fromMm = (mm: number, unit: LengthUnit): number => round(mm / MM_PER[unit], DECIMALS[unit]);
/** A length in `unit`, in millimetres (to a tenth). */
export const toMm = (value: number, unit: LengthUnit): number => round(value * MM_PER[unit], 1);

const UNIT_KEY = 'pwo.doc.unit';
const RULERS_KEY = 'pwo.doc.rulers';
export const UNIT_EVENT = 'pwo-length-unit';
export const RULERS_EVENT = 'pwo-rulers';

const isUnit = (v: unknown): v is LengthUnit => typeof v === 'string' && (LENGTH_UNITS as string[]).includes(v);

/** The unit chosen; inches in the United States, centimetres elsewhere, until one is chosen. */
export function loadLengthUnit(): LengthUnit {
  try {
    const v = localStorage.getItem(UNIT_KEY);
    if (isUnit(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && /^en-US$/.test(navigator.language) ? 'in' : 'cm';
}

export function saveLengthUnit(unit: LengthUnit): void {
  try {
    localStorage.setItem(UNIT_KEY, unit);
  } catch {
    /* storage unavailable */
  }
  if (typeof dispatchEvent === 'function') dispatchEvent(new CustomEvent(UNIT_EVENT, { detail: unit }));
}

export interface RulerSides {
  horizontal: boolean;
  vertical: boolean;
}

/** The rulers shown: both by default on a large screen (`'1'`/`'0'` of the first versions read as both). */
export function loadRulerSides(): RulerSides {
  try {
    const v = localStorage.getItem(RULERS_KEY);
    if (v === '1' || v === '0') return { horizontal: v === '1', vertical: v === '1' };
    if (v) {
      const p = JSON.parse(v) as Partial<RulerSides>;
      return { horizontal: p.horizontal === true, vertical: p.vertical === true };
    }
  } catch {
    /* storage unavailable, or not JSON */
  }
  const large = typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches;
  return { horizontal: large, vertical: large };
}

export function saveRulerSides(sides: RulerSides): void {
  try {
    localStorage.setItem(RULERS_KEY, JSON.stringify({ horizontal: sides.horizontal, vertical: sides.vertical }));
  } catch {
    /* storage unavailable */
  }
  if (typeof dispatchEvent === 'function') dispatchEvent(new CustomEvent(RULERS_EVENT, { detail: sides }));
}
