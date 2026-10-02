/** Formula evaluation with caching and cycle detection (SHEET-006..008). */
import { cellKey, parseKey, parseRef } from './address';
import { FormulaSyntaxError, parseFormula, type Ast } from './formula';
import { isError, serialToDate, dateToSerial, type ErrorValue, type Scalar, type Value, type Workbook } from './model';

type Range = { range: Value[][] };
type EvalResult = Value | Range;

const err = (e: string): ErrorValue => ({ error: e });
const DIV0 = err('#DIV/0!');
const VALUE = err('#VALUE!');
const NAME = err('#NAME?');
const REF = err('#REF!');
const NA = err('#N/A');
const CYCLE = err('#CYCLE!');
const SYNTAX = err('#ERROR!');

const isRange = (v: EvalResult): v is Range => typeof v === 'object' && v !== null && 'range' in v;

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

export function toNumber(v: Value): number {
  if (isError(v)) throw new FormulaError(v);
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v.trim());
  if (v.trim() !== '' && Number.isFinite(n)) return n;
  throw new FormulaError(VALUE);
}

export function toText(v: Value): string {
  if (isError(v)) throw new FormulaError(v);
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return formatGeneral(v);
  return v;
}

function toBool(v: Value): boolean {
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

function compare(a: Value, b: Value): number {
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

function matcher(criteria: Value): (v: Value) => boolean {
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

// --- calculator -----------------------------------------------------------------

export class Calculator {
  private cache = new Map<string, Value>();
  private computing = new Set<string>();
  private parsed = new Map<string, Ast | ErrorValue>();

  constructor(private readonly wb: Workbook) {}

  /** Forget computed values (call after any edit). */
  invalidate(): void {
    this.cache.clear();
  }

  /** Computed value of a cell (A1 reference or [row, col]). */
  value(sheetIndex: number, ref: string | [number, number]): Value {
    const [row, col] = Array.isArray(ref) ? ref : (() => {
      const r = parseRef(ref);
      if (!r) throw new Error(`Invalid reference ${ref}`);
      return [r.row, r.col] as const;
    })();
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

  private cell(si: number, row: number, col: number): Value {
    const sheet = this.wb.sheets[si];
    if (!sheet) return REF;
    const key = `${si}:${cellKey(row, col)}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const cell = sheet.cells.get(cellKey(row, col));
    if (!cell) return null;
    if (cell.formula === undefined) return cell.value;
    if (this.computing.has(key)) return CYCLE;
    this.computing.add(key);
    let result: Value;
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
  private scalar(v: EvalResult): Value {
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
        const n = toNumber(this.val(ast.e, si));
        return ast.op === '-' ? -n : n;
      }
      case 'bin':
        return this.binary(ast.op, this.val(ast.l, si), this.val(ast.r, si));
      case 'call':
        return this.call(ast.name, ast.args, si);
    }
  }

  /** Evaluate to a scalar, propagating errors. */
  private val(ast: Ast, si: number): Value {
    const v = this.scalar(this.eval(ast, si));
    if (isError(v)) throw new FormulaError(v);
    return v;
  }

  private range(si: number, r1: number, c1: number, r2: number, c2: number): Value[][] {
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
    const out: Value[][] = [];
    for (let r = r1; r <= r2; r++) {
      const row: Value[] = [];
      for (let c = c1; c <= c2; c++) row.push(this.cell(si, r, c));
      out.push(row);
    }
    return out;
  }

  private binary(op: string, a: Value, b: Value): Value {
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

  /** Numbers from arguments: ranges contribute numbers only, scalars are coerced. */
  private numbers(args: Ast[], si: number): number[] {
    const out: number[] = [];
    for (const a of args) {
      const v = this.eval(a, si);
      if (isRange(v)) {
        for (const row of v.range) for (const x of row) {
          if (isError(x)) throw new FormulaError(x);
          if (typeof x === 'number') out.push(x);
        }
      } else {
        out.push(toNumber(v));
      }
    }
    return out;
  }

  private values(args: Ast[], si: number): Value[] {
    const out: Value[] = [];
    for (const a of args) {
      const v = this.eval(a, si);
      if (isRange(v)) for (const row of v.range) out.push(...row);
      else out.push(v);
    }
    return out;
  }

  private rangeArg(a: Ast | undefined, si: number): Value[][] {
    if (!a) throw new FormulaError(VALUE);
    const v = this.eval(a, si);
    return isRange(v) ? v.range : [[v]];
  }

  private call(name: string, args: Ast[], si: number): EvalResult {
    const n = (i: number): number => toNumber(this.val(args[i] ?? { t: 'num', v: 0 }, si));
    const s = (i: number): string => toText(this.val(args[i] ?? { t: 'str', v: '' }, si));
    const need = (min: number, max = Infinity): void => {
      if (args.length < min || args.length > max) throw new FormulaError(VALUE);
    };
    switch (name) {
      case 'SUM':
        return this.numbers(args, si).reduce((a, b) => a + b, 0);
      case 'PRODUCT':
        return this.numbers(args, si).reduce((a, b) => a * b, 1);
      case 'AVERAGE': {
        const xs = this.numbers(args, si);
        if (!xs.length) throw new FormulaError(DIV0);
        return xs.reduce((a, b) => a + b, 0) / xs.length;
      }
      case 'MIN': {
        const xs = this.numbers(args, si);
        return xs.length ? Math.min(...xs) : 0;
      }
      case 'MAX': {
        const xs = this.numbers(args, si);
        return xs.length ? Math.max(...xs) : 0;
      }
      case 'MEDIAN': {
        const xs = this.numbers(args, si).sort((a, b) => a - b);
        if (!xs.length) throw new FormulaError(NA);
        const mid = Math.floor(xs.length / 2);
        return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
      }
      case 'COUNT':
        return this.values(args, si).filter((v) => typeof v === 'number').length;
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
        need(1, 2);
        return round(n(0), n(1));
      case 'ROUNDUP':
        need(1, 2);
        return round(n(0), n(1), 'up');
      case 'ROUNDDOWN':
        need(1, 2);
        return round(n(0), n(1), 'down');
      case 'INT':
        need(1, 1);
        return Math.floor(n(0));
      case 'ABS':
        need(1, 1);
        return Math.abs(n(0));
      case 'SQRT': {
        need(1, 1);
        const x = n(0);
        if (x < 0) throw new FormulaError(err('#NUM!'));
        return Math.sqrt(x);
      }
      case 'POWER':
        need(2, 2);
        return n(0) ** n(1);
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
      default:
        throw new FormulaError(NAME);
    }
  }
}

export type { Scalar };
