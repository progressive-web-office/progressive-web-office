/**
 * Comments (REV-001): threads in document order, and the helpers the
 * format writers share to open and close comment ranges.
 */
import { allParagraphs, isTextRun, type DocComment, type Run, type RichDocument } from './model';

export interface CommentThread {
  comment: DocComment;
  replies: DocComment[];
  /** The commented text (paragraphs joined by a space). */
  quote: string;
}

/** Comments with a range, in the order of their text, replies under them; comments on no text come last. */
export function commentThreads(doc: RichDocument): CommentThread[] {
  const comments = doc.comments ?? [];
  const quotes = new Map<string, string[]>();
  for (const p of allParagraphs(doc.blocks)) {
    const inPara = new Map<string, string>();
    for (const run of p.runs) {
      if (!isTextRun(run)) continue;
      for (const id of run.comments ?? []) inPara.set(id, (inPara.get(id) ?? '') + run.text);
    }
    for (const [id, text] of inPara) {
      if (!quotes.has(id)) quotes.set(id, []);
      quotes.get(id)!.push(text);
    }
  }
  const order = [...quotes.keys()];
  const roots = comments.filter((c) => !c.parent);
  roots.sort((a, b) => rank(order, a.id) - rank(order, b.id));
  return roots.map((comment) => ({
    comment,
    replies: comments.filter((c) => c.parent === comment.id),
    quote: (quotes.get(comment.id) ?? []).join(' ').trim(),
  }));
}

const rank = (order: string[], id: string): number => {
  const i = order.indexOf(id);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
};

/** Ids of the comments anchored somewhere in the text. */
export function anchoredComments(doc: RichDocument): Set<string> {
  const ids = new Set<string>();
  for (const p of allParagraphs(doc.blocks)) for (const run of p.runs) if (isTextRun(run)) for (const id of run.comments ?? []) ids.add(id);
  return ids;
}

/** Forget the comments whose text is gone, with their replies. */
export function pruneComments(doc: RichDocument): void {
  if (!doc.comments) return;
  const anchored = anchoredComments(doc);
  const kept = doc.comments.filter((c) => (c.parent ? anchored.has(c.parent) : anchored.has(c.id)));
  if (kept.length) doc.comments = kept;
  else delete doc.comments;
}

/** A new comment id not used in the document. */
export function newCommentId(doc: RichDocument): string {
  const used = new Set((doc.comments ?? []).map((c) => c.id));
  let n = used.size + 1;
  while (used.has(`c${n}`)) n++;
  return `c${n}`;
}

/** Initials of a name: `Ann Lee` → `AL`. */
export const initialsOf = (name: string): string =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .slice(0, 4);

/**
 * Follows the comments covering the runs, in document order, for writers:
 * `step(run)` gives the comments ending before the run and those starting at it.
 */
export class CommentRanges {
  private open: string[] = [];
  constructor(private readonly known: Set<string>) {}

  step(run: Run | undefined): { end: string[]; start: string[] } {
    const now = run && isTextRun(run) ? (run.comments ?? []).filter((id) => this.known.has(id)) : this.open.filter(() => run !== undefined && !isTextRun(run));
    const end = this.open.filter((id) => !now.includes(id));
    const start = now.filter((id) => !this.open.includes(id));
    this.open = now;
    return { end, start };
  }

  /** The comments still open at the end of the document. */
  close(): string[] {
    const end = this.open;
    this.open = [];
    return end;
  }
}

/** Give comments new ids, in their list and on the text (readers number them in creation order). */
export function renameComments(doc: RichDocument, ids: Map<string, string>): void {
  for (const c of doc.comments ?? []) {
    c.id = ids.get(c.id) ?? c.id;
    if (c.parent) c.parent = ids.get(c.parent) ?? c.parent;
  }
  for (const p of allParagraphs(doc.blocks)) for (const run of p.runs) if (isTextRun(run) && run.comments) run.comments = run.comments.map((id) => ids.get(id) ?? id);
}

/** A comment on a point (no text) is put on the word before it, in the runs read so far. */
export function anchorOnWordBefore(runs: Run[], id: string): boolean {
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]!;
    if (!isTextRun(run)) return false;
    const m = /(\S+)(\s*)$/.exec(run.text);
    if (!m) {
      if (run.text.trim() === '' && run.text) continue;
      return false;
    }
    const before = run.text.slice(0, m.index);
    const parts: Run[] = [];
    if (before) parts.push({ ...run, text: before });
    parts.push({ ...run, text: m[1]!, comments: [...(run.comments ?? []), id] });
    if (m[2]) parts.push({ ...run, text: m[2] });
    runs.splice(i, 1, ...parts);
    return true;
  }
  return false;
}
