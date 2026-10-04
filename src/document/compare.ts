/**
 * DOC-052: comparing two versions of a document. The differences become
 * tracked changes (REV-005) of the newer version: the words removed kept as
 * deletions, the words added marked as insertions — read, then accepted or
 * rejected one by one or all at once, as with changes recorded while typing.
 * Paragraphs are matched first, then the words of a paragraph that changed.
 */
import { isTextRun, normalizeRuns, type Block, type Paragraph, type Revision, type RichDocument, type Run, type TextRun } from './model';

/** Longest common subsequence of two lists of keys: the pairs of indexes kept. */
function lcs(a: string[], b: string[]): [number, number][] {
  // Common start and end first: most versions differ in a few places.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  const pairs: [number, number][] = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  if (n && m) {
    if (n * m > 25_000_000) {
      // Too large to compare finely: what is between the common start and end is all changed.
    } else {
      const w = m + 1;
      const table = new Uint32Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          table[i * w + j] = a[start + i] === b[start + j] ? table[(i + 1) * w + j + 1]! + 1 : Math.max(table[(i + 1) * w + j]!, table[i * w + j + 1]!);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (a[start + i] === b[start + j]) {
          pairs.push([start + i, start + j]);
          i++;
          j++;
        } else if (table[(i + 1) * w + j]! >= table[i * w + j + 1]!) i++;
        else j++;
      }
    }
  }
  for (let k = 0; k < a.length - endA; k++) pairs.push([endA + k, endB + k]);
  return pairs;
}

/** A piece of a paragraph: a word, a space, a sign — or a whole run that is not text. */
interface Atom {
  key: string;
  /** The run it comes from: its formatting, and its text cut to this piece. */
  run: Run;
}

/** The pieces of a paragraph, compared one by one. */
function atoms(p: Paragraph): Atom[] {
  const out: Atom[] = [];
  for (const run of p.runs) {
    if (!isTextRun(run)) {
      out.push({ key: `\u0000${JSON.stringify(run)}`, run });
      continue;
    }
    // Text already deleted in this version is not part of it.
    if (run.deleted) continue;
    const { inserted: _i, ...plain } = run;
    for (const piece of run.text.match(/\s+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}_'’-]/gu) ?? []) out.push({ key: piece, run: { ...plain, text: piece } });
  }
  return out;
}

const textOf = (p: Paragraph): string =>
  p.runs
    .filter(isTextRun)
    .filter((r) => !r.deleted)
    .map((r) => r.text)
    .join('');

const blockKey = (b: Block): string => (b.type === 'paragraph' ? `p|${b.style}|${b.list ? `${b.list.ordered}${b.list.level}` : ''}|${textOf(b)}` : `b|${JSON.stringify(b)}`);

/** How alike two paragraphs are, from 0 to 1: the share of their words in common. */
function likeness(a: Paragraph, b: Paragraph): number {
  const wa = textOf(a).toLowerCase().split(/\s+/).filter(Boolean);
  const wb = textOf(b).toLowerCase().split(/\s+/).filter(Boolean);
  if (!wa.length && !wb.length) return 1;
  const common = lcs(wa, wb).length;
  return (2 * common) / (wa.length + wb.length);
}

const mark = (run: Run, kind: 'inserted' | 'deleted', by: Revision): Run | undefined => (isTextRun(run) ? ({ ...run, [kind]: by } as TextRun) : kind === 'inserted' ? run : undefined);

export interface Comparison {
  doc: RichDocument;
  /** Pieces of text inserted and deleted, and paragraphs touched. */
  inserted: number;
  deleted: number;
  paragraphs: number;
  /** Blocks other than paragraphs (tables, pictures on their own…) changed: shown as they are in the newer version. */
  otherBlocks: number;
}

/** The words of a paragraph changed into another: the newer one, with the changes tracked. */
function compareParagraph(a: Paragraph, b: Paragraph, by: Revision, count: { inserted: number; deleted: number }): Paragraph {
  const xa = atoms(a);
  const xb = atoms(b);
  const pairs = lcs(
    xa.map((x) => x.key),
    xb.map((x) => x.key),
  );
  const runs: Run[] = [];
  let i = 0;
  let j = 0;
  const flush = (toI: number, toJ: number): void => {
    // Deleted words before inserted ones, as one reads a correction.
    for (; i < toI; i++) {
      const r = mark(xa[i]!.run, 'deleted', by);
      if (r) runs.push(r);
      if (xa[i]!.key.trim()) count.deleted++;
    }
    for (; j < toJ; j++) {
      const r = mark(xb[j]!.run, 'inserted', by);
      if (r) runs.push(r);
      if (xb[j]!.key.trim()) count.inserted++;
    }
  };
  for (const [pi, pj] of pairs) {
    flush(pi, pj);
    runs.push(xb[pj]!.run);
    i = pi + 1;
    j = pj + 1;
  }
  flush(xa.length, xb.length);
  return { ...b, runs: normalizeRuns(runs) };
}

/**
 * The newer version `revised`, with what changed since `original` as tracked
 * changes by `by` (the name of the newer version, as its author).
 */
export function compareDocuments(original: RichDocument, revised: RichDocument, by: Revision): Comparison {
  const a = original.blocks;
  const b = revised.blocks;
  const pairs = lcs(a.map(blockKey), b.map(blockKey));
  const result: Comparison = { doc: { ...revised, blocks: [] }, inserted: 0, deleted: 0, paragraphs: 0, otherBlocks: 0 };
  const out = result.doc.blocks;
  const count = { inserted: 0, deleted: 0 };
  let i = 0;
  let j = 0;
  const flush = (toI: number, toJ: number): void => {
    const gone = a.slice(i, toI);
    const added = b.slice(j, toJ);
    i = toI;
    j = toJ;
    // Paragraphs changed in place: their words compared.
    while (gone.length || added.length) {
      const x = gone[0];
      const y = added[0];
      if (x?.type === 'paragraph' && y?.type === 'paragraph' && likeness(x, y) >= 0.3) {
        out.push(compareParagraph(x, y, by, count));
        result.paragraphs++;
        gone.shift();
        added.shift();
      } else if (x && (!y || x.type !== 'paragraph' || y.type !== 'paragraph' || gone.length >= added.length)) {
        gone.shift();
        if (x.type === 'paragraph') {
          const runs = x.runs.flatMap((r) => mark(r, 'deleted', by) ?? []);
          count.deleted += textOf(x).split(/\s+/).filter(Boolean).length;
          if (runs.length) out.push({ ...x, runs });
          result.paragraphs++;
        } else result.otherBlocks++;
      } else if (y) {
        added.shift();
        if (y.type === 'paragraph') {
          out.push({ ...y, runs: y.runs.flatMap((r) => mark(r, 'inserted', by) ?? []) });
          count.inserted += textOf(y).split(/\s+/).filter(Boolean).length;
          result.paragraphs++;
        } else {
          out.push(y);
          result.otherBlocks++;
        }
      }
    }
  };
  for (const [pi, pj] of pairs) {
    flush(pi, pj);
    out.push(b[pj]!);
    i = pi + 1;
    j = pj + 1;
  }
  flush(a.length, b.length);
  result.inserted = count.inserted;
  result.deleted = count.deleted;
  return result;
}
