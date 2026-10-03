/** Formula evaluation with caching and cycle detection (SHEET-006..008). */
import { cellKey, parseKey, parseRef } from './address';
import { FormulaSyntaxError, parseFormula, type Ast } from './formula';
import { isError, serialToDate, dateToSerial, type ErrorValue, type Scalar, type Value, type Workbook } from './model';
import { formatValue } from './number-format';
import { add as qAdd, convertExcel, convertTo, display as qDisplay, div as qDiv, isQty, mul as qMul, pow as qPow, quantity, sameDim, scalarQty, sub as qSub, unitOfFormat, inUnit, withUnit, type Qty } from './units';

/** UNIT-003: a value in a formula: a cell value, or a quantity with its unit. */
type V = Value | Qty;
type Range = { range: V[][] };
type EvalResult = V | Range;

const err = (e: string): ErrorValue => ({ error: e });
const DIV0 = err('#DIV/0!');
const VALUE = err('#VALUE!');
const NAME = err('#NAME?');
const REF = err('#REF!');
const NA = err('#N/A');
const CYCLE = err('#CYCLE!');
const SYNTAX = err('#ERROR!');
/** UNIT-003: dimensions that do not match (a length plus a time…). */
const UNIT = err('#UNIT!');

const isRange = (v: EvalResult): v is Range => typeof v === 'object' && v !== null && 'range' in v;
const dimensionless = (q: Qty): boolean => q.dim.every((d) => d === 0);

class FormulaError extends Error {
  constructor(readonly value: ErrorValue) {
    super(value.error);
  }
}

// --- coercion -----------------------------------------------------------------

/** SHEET-024: functions of one number. */
const MATH: Record<string, (x: number) => number> = {
  EXP: Math.exp,
  LN: Math.log,
  LOG10: Math.log10,
  SIN: Math.sin,
  COS: Math.cos,
  TAN: Math.tan,
  ASIN: Math.asin,
  ACOS: Math.acos,
  ATAN: Math.atan,
  SINH: Math.sinh,
  COSH: Math.cosh,
  TANH: Math.tanh,
  DEGREES: (x) => (x * 180) / Math.PI,
  RADIANS: (x) => (x * Math.PI) / 180,
  SIGN: Math.sign,
};

/** A result outside the real numbers (log of 0, asin of 2…) is #NUM!. */
function finite(x: number): number {
  if (!Number.isFinite(x)) throw new FormulaError(err('#NUM!'));
  return x;
}

export function toNumber(v: V): number {
  if (isQty(v)) {
    // A quantity with a dimension is not a plain number (SIN of a length…).
    if (!dimensionless(v)) throw new FormulaError(UNIT);
    return v.v;
  }
  if (isError(v)) throw new FormulaError(v);
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v.trim());
  if (v.trim() !== '' && Number.isFinite(n)) return n;
  throw new FormulaError(VALUE);
}

export function toText(v: V): string {
  if (isQty(v)) {
    const d = qDisplay(v);
    return d.unit ? `${formatGeneral(+d.value.toPrecision(15))} ${d.unit}` : formatGeneral(d.value);
  }
  if (isError(v)) throw new FormulaError(v);
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return formatGeneral(v);
  return v;
}

function toBool(v: V): boolean {
  if (isQty(v)) return toNumber(v) !== 0;
  if (isError(v)) throw new FormulaError(v);
  if (typeof v === 'boolean') return v;
  if (v === null) return false;
  if (typeof v === 'number') return v !== 0;
  const u = v.toUpperCase();
  if (u === 'TRUE') return true;
  if (u === 'FALSE') return false;
  throw new FormulaError(VALUE);
}

/** "General" number format: up to 15 significant digits. */
export function formatGeneral(n: number): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const s = String(+n.toPrecision(15));
  return s;
}

function round(x: number, digits: number, mode: 'half' | 'up' | 'down' = 'half'): number {
  const m = 10 ** digits;
  const scaled = Math.abs(x) * m * (1 + Number.EPSILON);
  const r = mode === 'half' ? Math.round(scaled) : mode === 'up' ? Math.ceil(scaled - 1e-9) : Math.floor(scaled);
  return (Math.sign(x) * r) / m;
}

function compare(a: V, b: V): number {
  // UNIT-003: quantities compare in SI, of the same dimension only.
  if (isQty(a) || isQty(b)) {
    const x = isQty(a) ? a : typeof a === 'number' ? scalarQty(a) : undefined;
    const y = isQty(b) ? b : typeof b === 'number' ? scalarQty(b) : undefined;
    if (!x || !y || !sameDim(x.dim, y.dim)) throw new FormulaError(UNIT);
    return x.v - y.v;
  }
  const rank = (v: Value): number => (typeof v === 'number' || v === null ? 0 : typeof v === 'string' ? 1 : 2);
  if (isError(a)) throw new FormulaError(a);
  if (isError(b)) throw new FormulaError(b);
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'string' && typeof b === 'string') {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return Number(a) - Number(b);
}

// --- criteria (COUNTIF / SUMIF) ------------------------------------------------

