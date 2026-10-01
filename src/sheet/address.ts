/** A1-style cell addresses (0-based rows/columns internally). */

export interface CellRef {
  row: number;
  col: number;
  absRow: boolean;
  absCol: boolean;
}

export const MAX_ROWS = 1_048_576;
export const MAX_COLS = 16_384;

export function colName(col: number): string {
  let name = '';
  let n = col + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export function colIndex(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseRef(text: string): CellRef | undefined {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})$/.exec(text);
  if (!m) return undefined;
  const row = Number(m[4]) - 1;
  const col = colIndex(m[2]!);
  if (row < 0 || row >= MAX_ROWS || col >= MAX_COLS) return undefined;
  return { row, col, absRow: m[3] === '$', absCol: m[1] === '$' };
}

export function refName(row: number, col: number, absRow = false, absCol = false): string {
  return `${absCol ? '$' : ''}${colName(col)}${absRow ? '$' : ''}${row + 1}`;
}

export const cellKey = (row: number, col: number): string => `${row},${col}`;

export function parseKey(key: string): [number, number] {
  const i = key.indexOf(',');
  return [Number(key.slice(0, i)), Number(key.slice(i + 1))];
}

/** Quote a sheet name for use in a formula when needed. */
export function quoteSheet(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !parseRef(name) ? name : `'${name.replace(/'/g, "''")}'`;
}
