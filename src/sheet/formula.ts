/**
 * Formula language (Excel A1 syntax): lexer, parser and reference rewriting
 * (copy translation, row/column insertion and deletion).
 */
import { colIndex, colName, MAX_COLS, MAX_ROWS, quoteSheet } from './address';

export interface RefPart {
  row?: number;
  col?: number;
  absRow: boolean;
  absCol: boolean;
}

export interface RefToken {
  type: 'ref';
  sheet?: string;
  a: RefPart;
  b?: RefPart;
  kind: 'cell' | 'range' | 'cols' | 'rows';
}

type TokenBody =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'err'; value: string }
  | { type: 'name'; value: string }
  | { type: 'op'; value: string }
  | { type: '(' | ')' | ',' }
  | RefToken;

export type Token = { start: number; end: number; text: string } & TokenBody;

export type Ast =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'err'; v: string }
  | { t: 'ref'; sheet?: string; r1: number; c1: number; r2: number; c2: number; single: boolean }
  | { t: 'un'; op: string; e: Ast }
  | { t: 'bin'; op: string; l: Ast; r: Ast }
  | { t: 'pct'; e: Ast }
  | { t: 'call'; name: string; args: Ast[] };

export class FormulaSyntaxError extends Error {}

const SHEET = String.raw`(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!`;
const CELL = String.raw`(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})`;
const REF_RE = new RegExp(
  String.raw`^(?:${SHEET})?(?:${CELL}(?::${CELL})?|(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})|(\$?)(\d{1,7}):(\$?)(\d{1,7}))`,
);
const ERRORS = ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#N/A', '#NUM!', '#NULL!', '#ERROR!', '#CYCLE!'];

function part(absCol: string | undefined, col: string | undefined, absRow: string | undefined, row: string | undefined): RefPart {
  const p: RefPart = { absCol: absCol === '$', absRow: absRow === '$' };
  if (col !== undefined) p.col = colIndex(col);
  if (row !== undefined) p.row = Number(row) - 1;
  return p;
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const start = i;
    const rest = src.slice(i);
    const push = (t: TokenBody, len: number): void => {
      tokens.push({ ...(t as object), start, end: start + len, text: src.slice(start, start + len) } as Token);
      i = start + len;
    };
    if (ch === '"') {
      let j = i + 1;
      let value = '';
      for (;;) {
        if (j >= src.length) throw new FormulaSyntaxError('Unterminated string');
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            value += '"';
            j += 2;
            continue;
          }
          break;
        }
        value += src[j++];
      }
      push({ type: 'str', value }, j + 1 - i);
      continue;
    }
    if (ch === '#') {
      const err = ERRORS.find((e) => rest.toUpperCase().startsWith(e));
      if (!err) throw new FormulaSyntaxError(`Unknown error literal at ${i}`);
      push({ type: 'err', value: err }, err.length);
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest);
    const ref = REF_RE.exec(rest);
    if (ref && !/^[A-Za-z0-9_.(]/.test(rest.slice(ref[0].length)) && (!num || ref[0].length > num[0].length)) {
      const m = ref;
      const sheet = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2];
      let tok: RefToken;
      if (m[6] !== undefined) {
        const a = part(m[3], m[4], m[5], m[6]);
        tok = m[10] !== undefined ? { type: 'ref', kind: 'range', a, b: part(m[7], m[8], m[9], m[10]) } : { type: 'ref', kind: 'cell', a };
      } else if (m[12] !== undefined) {
        tok = { type: 'ref', kind: 'cols', a: part(m[11], m[12], undefined, undefined), b: part(m[13], m[14], undefined, undefined) };
      } else {
        tok = { type: 'ref', kind: 'rows', a: part(undefined, undefined, m[15], m[16]), b: part(undefined, undefined, m[17], m[18]) };
      }
      if (sheet !== undefined) tok.sheet = sheet;
      push(tok, m[0].length);
      continue;
    }
    if (num) {
      push({ type: 'num', value: Number(num[0]) }, num[0].length);
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
    if (name) {
      const upper = name[0].toUpperCase();
      if ((upper === 'TRUE' || upper === 'FALSE') && rest[name[0].length] !== '(') push({ type: 'bool', value: upper === 'TRUE' }, name[0].length);
      else push({ type: 'name', value: upper }, name[0].length);
      continue;
    }
    const op = /^(<>|<=|>=|[-+*/^&=<>%])/.exec(rest);
    if (op) {
      push({ type: 'op', value: op[0] }, op[0].length);
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',' || ch === ';') {
      push({ type: ch === ';' ? ',' : (ch as '(' | ')' | ',') }, 1);
      continue;
    }
    throw new FormulaSyntaxError(`Unexpected character "${ch}" at ${i}`);
  }
  return tokens;
}