function matcher(criteria: V): (v: V) => boolean {
  if (typeof criteria === 'number' || typeof criteria === 'boolean') return (v) => !isError(v) && v !== null && compare(v, criteria) === 0;
  const text = toText(criteria);
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(text)!;
  const op = m[1] ?? '=';
  const operand = m[2] ?? '';
  const num = operand.trim() !== '' && Number.isFinite(Number(operand)) ? Number(operand) : undefined;
  const target: Value = num ?? operand;
  const wildcard = num === undefined && /[*?]/.test(operand) && (op === '=' || op === '<>');
  const re = wildcard ? new RegExp(`^${operand.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i') : null;
  return (v) => {
    if (isError(v)) return false;
    if (re) return re.test(toText(v)) === (op === '=');
    if (v === null) return op === '<>' ? target !== '' : op === '=' && target === '';
    if (num !== undefined && typeof v !== 'number') return op === '<>';
    if (num === undefined && typeof v === 'number' && op !== '<>') return false;
    const c = compare(v, target);
    switch (op) {
      case '<':
        return c < 0;
      case '<=':
        return c <= 0;
      case '>':
        return c > 0;
      case '>=':
        return c >= 0;
      case '<>':
        return c !== 0;
      default:
        return c === 0;
    }
  };
}

/**
 * Where `needle` is in `list`: an exact match (`mode` 0), or the last value
 * not above it in an ascending list (1), or the last not below it in a
 * descending one (−1).
 */
function lookupIndex(list: V[], needle: V, mode: number): number {
  let found = -1;
  for (let i = 0; i < list.length; i++) {
    const v = list[i] ?? null;
    if (isError(v) || v === null) continue;
    const c = compare(v, needle);
    if (c === 0) return i;
    if (mode === 1 && c < 0) found = i;
    else if (mode === 1 && c > 0) break;
    else if (mode === -1 && c > 0) found = i;
    else if (mode === -1 && c < 0) break;
  }
  if (found < 0 || mode === 0) throw new FormulaError(NA);
  return found;
}

// --- calculator -----------------------------------------------------------------

export class Calculator {
  private cache = new Map<string, V>();
  private computing = new Set<string>();
  private parsed = new Map<string, Ast | ErrorValue>();

  constructor(private readonly wb: Workbook) {}

  /** Forget computed values (call after any edit). */
  invalidate(): void {
    this.cache.clear();
  }

  /**
   * Computed value of a cell (A1 reference or [row, col]); a quantity is
   * given as a number in the unit it is shown in (that of the cell's number
   * format, else its own) — see `format` for that unit (UNIT-002).
   */
  value(sheetIndex: number, ref: string | [number, number]): Value {
    const [row, col] = this.rowCol(ref);
    const v = this.computed(sheetIndex, row, col);
    if (!isQty(v)) return v;
    const cell = this.wb.sheets[sheetIndex]?.cells.get(cellKey(row, col));
    // A typed quantity: the number typed.
    if (cell && cell.formula === undefined && typeof cell.value === 'number') return cell.value;
    const wanted = unitOfFormat(cell?.numFmt);
    if (wanted) {
      const x = inUnit(v, wanted);
      return x === undefined ? UNIT : +x.toPrecision(15);
    }
    const d = qDisplay(v);
    return +d.value.toPrecision(15);
  }

  /** UNIT-002: the quantity of a cell, if it holds one. */
  quantity(sheetIndex: number, ref: string | [number, number]): Qty | undefined {
    const [row, col] = this.rowCol(ref);
    const v = this.computed(sheetIndex, row, col);
    return isQty(v) && !dimensionless(v) ? v : undefined;
  }

  /**
   * UNIT-002: the number format a cell is shown with: its own, or, for a
   * formula giving a quantity, one showing the quantity's unit.
   */
  format(sheetIndex: number, ref: string | [number, number]): string | undefined {
    const [row, col] = this.rowCol(ref);
    const cell = this.wb.sheets[sheetIndex]?.cells.get(cellKey(row, col));
    if (!cell || cell.formula === undefined || unitOfFormat(cell.numFmt)) return cell?.numFmt;
    const q = this.quantity(sheetIndex, [row, col]);
    if (!q) return cell.numFmt;
    const base = cell.numFmt && !/general/i.test(cell.numFmt) && /^[#0?][#0?,.]*$/.test(cell.numFmt) ? cell.numFmt : 'General';
    return withUnit(q.unit, base);
  }

  private rowCol(ref: string | [number, number]): [number, number] {
    if (Array.isArray(ref)) return ref;
    const r = parseRef(ref);
    if (!r) throw new Error(`Invalid reference ${ref}`);
    return [r.row, r.col];
  }

  private computed(sheetIndex: number, row: number, col: number): V {
    try {
      return this.cell(sheetIndex, row, col);
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      // Very long dependency chains: warm the cache in reading order, then retry.
      this.computing.clear();
      this.warmUp();
      return this.cell(sheetIndex, row, col);
    }
  }

  private warmUp(): void {
    this.wb.sheets.forEach((sheet, si) => {
      const keys = [...sheet.cells.entries()].filter(([, c]) => c.formula !== undefined).map(([k]) => parseKey(k));
      keys.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const [r, c] of keys) {
        try {
          this.cell(si, r, c);
        } catch {
          this.computing.clear();
        }
      }
    });
  }

  private cell(si: number, row: number, col: number): V {
    const sheet = this.wb.sheets[si];
    if (!sheet) return REF;
    const key = `${si}:${cellKey(row, col)}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const cell = sheet.cells.get(cellKey(row, col));
    if (!cell) return null;
    if (cell.formula === undefined) {
      // UNIT-002: a number with a unit in its format is a quantity.
      const unit = typeof cell.value === 'number' ? unitOfFormat(cell.numFmt) : undefined;
      const q = unit ? quantity(cell.value as number, unit) : undefined;
      return q ?? cell.value;
    }
    if (this.computing.has(key)) return CYCLE;
    this.computing.add(key);
    let result: V;
    try {
      const ast = this.parse(cell.formula);
      result = isError(ast) ? ast : this.scalar(this.eval(ast, si));
    } catch (e) {
      if (e instanceof FormulaError) result = e.value;
      else throw e;
    } finally {
      this.computing.delete(key);
    }
    if (typeof result === 'number' && !Number.isFinite(result)) result = err('#NUM!');
    if (isQty(result) && !Number.isFinite(result.v)) result = err('#NUM!');
    // A dimensionless quantity is a plain number.
    if (isQty(result) && dimensionless(result)) result = result.v;
    this.cache.set(key, result);
    return result;
  }

  private parse(formula: string): Ast | ErrorValue {
    let ast = this.parsed.get(formula);
    if (!ast) {
      try {
        ast = parseFormula(formula);
      } catch (e) {
        if (!(e instanceof FormulaSyntaxError)) throw e;
        ast = SYNTAX;
      }
      this.parsed.set(formula, ast);
    }
    return ast;
  }

  /** Reduce a range to its top-left value (implicit intersection light). */
  private scalar(v: EvalResult): V {
    if (!isRange(v)) return v;
    return v.range[0]?.[0] ?? null;
  }

  private sheetIndex(name: string | undefined, current: number): number {
    if (name === undefined) return current;
    const i = this.wb.sheets.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
    if (i < 0) throw new FormulaError(REF);
    return i;
  }

  private eval(ast: Ast, si: number): EvalResult {
    switch (ast.t) {
      case 'num':
        return ast.v;
      case 'str':
        return ast.v;
      case 'bool':
        return ast.v;
      case 'err':
        return err(ast.v);
      case 'ref': {
        const s = this.sheetIndex(ast.sheet, si);
        if (ast.single) {
          const v = this.cell(s, ast.r1, ast.c1);
          if (isError(v)) throw new FormulaError(v);
          return v;
        }
        return { range: this.range(s, ast.r1, ast.c1, ast.r2, ast.c2) };
      }
      case 'pct':
        return toNumber(this.val(ast.e, si)) / 100;
      case 'un': {
        const x = this.val(ast.e, si);
        if (isQty(x)) return ast.op === '-' ? { ...x, v: -x.v } : x;
        const n = toNumber(x);
        return ast.op === '-' ? -n : n;
      }
      case 'bin':
        return this.binary(ast.op, this.val(ast.l, si), this.val(ast.r, si));
      case 'call':
        return this.call(ast.name, ast.args, si);
    }
  }

  /** Evaluate to a scalar, propagating errors. */
  private val(ast: Ast, si: number): V {
    const v = this.scalar(this.eval(ast, si));
    if (isError(v)) throw new FormulaError(v);
    return v;
  }

  private range(si: number, r1: number, c1: number, r2: number, c2: number): V[][] {
    const sheet = this.wb.sheets[si]!;
    // Clamp whole-row/column ranges to the used area.
    let maxR = -1;
    let maxC = -1;
    for (const k of sheet.cells.keys()) {
      const [r, c] = parseKey(k);
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
    r2 = Math.min(r2, maxR);
    c2 = Math.min(c2, maxC);
    const out: V[][] = [];
    for (let r = r1; r <= r2; r++) {
      const row: V[] = [];
      for (let c = c1; c <= c2; c++) row.push(this.cell(si, r, c));
      out.push(row);
    }
    return out;
  }

  private binary(op: string, a: V, b: V): V {
    // UNIT-003: arithmetic of quantities, dimensions checked.
    if ((isQty(a) || isQty(b)) && ['+', '-', '*', '/', '^'].includes(op)) return this.quantityOp(op, a, b);
    switch (op) {
      case '+':
        return toNumber(a) + toNumber(b);
      case '-':
        return toNumber(a) - toNumber(b);
      case '*':
        return toNumber(a) * toNumber(b);
      case '/': {
        const d = toNumber(b);
        const n = toNumber(a);
        if (d === 0) throw new FormulaError(DIV0);
        return n / d;
      }
      case '^':
        return toNumber(a) ** toNumber(b);
      case '&':
        return toText(a) + toText(b);
      case '=':
        return compare(a, b) === 0;
      case '<>':
        return compare(a, b) !== 0;
      case '<':
        return compare(a, b) < 0;
      case '>':
        return compare(a, b) > 0;
      case '<=':
        return compare(a, b) <= 0;
      case '>=':
        return compare(a, b) >= 0;
      default:
        throw new FormulaError(SYNTAX);
    }
  }

  private quantityOp(op: string, a: V, b: V): V {
    const asQty = (x: V): Qty => (isQty(x) ? x : scalarQty(toNumber(x)));
    const x = asQty(a);
    const y = asQty(b);
    let r: Qty | undefined;
    if (op === '+') r = qAdd(x, y);
    else if (op === '-') r = qSub(x, y);
    else if (op === '*') r = qMul(x, y);
    else if (op === '/') {
      if (y.v === 0) throw new FormulaError(DIV0);
      r = qDiv(x, y);
    } else {
      // A power: the exponent has no dimension.
      r = qPow(x, toNumber(b));
    }
    if (!r) throw new FormulaError(UNIT);
    return r;
  }

  /** Numbers from arguments: ranges contribute numbers only, scalars are coerced. */
  private numbers(args: Ast[], si: number): number[] {
    const out: number[] = [];
    for (const a of args) {
      const v = this.eval(a, si);
      if (isRange(v)) {
        for (const row of v.range) for (const x of row) {
          if (isError(x)) throw new FormulaError(x);
          if (typeof x === 'number') out.push(x);
          else if (isQty(x)) out.push(toNumber(x));
        }
      } else {
        out.push(toNumber(v));
      }
    }
    return out;
  }

  /**
   * UNIT-003: the numbers of the arguments in SI, all of the same dimension,
   * and the quantity whose unit the result is shown in (the first one).
   */
  private measures(args: Ast[], si: number): { xs: number[]; like?: Qty; items: (Qty | undefined)[] } {
    const xs: number[] = [];
    const items: (Qty | undefined)[] = [];
    let like: Qty | undefined;
    let plain = false;
    const take = (x: V, fromRange: boolean): void => {
      if (isError(x)) throw new FormulaError(x);
      if (isQty(x)) {
        if (like && !sameDim(like.dim, x.dim)) throw new FormulaError(UNIT);
        like ??= x;
        xs.push(x.v);
        items.push(x);
      } else if (typeof x === 'number' || !fromRange) {
        plain = true;
        xs.push(toNumber(x));
        items.push(undefined);
      }
    };
    for (const a of args) {
      const v = this.eval(a, si);
      if (isRange(v)) for (const row of v.range) for (const x of row) take(x, true);
      else take(v, false);
    }
    if (like && plain && !dimensionless(like)) throw new FormulaError(UNIT);
    return like ? { xs, like, items } : { xs, items };
  }

  /** A number in SI as a quantity like `like` (or a plain number). */
  private measured(x: number, like: Qty | undefined): V {
    return like && !dimensionless(like) ? { ...like, v: x } : x;
  }

  private values(args: Ast[], si: number): V[] {
    const out: V[] = [];
    for (const a of args) {
      const v = this.eval(a, si);
      if (isRange(v)) for (const row of v.range) out.push(...row);
      else out.push(v);
    }
    return out;
  }

  private rangeArg(a: Ast | undefined, si: number): V[][] {
    if (!a) throw new FormulaError(VALUE);
    const v = this.eval(a, si);
    return isRange(v) ? v.range : [[v]];
  }

  /** The value of an argument, an error being a value (ISERROR, IFNA). */
  private caught(a: Ast, si: number): V {
    try {
      return this.scalar(this.eval(a, si));
    } catch (e) {
      if (e instanceof FormulaError) return e.value;
      throw e;
    }
  }

  private call(name: string, args: Ast[], si: number): EvalResult {
    const n = (i: number): number => toNumber(this.val(args[i] ?? { t: 'num', v: 0 }, si));
    const s = (i: number): string => toText(this.val(args[i] ?? { t: 'str', v: '' }, si));
    const need = (min: number, max = Infinity): void => {
      if (args.length < min || args.length > max) throw new FormulaError(VALUE);
    };
    switch (name) {
      case 'SUM': {
        const { xs, like } = this.measures(args, si);
        return this.measured(xs.reduce((a, b) => a + b, 0), like);
      }
      case 'PRODUCT': {
        // UNIT-003: units multiply too.
        let acc: V = 1;
        for (const v of this.values(args, si)) {
          if (isError(v)) throw new FormulaError(v);
          if (isQty(v) || typeof v === 'number') acc = isQty(v) || isQty(acc) ? this.quantityOp('*', acc, v) : (acc as number) * v;
        }
        return acc;
      }
      case 'AVERAGE': {
        const { xs, like } = this.measures(args, si);
        if (!xs.length) throw new FormulaError(DIV0);
        return this.measured(xs.reduce((a, b) => a + b, 0) / xs.length, like);
      }
      case 'MIN':
      case 'MAX': {
        // UNIT-003: the quantity found, in its own unit.
        const { xs, like, items } = this.measures(args, si);
        if (!xs.length) return 0;
        const best = name === 'MIN' ? Math.min(...xs) : Math.max(...xs);
        return this.measured(best, items[xs.indexOf(best)] ?? like);
      }
      case 'MEDIAN': {
        const { xs, like } = this.measures(args, si);
        xs.sort((a, b) => a - b);
        if (!xs.length) throw new FormulaError(NA);
        const mid = Math.floor(xs.length / 2);
        return this.measured(xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2, like);
      }
      case 'COUNT':
        return this.values(args, si).filter((v) => typeof v === 'number' || isQty(v)).length;
      case 'CONVERT': {
        // UNIT-001: Excel's CONVERT; a quantity is converted from its own unit.
        need(3, 3);
        const x = this.val(args[0]!, si);
        if (isQty(x)) {
          const q = convertTo(x, s(2));
          if (!q) throw new FormulaError(NA);
          return q;
        }
        const r = convertExcel(toNumber(x), s(1), s(2));
        if (r === undefined) throw new FormulaError(NA);
        return r;
      }
      case 'QTY': {
        // UNIT-002: a quantity in a formula: QTY(12; "mm").
        need(2, 2);
        const q = quantity(n(0), s(1));
        if (!q) throw new FormulaError(NA);
        return q;
      }
      case 'UNIT': {
        need(1, 1);
        const x = this.val(args[0]!, si);
        return isQty(x) ? x.unit : '';
      }
      case 'COUNTA':
        return this.values(args, si).filter((v) => v !== null && v !== '').length;
      case 'COUNTBLANK':
        return this.values(args, si).filter((v) => v === null || v === '').length;
      case 'IF': {
        need(1, 3);
        const cond = toBool(this.val(args[0]!, si));
        const branch = cond ? args[1] : args[2];
        if (!branch) return cond;
        return this.eval(branch, si);
      }
      case 'IFERROR': {
        need(2, 2);
        try {
          const v = this.scalar(this.eval(args[0]!, si));
          if (isError(v)) return this.eval(args[1]!, si);
          return v;
        } catch (e) {
          if (e instanceof FormulaError) return this.eval(args[1]!, si);
          throw e;
        }
      }
      case 'AND':
      case 'OR': {
        const bools = this.values(args, si)
          .filter((v) => v !== null && !(typeof v === 'string' && !/^(true|false)$/i.test(v)))
          .map(toBool);
        if (!bools.length) throw new FormulaError(VALUE);
        return name === 'AND' ? bools.every(Boolean) : bools.some(Boolean);
      }
      case 'NOT':
        need(1, 1);
        return !toBool(this.val(args[0]!, si));
      case 'ROUND':
      case 'ROUNDUP':
      case 'ROUNDDOWN': {
        need(1, 2);
        const mode = name === 'ROUND' ? 'half' : name === 'ROUNDUP' ? 'up' : 'down';
        const x = this.val(args[0]!, si);
        // UNIT-003: a quantity is rounded in the unit it is shown in.
        if (isQty(x) && !dimensionless(x)) {
          const d = qDisplay(x);
          return quantity(round(d.value, n(1), mode), d.unit)!;
        }
        return round(toNumber(x), n(1), mode);
      }
      case 'INT':
        need(1, 1);
        return Math.floor(n(0));
      case 'ABS': {
        need(1, 1);
        const x = this.val(args[0]!, si);
        if (isQty(x)) return { ...x, v: Math.abs(x.v) };
        return Math.abs(toNumber(x));
      }
      case 'SQRT': {
        need(1, 1);
        const x = this.val(args[0]!, si);
        if (isQty(x) && !dimensionless(x)) {
          if (x.v < 0) throw new FormulaError(err('#NUM!'));
          return qPow(x, 0.5)!;
        }
        const y = toNumber(x);
        if (y < 0) throw new FormulaError(err('#NUM!'));
        return Math.sqrt(y);
      }
      case 'POWER': {
        need(2, 2);
        const x = this.val(args[0]!, si);
        if (isQty(x) && !dimensionless(x)) return this.quantityOp('^', x, this.val(args[1]!, si));
        return toNumber(x) ** n(1);
      }
      case 'MOD': {
        need(2, 2);
        const d = n(1);
        if (d === 0) throw new FormulaError(DIV0);
        const x = n(0);
        return x - d * Math.floor(x / d);
      }
      case 'PI':
        return Math.PI;
      // SHEET-024: mathematics and trigonometry.
      case 'EXP':
      case 'LN':
      case 'LOG10':
      case 'SIN':
      case 'COS':
      case 'TAN':
      case 'ASIN':
      case 'ACOS':
      case 'ATAN':
      case 'SINH':
      case 'COSH':
      case 'TANH':
      case 'DEGREES':
      case 'RADIANS':
      case 'SIGN': {
        need(1, 1);
        return finite(MATH[name]!(n(0)));
      }
      case 'LOG': {
        need(1, 2);
        const base = args.length > 1 ? n(1) : 10;
        return finite(Math.log(n(0)) / Math.log(base));
      }
      case 'ATAN2': {
        need(2, 2);
        const [x, y] = [n(0), n(1)];
        if (x === 0 && y === 0) throw new FormulaError(DIV0);
        return Math.atan2(y, x);
      }
      // SHEET-024: statistics and linear regression.
      case 'VAR':
      case 'VARP':
      case 'STDEV':
      case 'STDEVP': {
        const xs = this.numbers(args, si);
        const sample = !name.endsWith('P');
        if (xs.length < (sample ? 2 : 1)) throw new FormulaError(DIV0);
        const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
        const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - (sample ? 1 : 0));
        return name.startsWith('STDEV') ? Math.sqrt(v) : v;
      }
      case 'SUMSQ':
        return this.numbers(args, si).reduce((a, b) => a + b * b, 0);
      case 'SLOPE':
      case 'INTERCEPT':
      case 'RSQ':
      case 'CORREL': {
        need(2, 2);
        // SLOPE(known_y, known_x); CORREL(array1, array2).
        const ys = this.rangeArg(args[0], si).flat();
        const xs = this.rangeArg(args[1], si).flat();
        if (ys.length !== xs.length) throw new FormulaError(NA);
        const pairs = ys.flatMap((y, i) => (typeof y === 'number' && typeof xs[i] === 'number' ? [[xs[i] as number, y] as const] : []));
        if (pairs.length < 2) throw new FormulaError(DIV0);
        const mx = pairs.reduce((a, [x]) => a + x, 0) / pairs.length;
        const my = pairs.reduce((a, [, y]) => a + y, 0) / pairs.length;
        let sxy = 0;
        let sxx = 0;
        let syy = 0;
        for (const [x, y] of pairs) {
          sxy += (x - mx) * (y - my);
          sxx += (x - mx) ** 2;
          syy += (y - my) ** 2;
        }
        if (sxx === 0 || ((name === 'RSQ' || name === 'CORREL') && syy === 0)) throw new FormulaError(DIV0);
        const slope = sxy / sxx;
        if (name === 'SLOPE') return slope;
        if (name === 'INTERCEPT') return my - slope * mx;
        const r = sxy / Math.sqrt(sxx * syy);
        return name === 'RSQ' ? r * r : r;
      }
      case 'CONCAT':
      case 'CONCATENATE':
        return this.values(args, si).map(toText).join('');
      case 'LEN':
        need(1, 1);
        return s(0).length;
      case 'UPPER':
        need(1, 1);
        return s(0).toUpperCase();
      case 'LOWER':
        need(1, 1);
        return s(0).toLowerCase();
      case 'TRIM':
        need(1, 1);
        return s(0).trim().replace(/ {2,}/g, ' ');
      case 'LEFT':
        need(1, 2);
        return s(0).slice(0, args.length > 1 ? n(1) : 1);
      case 'RIGHT': {
        need(1, 2);
        const len = args.length > 1 ? n(1) : 1;
        return len <= 0 ? '' : s(0).slice(-len);
      }
      case 'MID':
        need(3, 3);
        return s(0).substr(n(1) - 1, n(2));
      case 'ISBLANK':
        need(1, 1);
        return this.scalar(this.eval(args[0]!, si)) === null;
      case 'ISNUMBER':
        need(1, 1);
        return typeof this.scalar(this.eval(args[0]!, si)) === 'number';
      case 'ISTEXT':
        need(1, 1);
        return typeof this.scalar(this.eval(args[0]!, si)) === 'string';
      case 'TODAY': {
        const d = new Date();
        return dateToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate());
      }
      case 'NOW': {
        const d = new Date();
        return dateToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
      }
      case 'YEAR':
        return serialToDate(n(0)).getUTCFullYear();
      case 'MONTH':
        return serialToDate(n(0)).getUTCMonth() + 1;
      case 'DAY':
        return serialToDate(n(0)).getUTCDate();
      case 'DATE':
        need(3, 3);
        return dateToSerial(n(0), n(1), n(2));
      case 'COUNTIF': {
        need(2, 2);
        const test = matcher(this.val(args[1]!, si));
        return this.rangeArg(args[0], si).flat().filter(test).length;
      }
      case 'SUMIF': {
        need(2, 3);
        const crit = this.rangeArg(args[0], si);
        const sum = args[2] ? this.rangeArg(args[2], si) : crit;
        const test = matcher(this.val(args[1]!, si));
        let total = 0;
        crit.forEach((row, r) =>
          row.forEach((v, c) => {
            const x = sum[r]?.[c];
            if (test(v) && typeof x === 'number') total += x;
          }),
        );
        return total;
      }
      case 'VLOOKUP': {
        need(3, 4);
        const needle = this.val(args[0]!, si);
        const table = this.rangeArg(args[1], si);
        const col = n(2);
        const approx = args[3] ? toBool(this.val(args[3], si)) : true;
        if (col < 1 || col > (table[0]?.length ?? 0)) throw new FormulaError(REF);
        let found = -1;
        for (let r = 0; r < table.length; r++) {
          const v = table[r]![0] ?? null;
          if (isError(v) || v === null) continue;
          const c = compare(v, needle);
          if (c === 0) {
            found = r;
            break;
          }
          if (approx && c < 0) found = r;
          if (approx && c > 0) break;
        }
        if (found < 0) throw new FormulaError(NA);
        return table[found]![col - 1] ?? null;
      }

      // SHEET-025: logic and information.
      case 'TRUE':
        return true;
      case 'FALSE':
        return false;
      case 'NA':
        throw new FormulaError(NA);
      case 'XOR':
        return this.values(args, si).filter((v) => v !== null).map(toBool).filter(Boolean).length % 2 === 1;
      case 'IFS': {
        if (!args.length || args.length % 2) throw new FormulaError(VALUE);
        for (let i = 0; i < args.length; i += 2) if (toBool(this.val(args[i]!, si))) return this.eval(args[i + 1]!, si);
        throw new FormulaError(NA);
      }
      case 'SWITCH': {
        need(3);
        const v = this.val(args[0]!, si);
        let i = 1;
        for (; i + 1 < args.length; i += 2) if (compare(v, this.val(args[i]!, si)) === 0) return this.eval(args[i + 1]!, si);
        if (i < args.length) return this.eval(args[i]!, si);
        throw new FormulaError(NA);
      }
      case 'IFNA': {
        need(2, 2);
        const v = this.caught(args[0]!, si);
        return isError(v) && v.error === '#N/A' ? this.eval(args[1]!, si) : v;
      }
      case 'ISERROR':
      case 'ISERR':
      case 'ISNA': {
        need(1, 1);
        const v = this.caught(args[0]!, si);
        if (!isError(v)) return false;
        return name === 'ISERROR' || (name === 'ISNA' ? v.error === '#N/A' : v.error !== '#N/A');
      }
      case 'ISLOGICAL':
        need(1, 1);
        return typeof this.scalar(this.eval(args[0]!, si)) === 'boolean';
      case 'ISNONTEXT':
        need(1, 1);
        return typeof this.scalar(this.eval(args[0]!, si)) !== 'string';
      case 'ISEVEN':
      case 'ISODD':
        need(1, 1);
        return (Math.abs(Math.trunc(n(0))) % 2 === 0) === (name === 'ISEVEN');
      // SHEET-025: mathematics.
      case 'TRUNC': {
        need(1, 2);
        const m = 10 ** (args.length > 1 ? Math.trunc(n(1)) : 0);
        return Math.trunc(n(0) * m) / m;
      }
      case 'CEILING':
      case 'FLOOR':
      case 'CEILING.MATH':
      case 'FLOOR.MATH':
      case 'MROUND': {
        need(1, 3);
        const x = n(0);
        const step = Math.abs(args.length > 1 ? n(1) : 1);
        if (step === 0) return 0;
        if (name === 'MROUND') {
          if (x * (args.length > 1 ? n(1) : 1) < 0) throw new FormulaError(err('#NUM!'));
          return round(Math.round(x / step) * step, 12);
        }
        const up = name.startsWith('CEILING');
        return round((up ? Math.ceil(x / step - 1e-12) : Math.floor(x / step + 1e-12)) * step, 12);
      }
      case 'EVEN':
      case 'ODD': {
        need(1, 1);
        const x = n(0);
        const sign = x < 0 ? -1 : 1;
        let k = Math.ceil(Math.abs(x));
        if (name === 'EVEN' ? k % 2 : k % 2 === 0) k++;
        if (name === 'ODD' && k === 0) k = 1;
        return sign * k;
      }
      case 'FACT': {
        need(1, 1);
        const x = Math.trunc(n(0));
        if (x < 0) throw new FormulaError(err('#NUM!'));
        let f = 1;
        for (let i = 2; i <= x; i++) f *= i;
        return finite(f);
      }
      case 'COMBIN':
      case 'PERMUT': {
        need(2, 2);
        const [m, k] = [Math.trunc(n(0)), Math.trunc(n(1))];
        if (m < 0 || k < 0 || k > m) throw new FormulaError(err('#NUM!'));
        let r = 1;
        for (let i = 0; i < k; i++) r *= (m - i) / (name === 'COMBIN' ? i + 1 : 1);
        return Math.round(r);
      }
      case 'GCD':
      case 'LCM': {
        const xs = this.numbers(args, si).map((x) => Math.trunc(x));
        if (xs.some((x) => x < 0)) throw new FormulaError(err('#NUM!'));
        const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
        if (name === 'GCD') return xs.reduce(gcd, 0);
        return xs.reduce((a, b) => (a === 0 || b === 0 ? 0 : (a / gcd(a, b)) * b), 1);
      }
      case 'QUOTIENT': {
        need(2, 2);
        const d = n(1);
        if (d === 0) throw new FormulaError(DIV0);
        return Math.trunc(n(0) / d);
      }
      case 'RAND':
        return Math.random();
      case 'RANDBETWEEN': {
        need(2, 2);
        const [lo, hi] = [Math.ceil(n(0)), Math.floor(n(1))];
        if (lo > hi) throw new FormulaError(err('#NUM!'));
        return lo + Math.floor(Math.random() * (hi - lo + 1));
      }
      case 'SUMPRODUCT': {
        need(1);
        const arrays = args.map((a) => this.rangeArg(a, si).flat());
        const len = arrays[0]!.length;
        if (arrays.some((a) => a.length !== len)) throw new FormulaError(VALUE);
        let total = 0;
        for (let i = 0; i < len; i++) total += arrays.reduce((p, a) => p * (typeof a[i] === 'number' ? (a[i] as number) : 0), 1);
        return total;
      }
      // SHEET-025: conditional aggregates, several criteria.
      case 'COUNTIFS':
      case 'SUMIFS':
      case 'AVERAGEIFS':
      case 'MAXIFS':
      case 'MINIFS':
      case 'AVERAGEIF': {
        const single = name === 'AVERAGEIF';
        if (single) need(2, 3);
        const counting = name === 'COUNTIFS';
        const target = counting ? undefined : this.rangeArg(single ? (args[2] ?? args[0]) : args[0], si).flat();
        const start = counting || single ? 0 : 1;
        const pairs: { cells: V[]; test: (v: V) => boolean }[] = [];
        if (single) pairs.push({ cells: this.rangeArg(args[0], si).flat(), test: matcher(this.val(args[1]!, si)) });
        else {
          if (args.length - start < 2 || (args.length - start) % 2) throw new FormulaError(VALUE);
          for (let i = start; i < args.length; i += 2) pairs.push({ cells: this.rangeArg(args[i], si).flat(), test: matcher(this.val(args[i + 1]!, si)) });
        }
        const size = pairs[0]!.cells.length;
        if (pairs.some((p) => p.cells.length !== size) || (target && target.length !== size)) throw new FormulaError(VALUE);
        const hits: number[] = [];
        let count = 0;
        for (let i = 0; i < size; i++) {
          if (!pairs.every((p) => p.test(p.cells[i] ?? null))) continue;
          count++;
          const x = target?.[i];
          if (typeof x === 'number') hits.push(x);
        }
        if (counting) return count;
        if (name === 'SUMIFS') return hits.reduce((a, b) => a + b, 0);
        if (name === 'MAXIFS') return hits.length ? Math.max(...hits) : 0;
        if (name === 'MINIFS') return hits.length ? Math.min(...hits) : 0;
        if (!hits.length) throw new FormulaError(DIV0);
        return hits.reduce((a, b) => a + b, 0) / hits.length;
      }
      // SHEET-025: statistics.
      case 'LARGE':
      case 'SMALL': {
        need(2, 2);
        const xs = this.numbers([args[0]!], si).sort((a, b) => (name === 'LARGE' ? b - a : a - b));
        const k = Math.trunc(n(1));
        if (k < 1 || k > xs.length) throw new FormulaError(err('#NUM!'));
        return xs[k - 1]!;
      }
      case 'RANK':
      case 'RANK.EQ': {
        need(2, 3);
        const x = n(0);
        const xs = this.numbers([args[1]!], si);
        const ascending = args.length > 2 && n(2) !== 0;
        if (!xs.includes(x)) throw new FormulaError(NA);
        return 1 + xs.filter((y) => (ascending ? y < x : y > x)).length;
      }
      case 'MODE':
      case 'MODE.SNGL': {
        const xs = this.numbers(args, si);
        const counts = new Map<number, number>();
        let best: number | undefined;
        let most = 1;
        for (const x of xs) {
          const c = (counts.get(x) ?? 0) + 1;
          counts.set(x, c);
          if (c > most) [best, most] = [x, c];
        }
        if (best === undefined) throw new FormulaError(NA);
        return best;
      }
      case 'PERCENTILE':
      case 'PERCENTILE.INC':
      case 'QUARTILE':
      case 'QUARTILE.INC': {
        need(2, 2);
        const xs = this.numbers([args[0]!], si).sort((a, b) => a - b);
        const p = name.startsWith('QUARTILE') ? Math.trunc(n(1)) / 4 : n(1);
        if (!xs.length || p < 0 || p > 1) throw new FormulaError(err('#NUM!'));
        const h = (xs.length - 1) * p;
        const lo = Math.floor(h);
        return xs[lo]! + (h - lo) * ((xs[lo + 1] ?? xs[lo]!) - xs[lo]!);
      }
      case 'GEOMEAN': {
        const xs = this.numbers(args, si);
        if (!xs.length || xs.some((x) => x <= 0)) throw new FormulaError(err('#NUM!'));
        return Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
      }
      case 'AVERAGEA': {
        const vs = this.values(args, si).filter((v) => v !== null);
        if (!vs.length) throw new FormulaError(DIV0);
        return vs.reduce<number>((a, v) => a + (typeof v === 'number' ? v : v === true ? 1 : 0), 0) / vs.length;
      }
      // SHEET-025: text.
      case 'TEXTJOIN': {
        need(3);
        const sep = s(0);
        const skip = toBool(this.val(args[1]!, si));
        return this.values(args.slice(2), si)
          .filter((v) => !(skip && (v === null || v === '')))
          .map(toText)
          .join(sep);
      }
      case 'SUBSTITUTE': {
        need(3, 4);
        const [text, from, to] = [s(0), s(1), s(2)];
        if (!from) return text;
        if (args.length < 4) return text.split(from).join(to);
        const nth = Math.trunc(n(3));
        let at = -1;
        for (let i = 0; i < nth; i++) {
          at = text.indexOf(from, at + 1);
          if (at < 0) return text;
        }
        return text.slice(0, at) + to + text.slice(at + from.length);
      }
      case 'REPLACE': {
        need(4, 4);
        const text = s(0);
        const start = Math.trunc(n(1)) - 1;
        return text.slice(0, start) + s(3) + text.slice(start + Math.trunc(n(2)));
      }
      case 'FIND':
      case 'SEARCH': {
        need(2, 3);
        const start = args.length > 2 ? Math.trunc(n(2)) - 1 : 0;
        const [needle, hay] = [s(0), s(1)];
        let at: number;
        if (name === 'FIND') at = hay.indexOf(needle, start);
        else {
          const re = new RegExp(needle.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*'), 'i');
          const m = re.exec(hay.slice(start));
          at = m ? start + m.index : -1;
        }
        if (at < 0 || start < 0) throw new FormulaError(VALUE);
        return at + 1;
      }
      case 'REPT': {
        need(2, 2);
        const times = Math.trunc(n(1));
        if (times < 0) throw new FormulaError(VALUE);
        return s(0).repeat(times);
      }
      case 'PROPER':
        need(1, 1);
        return s(0).toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
      case 'EXACT':
        need(2, 2);
        return s(0) === s(1);
      case 'VALUE': {
        need(1, 1);
        const v = this.val(args[0]!, si);
        if (typeof v === 'number') return v;
        const text = toText(v).trim().replace(/\s/g, '').replace(',', '.');
        const pct = text.endsWith('%');
        const x = Number(pct ? text.slice(0, -1) : text);
        if (!text || !Number.isFinite(x)) throw new FormulaError(VALUE);
        return pct ? x / 100 : x;
      }
      case 'TEXT':
        need(2, 2);
        return formatValue(n(0), s(1));
      case 'CHAR':
        need(1, 1);
        return String.fromCharCode(Math.trunc(n(0)));
      case 'CODE': {
        need(1, 1);
        const text = s(0);
        if (!text) throw new FormulaError(VALUE);
        return text.charCodeAt(0);
      }
      case 'CLEAN':
        need(1, 1);
        return s(0).replace(/[\x00-\x1f]/g, '');
      // SHEET-025: lookup and reference.
      case 'CHOOSE': {
        need(2);
        const i = Math.trunc(n(0));
        if (i < 1 || i >= args.length) throw new FormulaError(VALUE);
        return this.eval(args[i]!, si);
      }
      case 'HLOOKUP': {
        need(3, 4);
        const needle = this.val(args[0]!, si);
        const table = this.rangeArg(args[1], si);
        const row = Math.trunc(n(2));
        const approx = args[3] ? toBool(this.val(args[3], si)) : true;
        if (row < 1 || row > table.length) throw new FormulaError(REF);
        const found = lookupIndex(table[0] ?? [], needle, approx ? 1 : 0);
        return table[row - 1]![found] ?? null;
      }
      case 'MATCH': {
        need(2, 3);
        const needle = this.val(args[0]!, si);
        const list = this.rangeArg(args[1], si).flat();
        return lookupIndex(list, needle, args.length > 2 ? Math.sign(n(2)) : 1) + 1;
      }
      case 'INDEX': {
        need(2, 3);
        const table = this.rangeArg(args[0], si);
        let r = Math.trunc(n(1));
        let c = args.length > 2 ? Math.trunc(n(2)) : 1;
        // A single row: the second argument is the column.
        if (args.length === 2 && table.length === 1) [r, c] = [1, r];
        if (r < 1 || c < 1 || r > table.length || c > (table[0]?.length ?? 0)) throw new FormulaError(REF);
        return table[r - 1]![c - 1] ?? null;
      }
      case 'XLOOKUP': {
        need(3, 4);
        const needle = this.val(args[0]!, si);
        const keys = this.rangeArg(args[1], si);
        const results = this.rangeArg(args[2], si);
        const vertical = keys.length > 1 || (keys[0]?.length ?? 0) === 1;
        const list = keys.flat();
        const i = list.findIndex((v) => !isError(v) && v !== null && compare(v, needle) === 0);
        if (i < 0) {
          if (args[3]) return this.eval(args[3], si);
          throw new FormulaError(NA);
        }
        return (vertical ? results[i]?.[0] : results[0]?.[i]) ?? null;
      }
      // SHEET-025: dates and times.
      case 'WEEKDAY': {
        need(1, 2);
        const day = serialToDate(n(0)).getUTCDay();
        const type = args.length > 1 ? Math.trunc(n(1)) : 1;
        if (type === 2) return ((day + 6) % 7) + 1;
        if (type === 3) return (day + 6) % 7;
        return day + 1;
      }
      case 'EDATE':
      case 'EOMONTH': {
        need(2, 2);
        const d = serialToDate(n(0));
        const months = Math.trunc(n(1));
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth() + months;
        if (name === 'EOMONTH') return dateToSerial(y, m + 2, 0);
        const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        return dateToSerial(y, m + 1, Math.min(d.getUTCDate(), last));
      }
      case 'DAYS':
        need(2, 2);
        return Math.trunc(n(0)) - Math.trunc(n(1));
      case 'HOUR':
      case 'MINUTE':
      case 'SECOND': {
        need(1, 1);
        const secs = Math.round((n(0) - Math.floor(n(0))) * 86400);
        return name === 'HOUR' ? Math.floor(secs / 3600) % 24 : name === 'MINUTE' ? Math.floor(secs / 60) % 60 : secs % 60;
      }
      case 'TIME':
        need(3, 3);
        return ((n(0) * 3600 + n(1) * 60 + n(2)) / 86400) % 1;
      case 'NETWORKDAYS': {
        need(2, 3);
        let [a, b] = [Math.trunc(n(0)), Math.trunc(n(1))];
        const sign = a <= b ? 1 : -1;
        if (sign < 0) [a, b] = [b, a];
        const holidays = new Set(args[2] ? this.numbers([args[2]], si).map(Math.trunc) : []);
        let count = 0;
        for (let d = a; d <= b; d++) {
          const day = serialToDate(d).getUTCDay();
          if (day !== 0 && day !== 6 && !holidays.has(d)) count++;
        }
        return sign * count;
      }
      case 'DATEDIF': {
        need(3, 3);
        const [a, b] = [Math.trunc(n(0)), Math.trunc(n(1))];
        if (a > b) throw new FormulaError(err('#NUM!'));
        const unit = s(2).toUpperCase();
        if (unit === 'D') return b - a;
        const [da, db] = [serialToDate(a), serialToDate(b)];
        let months = (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + db.getUTCMonth() - da.getUTCMonth();
        if (db.getUTCDate() < da.getUTCDate()) months--;
        if (unit === 'M') return months;
        if (unit === 'Y') return Math.floor(months / 12);
        if (unit === 'YM') return months % 12;
        throw new FormulaError(err('#NUM!'));
      }
      default:
        throw new FormulaError(NAME);
    }
  }
}

export type { Scalar };
