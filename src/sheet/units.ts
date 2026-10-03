/**
 * UNIT-001..UNIT-003: physical quantities — units with SI prefixes, products,
 * quotients and powers (`kN·m`, `km/h`, `m/s²`, `kg·m^-3`), their dimension
 * over the seven SI base quantities, and quantities kept in SI with the unit
 * they are shown in. Spreadsheets keep a quantity as a number in its unit,
 * with the unit as literal text in the number format (`General" mm"`), which
 * other spreadsheets show as it is.
 */

/** Exponents of metre, kilogram, second, ampere, kelvin, mole, candela. */
export type Dim = number[];

export const DIMENSIONLESS: Dim = [0, 0, 0, 0, 0, 0, 0];

/** A unit as written: its symbols and their exponents (`kN·m` → kN¹ m¹). */
export type Parts = [string, number][];

export interface Unit {
  /** Value in SI of one of this unit. */
  factor: number;
  dim: Dim;
  parts: Parts;
}

/** A quantity: its value in SI, its dimension, the unit it is shown in. */
export interface Qty {
  q: true;
  v: number;
  dim: Dim;
  unit: string;
  parts: Parts;
}

export const isQty = (x: unknown): x is Qty => typeof x === 'object' && x !== null && (x as Qty).q === true;

const D = (m = 0, kg = 0, s = 0, A = 0, K = 0, mol = 0, cd = 0): Dim => [m, kg, s, A, K, mol, cd];

/** Symbols: their value in SI, dimension, and whether SI prefixes apply. */
const SYMBOLS: Record<string, [number, Dim, boolean]> = {
  m: [1, D(1), true],
  g: [1e-3, D(0, 1), true],
  s: [1, D(0, 0, 1), true],
  A: [1, D(0, 0, 0, 1), true],
  K: [1, D(0, 0, 0, 0, 1), true],
  mol: [1, D(0, 0, 0, 0, 0, 1), true],
  cd: [1, D(0, 0, 0, 0, 0, 0, 1), true],
  N: [1, D(1, 1, -2), true],
  J: [1, D(2, 1, -2), true],
  W: [1, D(2, 1, -3), true],
  Pa: [1, D(-1, 1, -2), true],
  Hz: [1, D(0, 0, -1), true],
  C: [1, D(0, 0, 1, 1), true],
  V: [1, D(2, 1, -3, -1), true],
  Ω: [1, D(2, 1, -3, -2), true],
  ohm: [1, D(2, 1, -3, -2), true],
  F: [1, D(-2, -1, 4, 2), true],
  H: [1, D(2, 1, -2, -2), true],
  T: [1, D(0, 1, -2, -1), true],
  Wb: [1, D(2, 1, -2, -1), true],
  S: [1, D(-2, -1, 3, 2), true],
  lm: [1, D(0, 0, 0, 0, 0, 0, 1), true],
  lx: [1, D(-2, 0, 0, 0, 0, 0, 1), true],
  Bq: [1, D(0, 0, -1), true],
  Gy: [1, D(2, 0, -2), true],
  Sv: [1, D(2, 0, -2), true],
  kat: [1, D(0, 0, -1, 0, 0, 1), true],
  rad: [1, D(), true],
  sr: [1, D(), true],
  L: [1e-3, D(3), true],
  l: [1e-3, D(3), true],
  t: [1e3, D(0, 1), true],
  eV: [1.602176634e-19, D(2, 1, -2), true],
  Wh: [3600, D(2, 1, -2), true],
  Ah: [3600, D(0, 0, 1, 1), true],
  bar: [1e5, D(-1, 1, -2), true],
  cal: [4.184, D(2, 1, -2), true],
  erg: [1e-7, D(2, 1, -2), false],
  dyn: [1e-5, D(1, 1, -2), false],
  min: [60, D(0, 0, 1), false],
  h: [3600, D(0, 0, 1), false],
  d: [86400, D(0, 0, 1), false],
  yr: [365.25 * 86400, D(0, 0, 1), false],
  ha: [1e4, D(2), false],
  Å: [1e-10, D(1), false],
  in: [0.0254, D(1), false],
  ft: [0.3048, D(1), false],
  yd: [0.9144, D(1), false],
  mi: [1609.344, D(1), false],
  nmi: [1852, D(1), false],
  ly: [9.4607304725808e15, D(1), false],
  pc: [3.0856775814913673e16, D(1), false],
  lb: [0.45359237, D(0, 1), false],
  oz: [0.028349523125, D(0, 1), false],
  lbf: [4.4482216152605, D(1, 1, -2), false],
  gal: [3.785411784e-3, D(3), false],
  atm: [101325, D(-1, 1, -2), false],
  at: [98066.5, D(-1, 1, -2), false],
  psi: [6894.757293168361, D(-1, 1, -2), false],
  mmHg: [133.322387415, D(-1, 1, -2), false],
  Torr: [101325 / 760, D(-1, 1, -2), false],
  hp: [745.69987158227, D(2, 1, -3), false],
  Gs: [1e-4, D(0, 1, -2, -1), false],
  // Temperatures as differences in calculations (1 °C = 1 K); CONVERT reads them as temperatures.
  '°C': [1, D(0, 0, 0, 0, 1), false],
  '°F': [5 / 9, D(0, 0, 0, 0, 1), false],
};

