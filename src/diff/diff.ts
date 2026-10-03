/**
 * VER-001: what changed between two versions — the shortest edit between two
 * sequences (Myers' algorithm), lines paired and compared word by word, and
 * the cells of two workbooks.
 */
import { parseKey, refName } from '../sheet/address';
import { cellInput, type Workbook } from '../sheet/model';

export interface Hunk<T> {
  op: 'eq' | 'ins' | 'del';
  a: T[];
  b: T[];
}

/** Over this many differences, the rest is given as one replacement (time and memory stay bounded). */
const MAX_D = 4000;

/** The shortest edit script turning `a` into `b`, as runs of equal, deleted and inserted items. */
export function diff<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): Hunk<T>[] {
  // Common prefix and suffix first: most versions differ little.
  let start = 0;
  while (start < a.length && start < b.length && eq(a[start]!, b[start]!)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && eq(a[endA - 1]!, b[endB - 1]!)) {
    endA--;
    endB--;
  }
  const ops: ('eq' | 'ins' | 'del')[] = [];
  const A = a.slice(start, endA);
  const B = b.slice(start, endB);
  const n = A.length;
  const m = B.length;
  const max = n + m;
  const v = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];
  let found = false;
  for (let d = 0; d <= Math.min(max, MAX_D) && !found; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1)) ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && eq(A[x]!, B[y]!)) {
        x++;
        y++;
      }
      v.set(k, x);
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  const middle: ('eq' | 'ins' | 'del')[] = [];
  if (!found) {
    middle.push(...A.map(() => 'del' as const), ...B.map(() => 'ins' as const));
  } else {
    // Walk back through the trace.
    let x = n;
    let y = m;
    for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
      const vd = trace[d]!;
      const k = x - y;
      const down = k === -d || (k !== d && (vd.get(k - 1) ?? -1) < (vd.get(k + 1) ?? -1));
      const prevK = down ? k + 1 : k - 1;
      const prevX = vd.get(prevK) ?? 0;
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) {
        middle.push('eq');
        x--;
        y--;
      }
      if (d > 0) middle.push(down ? 'ins' : 'del');
      x = prevX;
      y = prevY;
    }
    middle.reverse();
  }
  for (let i = 0; i < start; i++) ops.push('eq');
  ops.push(...middle);
  for (let i = endA; i < a.length; i++) ops.push('eq');
  // Group the operations into runs.
  const out: Hunk<T>[] = [];
  let i = 0;
  let j = 0;
  for (const op of ops) {
    let last = out[out.length - 1];
    if (!last || last.op !== op) out.push((last = { op, a: [], b: [] }));
    if (op !== 'ins') last.a.push(a[i++]!);
    if (op !== 'del') last.b.push(b[j++]!);
  }
  return out;
}

export interface WordPart {
  op: 'eq' | 'ins' | 'del';
  text: string;
}

const tokens = (s: string): string[] => s.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];

/** The words of a line that stayed, went or came. */
export function diffWords(before: string, after: string): WordPart[] {
  const out: WordPart[] = [];
  for (const h of diff(tokens(before), tokens(after))) {
    const push = (op: WordPart['op'], text: string): void => {
      if (!text) return;
      const last = out[out.length - 1];
      if (last && last.op === op) last.text += text;
      else out.push({ op, text });
    };
    if (h.op === 'eq') push('eq', h.a.join(''));
    else if (h.op === 'del') push('del', h.a.join(''));
    else push('ins', h.b.join(''));
  }
  // A space alone between two changes reads better inside them.
  return out;
}

export interface LineRow {
  kind: 'same' | 'added' | 'removed' | 'changed';
  before?: string;
  after?: string;
  /** For a changed line: its words. */
  words?: WordPart[];
}

/** Lines that stayed, came, went, or changed (a removed line followed by an added one, compared word by word). */
export function diffLines(before: string, after: string): LineRow[] {
  const rows: LineRow[] = [];
  const hunks = diff(before.split('\n'), after.split('\n'));
  for (let h = 0; h < hunks.length; h++) {
    const hunk = hunks[h]!;
    if (hunk.op === 'eq') {
      for (const line of hunk.a) rows.push({ kind: 'same', before: line, after: line });
    } else if (hunk.op === 'del' && hunks[h + 1]?.op === 'ins') {
      const next = hunks[++h]!;
      const pairs = Math.min(hunk.a.length, next.b.length);
      for (let i = 0; i < pairs; i++) rows.push({ kind: 'changed', before: hunk.a[i]!, after: next.b[i]!, words: diffWords(hunk.a[i]!, next.b[i]!) });
      for (let i = pairs; i < hunk.a.length; i++) rows.push({ kind: 'removed', before: hunk.a[i]! });
      for (let i = pairs; i < next.b.length; i++) rows.push({ kind: 'added', after: next.b[i]! });
    } else if (hunk.op === 'del') {
      for (const line of hunk.a) rows.push({ kind: 'removed', before: line });
    } else {
      for (const line of hunk.b) rows.push({ kind: 'added', after: line });
    }
  }
  return rows;
}

export interface CellChange {
  sheet: string;
  ref: string;
  before: string;
  after: string;
}

const refOf = (key: string): string => refName(...parseKey(key));

/** The cells whose content (value or formula) differs, sheet by sheet, row by row. */
export function diffSheets(a: Workbook, b: Workbook): CellChange[] {
  const out: CellChange[] = [];
  const names = [...new Set([...a.sheets.map((s) => s.name), ...b.sheets.map((s) => s.name)])];
  for (const name of names) {
    const sa = a.sheets.find((s) => s.name === name);
    const sb = b.sheets.find((s) => s.name === name);
    const keys = new Set([...(sa?.cells.keys() ?? []), ...(sb?.cells.keys() ?? [])]);
    const sorted = [...keys].sort((x, y) => {
      const [rx, cx] = parseKey(x);
      const [ry, cy] = parseKey(y);
      return rx - ry || cx - cy;
    });
    for (const key of sorted) {
      const before = cellInput(sa?.cells.get(key));
      const after = cellInput(sb?.cells.get(key));
      if (before !== after) out.push({ sheet: name, ref: refOf(key), before, after });
    }
  }
  return out;
}
