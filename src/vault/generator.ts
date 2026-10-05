/**
 * VAULT-003: passwords generated on the device, from the browser's random
 * numbers, without bias (rejection sampling), each class asked for present.
 */

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  /** Leave out characters easily mistaken for one another (0 O o 1 l I |). */
  unambiguous: boolean;
}

export const DEFAULT_PASSWORD: PasswordOptions = { length: 20, lower: true, upper: true, digits: true, symbols: true, unambiguous: false };

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&*+-=?@^_~.,:;()[]{}',
} as const;
const AMBIGUOUS = /[0Oo1lI|]/g;

/** A random integer below `n`, without bias. */
function below(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % n;
  }
}

export function generatePassword(o: PasswordOptions = DEFAULT_PASSWORD): string {
  const sets = (Object.keys(SETS) as (keyof typeof SETS)[]).filter((k) => o[k]).map((k) => (o.unambiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]));
  if (!sets.length) throw new Error('No characters to choose from');
  const length = Math.max(o.length, sets.length, 4);
  const all = sets.join('');
  for (;;) {
    let out = '';
    for (let i = 0; i < length; i++) out += all[below(all.length)];
    // Each class asked for is present (drawn again otherwise, rather than forced: no bias).
    if (sets.every((s) => [...out].some((c) => s.includes(c)))) return out;
  }
}

/** The strength of a password, as bits of entropy of a random one of its classes and length (an upper bound). */
export function entropyBits(password: string): number {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/\d/.test(password)) size += 10;
  if (/[^a-zA-Z\d]/.test(password)) size += 32;
  return Math.round(password.length * Math.log2(size || 1));
}