const PREFIXES: [string, number][] = [
  ['da', 1e1], ['Q', 1e30], ['R', 1e27], ['Y', 1e24], ['Z', 1e21], ['E', 1e18], ['P', 1e15], ['T', 1e12], ['G', 1e9], ['M', 1e6], ['k', 1e3], ['h', 1e2],
  ['d', 1e-1], ['c', 1e-2], ['m', 1e-3], ['µ', 1e-6], ['μ', 1e-6], ['u', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15], ['a', 1e-18], ['z', 1e-21], ['y', 1e-24], ['r', 1e-27], ['q', 1e-30],
];

/** Named units a product of several units is shown in, when it has their dimension. */
const NAMED = ['N', 'J', 'W', 'Pa', 'C', 'V', 'Ω', 'F', 'H', 'T', 'Wb', 'S', 'Hz'];

/** A symbol, with or without prefix: its factor and dimension. */
function symbol(sym: string): [number, Dim] | undefined {
  const exact = SYMBOLS[sym];
  if (exact) return [exact[0], exact[1]];
  for (const [p, f] of PREFIXES) {
    if (!sym.startsWith(p) || sym.length === p.length) continue;
    const base = SYMBOLS[sym.slice(p.length)];
    if (base?.[2]) return [base[0] * f, base[1]];
  }
  return undefined;
}

const SUPER: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const TO_SUPER: Record<string, string> = Object.fromEntries(Object.entries(SUPER).map(([k, v]) => [v, k]));

const dimOf = (parts: Parts): Dim | undefined => {
  const dim = [...DIMENSIONLESS];
  for (const [s, e] of parts) {
    const u = symbol(s);
    if (!u) return undefined;
    u[1].forEach((d, i) => (dim[i]! += d * e));
  }
  return dim;
};
const factorOf = (parts: Parts): number => parts.reduce((f, [s, e]) => f * symbol(s)![0] ** e, 1);