// --- parser -------------------------------------------------------------------

const BINARY: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };

export function parseFormula(src: string): Ast {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];

  const primary = (): Ast => {
    const tok = tokens[pos++];
    if (!tok) throw new FormulaSyntaxError('Unexpected end of formula');
    switch (tok.type) {
      case 'num':
        return { t: 'num', v: tok.value };
      case 'str':
        return { t: 'str', v: tok.value };
      case 'bool':
        return { t: 'bool', v: tok.value };
      case 'err':
        return { t: 'err', v: tok.value };
      case 'ref':
        return refAst(tok);
      case 'op':
        if (tok.value === '-' || tok.value === '+') return { t: 'un', op: tok.value, e: postfix(primary()) };
        break;
      case '(': {
        const e = expr(0);
        if (peek()?.type !== ')') throw new FormulaSyntaxError('Missing )');
        pos++;
        return e;
      }
      case 'name': {
        if (peek()?.type !== '(') {
          if (tok.value === 'PI') return { t: 'call', name: 'PI', args: [] };
          return { t: 'err', v: '#NAME?' };
        }
        pos++;
        const args: Ast[] = [];
        if (peek()?.type === ')') {
          pos++;
          return { t: 'call', name: tok.value, args };
        }
        for (;;) {
          if (peek()?.type === ',' || peek()?.type === ')') args.push({ t: 'str', v: '' });
          else args.push(expr(0));
          const sep = tokens[pos++];
          if (sep?.type === ')') break;
          if (sep?.type !== ',') throw new FormulaSyntaxError('Expected , or )');
        }
        return { t: 'call', name: tok.value, args };
      }
      default:
        break;
    }
    throw new FormulaSyntaxError(`Unexpected "${tok.text}"`);
  };

  const postfix = (e: Ast): Ast => {
    while (peek()?.type === 'op' && (peek() as { value: string }).value === '%') {
      pos++;
      e = { t: 'pct', e };
    }
    return e;
  };

  const expr = (minPrec: number): Ast => {
    let left = postfix(primary());
    for (;;) {
      const tok = peek();
      if (tok?.type !== 'op') break;
      const prec = BINARY[tok.value];
      if (prec === undefined || prec < minPrec) break;
      pos++;
      // all binary operators are left-associative (like Excel, including ^)
      const right = expr(prec + 1);
      left = { t: 'bin', op: tok.value, l: left, r: right };
    }
    return left;
  };

  const ast = expr(0);
  if (pos < tokens.length) throw new FormulaSyntaxError(`Unexpected "${tokens[pos]!.text}"`);
  return ast;
}

function refAst(tok: RefToken): Ast {
  const sheet = tok.sheet !== undefined ? { sheet: tok.sheet } : {};
  if (tok.kind === 'cell') return { t: 'ref', ...sheet, r1: tok.a.row!, c1: tok.a.col!, r2: tok.a.row!, c2: tok.a.col!, single: true };
  if (tok.kind === 'cols') {
    return { t: 'ref', ...sheet, r1: 0, r2: MAX_ROWS - 1, c1: Math.min(tok.a.col!, tok.b!.col!), c2: Math.max(tok.a.col!, tok.b!.col!), single: false };
  }
  if (tok.kind === 'rows') {
    return { t: 'ref', ...sheet, c1: 0, c2: MAX_COLS - 1, r1: Math.min(tok.a.row!, tok.b!.row!), r2: Math.max(tok.a.row!, tok.b!.row!), single: false };
  }
  return {
    t: 'ref',
    ...sheet,
    r1: Math.min(tok.a.row!, tok.b!.row!),
    r2: Math.max(tok.a.row!, tok.b!.row!),
    c1: Math.min(tok.a.col!, tok.b!.col!),
    c2: Math.max(tok.a.col!, tok.b!.col!),
    single: false,
  };
}

