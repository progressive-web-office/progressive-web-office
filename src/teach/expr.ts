/**
 * Arithmetic expressions of random variants (TEACH-002): numbers, variables,
 * + - * / ^ %, parentheses and common functions. No code is evaluated.
 */

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  round: (x, n = 0) => Math.round(x * 10 ** n) / 10 ** n,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export class ExprError extends Error {}

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const re = /\s*(?:(\d+(?:[.,]\d+)?(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(\*\*|[-+*/^%(),]))/iy;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new ExprError(`Unexpected "${src.slice(i).trim()[0]}"`);
    if (m[1]) out.push({ t: 'num', v: Number(m[1].replace(',', '.')) });
    else if (m[2]) out.push({ t: 'id', v: m[2] });
    else out.push({ t: 'op', v: m[3] === '**' ? '^' : m[3]! });
    i = re.lastIndex;
  }
  return out;
}

/** The value of an expression with these variables. */
export function evaluate(src: string, vars: Record<string, number>): number {
  const tokens = tokenize(src);
  let k = 0;
  const peek = (): Token | undefined => tokens[k];
  const eat = (v: string): boolean => {
    const tok = tokens[k];
    if (tok?.t === 'op' && tok.v === v) {
      k++;
      return true;
    }
    return false;
  };
  const expr = (): number => {
    let v = term();
    for (;;) {
      if (eat('+')) v += term();
      else if (eat('-')) v -= term();
      else return v;
    }
  };
  const term = (): number => {
    let v = unary();
    for (;;) {
      if (eat('*')) v *= unary();
      else if (eat('/')) v /= unary();
      else if (eat('%')) v %= unary();
      else return v;
    }
  };
  const unary = (): number => (eat('-') ? -unary() : eat('+') ? unary() : power());
  const power = (): number => {
    const base = atom();
    return eat('^') ? base ** unary() : base;
  };
  const atom = (): number => {
    const tok = peek();
    if (!tok) throw new ExprError('Incomplete expression');
    k++;
    if (tok.t === 'num') return tok.v;
    if (tok.t === 'op' && tok.v === '(') {
      const v = expr();
      if (!eat(')')) throw new ExprError('Missing ")"');
      return v;
    }
    if (tok.t === 'id') {
      if (eat('(')) {
        const fn = FUNCTIONS[tok.v.toLowerCase()];
        if (!fn) throw new ExprError(`Unknown function ${tok.v}`);
        const args: number[] = [];
        if (!eat(')')) {
          do args.push(expr());
          while (eat(','));
          if (!eat(')')) throw new ExprError('Missing ")"');
        }
        return fn(...args);
      }
      if (tok.v in vars) return vars[tok.v]!;
      if (tok.v.toLowerCase() in CONSTANTS) return CONSTANTS[tok.v.toLowerCase()]!;
      throw new ExprError(`Unknown name ${tok.v}`);
    }
    throw new ExprError(`Unexpected "${tok.v}"`);
  };
  const v = expr();
  if (k < tokens.length) throw new ExprError(`Unexpected "${(tokens[k] as { v: unknown }).v}"`);
  return v;
}