/** A unit written as `kN·m`, `km/h`, `m/s²`, `kg*m^-3`, `m2`, `1/(mol·L)`; undefined when it is not one. */
export function parseUnit(text: string | undefined): Unit | undefined {
  const src = (text ?? '').trim();
  if (!src || src.length > 60) return undefined;
  const parts: Parts = [];
  let i = 0;
  let sign = 1;
  let groupSign = 1;
  const add = (sym: string, exp: number): boolean => {
    if (!symbol(sym)) return false;
    const at = parts.find((p) => p[0] === sym);
    if (at) at[1] += exp;
    else parts.push([sym, exp]);
    return true;
  };
  while (i < src.length) {
    const c = src[i]!;
    if (c === '·' || c === '*' || c === '⋅' || c === ' ' || c === '.') {
      i++;
      sign = groupSign;
      continue;
    }
    if (c === '/') {
      i++;
      sign = -1;
      if (src[i] === '(') {
        groupSign = -1;
        i++;
      }
      continue;
    }
    if (c === ')') {
      groupSign = 1;
      i++;
      continue;
    }
    if (c === '1' && (src[i + 1] === '/' || i + 1 === src.length) && !parts.length) {
      i++;
      continue;
    }
    const m = /^(°?[A-Za-zµμΩÅ]+)(?:\^\(?(-?\d+(?:\.\d+)?)\)?|([⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)|(-?\d+))?/.exec(src.slice(i));
    if (!m) return undefined;
    const exp = m[2] ?? (m[3] ? [...m[3]].map((x) => SUPER[x]).join('') : undefined) ?? m[4] ?? '1';
    if (!add(m[1]!, sign * Number(exp))) return undefined;
    i += m[0].length;
    if (groupSign === 1) sign = 1;
  }
  const kept = parts.filter((p) => p[1] !== 0);
  if (!kept.length) return undefined;
  const dim = dimOf(kept)!;
  return { factor: factorOf(kept), dim, parts: kept };
}

const fmtExp = (e: number): string => (e === 1 ? '' : Number.isInteger(e) ? [...String(e)].map((x) => TO_SUPER[x] ?? x).join('') : `^${+e.toFixed(4)}`);

/** Parts written back: `kN·m`, `m/s²`, `1/(mol·L)`. */
export function formatUnit(parts: Parts): string {
  const num = parts.filter((p) => p[1] > 0).map(([s, e]) => `${s}${fmtExp(e)}`);
  const den = parts.filter((p) => p[1] < 0).map(([s, e]) => `${s}${fmtExp(-e)}`);
  const top = num.join('·') || (den.length ? '1' : '');
  if (!den.length) return top;
  return `${top}/${den.length > 1 ? `(${den.join('·')})` : den[0]}`;
}

export const sameDim = (a: Dim, b: Dim): boolean => a.every((x, i) => Math.abs(x - b[i]!) < 1e-9);
const isNone = (d: Dim): boolean => sameDim(d, DIMENSIONLESS);

const make = (v: number, parts: Parts): Qty => {
  const kept = parts.filter((p) => Math.abs(p[1]) > 1e-12);
  const dim = dimOf(kept) ?? [...DIMENSIONLESS];
  if (isNone(dim)) return { q: true, v, dim: [...DIMENSIONLESS], unit: '', parts: [] };
  return { q: true, v, dim, unit: formatUnit(kept), parts: kept };
};

/** A quantity of `value` in `unit`; undefined when the unit is unknown. */
export function quantity(value: number, unit: string): Qty | undefined {
  const u = parseUnit(unit);
  return u ? make(value * u.factor, u.parts) : undefined;
}

/** The quantity's value in the unit it is shown in. */
export function display(q: Qty): { value: number; unit: string } {
  return { value: q.parts.length ? q.v / factorOf(q.parts) : q.v, unit: q.unit };
}

/** The value of a quantity in another unit of the same dimension. */
export function inUnit(q: Qty, unit: string): number | undefined {
  const u = parseUnit(unit);
  return u && sameDim(u.dim, q.dim) ? q.v / u.factor : undefined;
}

/** A quantity shown in another unit of its dimension. */
export function convertTo(q: Qty, unit: string): Qty | undefined {
  const u = parseUnit(unit);
  return u && sameDim(u.dim, q.dim) ? make(q.v, u.parts) : undefined;
}

const unitDim = (s: string): Dim => symbol(s)![1];

/** Parts merged: a unit of the same dimension as one already there is counted as it (mm·m → mm²). */
function merge(a: Parts, b: Parts, sign: 1 | -1): Parts {
  const out: Parts = a.map(([s, e]) => [s, e]);
  for (const [s, e] of b) {
    const same = out.find(([x]) => x === s) ?? out.find(([x]) => sameDim(unitDim(x), unitDim(s)) && !isNone(unitDim(s)));
    if (same) same[1] += sign * e;
    else out.push([s, sign * e]);
  }
  return out;
}

/** Several units of a named dimension are shown in it (kg·m/s² → N). */
function named(parts: Parts, dim: Dim): Parts {
  if (parts.length < 3) return parts;
  for (const n of NAMED) if (sameDim(SYMBOLS[n]![1], dim)) return [[n, 1]];
  return parts;
}

export const add = (a: Qty, b: Qty): Qty | undefined => (sameDim(a.dim, b.dim) ? { ...a, v: a.v + b.v } : undefined);
export const sub = (a: Qty, b: Qty): Qty | undefined => (sameDim(a.dim, b.dim) ? { ...a, v: a.v - b.v } : undefined);

export function mul(a: Qty, b: Qty): Qty {
  const parts = merge(a.parts, b.parts, 1);
  const dim = a.dim.map((x, i) => x + b.dim[i]!);
  return make(a.v * b.v, named(parts.filter((p) => Math.abs(p[1]) > 1e-12), dim));
}

export function div(a: Qty, b: Qty): Qty {
  const parts = merge(a.parts, b.parts, -1);
  const dim = a.dim.map((x, i) => x - b.dim[i]!);
  return make(a.v / b.v, named(parts.filter((p) => Math.abs(p[1]) > 1e-12), dim));
}

export function pow(a: Qty, n: number): Qty | undefined {
  if (!Number.isFinite(n)) return undefined;
  return make(a.v ** n, a.parts.map(([s, e]) => [s, e * n]));
}

/** A plain number as a quantity without dimension. */
export const scalarQty = (v: number): Qty => ({ q: true, v, dim: [...DIMENSIONLESS], unit: '', parts: [] });

// --- number formats ----------------------------------------------------------------------

/** UNIT-002: the unit written at the end of a number format (`0.00" mm"`), when it is one. */
export function unitOfFormat(fmt: string | undefined): string | undefined {
  if (!fmt) return undefined;
  const first = fmt.split(';')[0]!;
  const m = /^([^"]*(?:general|[0#?][0#?,.]*))\s*"\s*([^"]+?)\s*"\s*$/i.exec(first);
  if (!m || /%|[ydhs]/i.test(m[1]!.replace(/general/i, ''))) return undefined;
  return parseUnit(m[2]) ? m[2] : undefined;
}

/** The number format showing a value in `unit`. */
export const withUnit = (unit: string, base = 'General'): string => `${base}" ${unit.replace(/"/g, '')}"`;

// --- Excel's CONVERT ----------------------------------------------------------------------

/** Excel's names for units (CONVERT), where they differ from the symbols. */
const EXCEL: Record<string, string> = {
  sec: 's', hr: 'h', mn: 'min', day: 'd', lbm: 'lb', ozm: 'oz', HP: 'hp', h: 'h', ang: 'Å', lt: 'L', e: 'erg', c: 'cal', ev: 'eV', wh: 'Wh', w: 'W', ga: 'Gs', dy: 'dyn', Nmi: 'nmi', parsec: 'pc', p: 'Pa', Pica: 'in',
};
/** Excel's IT calorie (`cal`), and the thermochemical one (`c`). */
const EXCEL_FACTOR: Record<string, number> = { cal: 4.1868 / 4.184, Pica: 1 / 72 };

const TEMPERATURES: Record<string, { toK: (x: number) => number; fromK: (k: number) => number }> = {
  C: { toK: (x) => x + 273.15, fromK: (k) => k - 273.15 },
  F: { toK: (x) => ((x - 32) * 5) / 9 + 273.15, fromK: (k) => ((k - 273.15) * 9) / 5 + 32 },
  K: { toK: (x) => x, fromK: (k) => k },
  Rank: { toK: (x) => (x * 5) / 9, fromK: (k) => (k * 9) / 5 },
  Reau: { toK: (x) => x * 1.25 + 273.15, fromK: (k) => (k - 273.15) * 0.8 },
};
const TEMP_ALIAS: Record<string, string> = { C: 'C', cel: 'C', '°C': 'C', F: 'F', fah: 'F', '°F': 'F', K: 'K', kel: 'K', Rank: 'Rank', Reau: 'Reau' };

function excelUnit(name: string): Unit | undefined {
  const mapped = EXCEL[name];
  const u = parseUnit(mapped ?? name);
  if (u && EXCEL_FACTOR[name]) return { ...u, factor: u.factor * EXCEL_FACTOR[name]! };
  return u;
}

/** Excel's CONVERT(number, from, to): undefined when a unit is unknown or the dimensions differ. */
export function convertExcel(value: number, from: string, to: string): number | undefined {
  const tf = TEMP_ALIAS[from];
  const tt = TEMP_ALIAS[to];
  if (tf && tt) return TEMPERATURES[tt]!.fromK(TEMPERATURES[tf]!.toK(value));
  const a = excelUnit(from);
  const b = excelUnit(to);
  if (!a || !b || !sameDim(a.dim, b.dim)) return undefined;
  return (value * a.factor) / b.factor;
}