// --- reference rewriting --------------------------------------------------------

function partText(p: RefPart): string {
  return `${p.col !== undefined ? `${p.absCol ? '$' : ''}${colName(p.col)}` : ''}${p.row !== undefined ? `${p.absRow ? '$' : ''}${p.row + 1}` : ''}`;
}

export function refText(tok: RefToken): string {
  const prefix = tok.sheet !== undefined ? `${quoteSheet(tok.sheet)}!` : '';
  return prefix + partText(tok.a) + (tok.b ? `:${partText(tok.b)}` : '');
}

/** Rewrite every reference token with `fn`; return null from fn for #REF!. */
function rewriteRefs(formula: string, fn: (tok: RefToken) => RefToken | null): string {
  let tokens: Token[];
  try {
    tokens = tokenize(formula);
  } catch {
    return formula;
  }
  let out = '';
  let last = 0;
  for (const tok of tokens) {
    if (tok.type !== 'ref') continue;
    const next = fn(structuredClone(tok));
    out += formula.slice(last, tok.start) + (next ? refText(next) : '#REF!');
    last = tok.end;
  }
  return out + formula.slice(last);
}

const valid = (p: RefPart): boolean =>
  (p.row === undefined || (p.row >= 0 && p.row < MAX_ROWS)) && (p.col === undefined || (p.col >= 0 && p.col < MAX_COLS));

/** Move relative references by (dRow, dCol), as when copying a formula. */
export function translateFormula(formula: string, dRow: number, dCol: number): string {
  return rewriteRefs(formula, (tok) => {
    for (const p of [tok.a, tok.b]) {
      if (!p) continue;
      if (p.row !== undefined && !p.absRow) p.row += dRow;
      if (p.col !== undefined && !p.absCol) p.col += dCol;
      if (!valid(p)) return null;
    }
    return tok;
  });
}

export interface ShiftOptions {
  /** Sheet containing the formula (unqualified references point to it). */
  formulaSheet?: string;
  /** Sheet where rows/columns are inserted or deleted. */
  targetSheet?: string;
}

/**
 * Adjust references after inserting (`count` > 0) or deleting (`count` < 0)
 * rows or columns starting at `index`.
 */
export function shiftFormula(formula: string, axis: 'rows' | 'cols', index: number, count: number, opts: ShiftOptions = {}): string {
  const key = axis === 'rows' ? 'row' : 'col';
  return rewriteRefs(formula, (tok) => {
    const sheet = tok.sheet ?? opts.formulaSheet;
    if (sheet !== opts.targetSheet) return tok;
    if ((axis === 'rows' && tok.kind === 'cols') || (axis === 'cols' && tok.kind === 'rows')) return tok;
    const shift = (v: number, isEnd: boolean): number | null => {
      if (count > 0) return v >= index ? v + count : v;
      const delEnd = index - count; // exclusive
      if (v < index) return v;
      if (v >= delEnd) return v + count;
      if (!tok.b) return null; // single cell deleted
      return isEnd ? index - 1 : index;
    };
    const a = tok.a[key];
    const b = tok.b?.[key];
    if (a !== undefined) {
      const na = shift(a, false);
      if (na === null) return null;
      tok.a[key] = na;
    }
    if (tok.b && b !== undefined) {
      const nb = shift(b, true);
      if (nb === null) return null;
      tok.b[key] = nb;
      if (tok.a[key] !== undefined && tok.a[key]! > nb) return null;
    }
    return tok;
  });
}
