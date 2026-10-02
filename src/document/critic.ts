/**
 * Comments in Markdown (REV-004), with CriticMarkup: `{==text==}{>>Ann: comment<<}`.
 * Replies follow their comment; a comment on text spread over several
 * paragraphs is written after the last highlighted part.
 */
import { anchorOnWordBefore, anchoredComments } from './comments';
import { allParagraphs, isTextRun, normalizeRuns, type DocComment, type Paragraph, type RichDocument, type Run, type TextRun } from './model';

/** Characters that would be read as Markdown inside a comment. */
const escapeComment = (s: string): string => s.replace(/\s*\n\s*/g, ' ').replace(/([\\`*_[\]<>])/g, '\\$1');

/** What the Markdown writer needs to write the comments of a document. */
export class CriticComments {
  private readonly last = new Map<string, Run>();
  private readonly comments: DocComment[];

  constructor(doc: RichDocument) {
    const anchored = anchoredComments(doc);
    this.comments = (doc.comments ?? []).filter((c) => anchored.has(c.parent ?? c.id));
    for (const p of allParagraphs(doc.blocks)) for (const run of p.runs) if (isTextRun(run)) for (const id of run.comments ?? []) this.last.set(id, run);
  }

  get empty(): boolean {
    return !this.comments.length;
  }

  private ids(run: Run): string {
    return isTextRun(run) ? (run.comments ?? []).filter((id) => this.last.has(id)).join(' ') : '';
  }

  /** REV-005: `{++inserted++}` and `{--deleted--}`. */
  private static change(run: Run): string {
    return isTextRun(run) ? (run.inserted ? '++' : run.deleted ? '--' : '') : '';
  }

  private thread(id: string): string {
    return this.comments
      .filter((c) => c.id === id || c.parent === id)
      .map((c) => `{>>${c.author ? `${escapeComment(c.author)}: ` : ''}${escapeComment(c.text)}<<}`)
      .join('');
  }

  /** The runs as Markdown, commented parts highlighted and followed by their comments where they end. */
  write(runs: Run[], inline: (runs: Run[], first: boolean) => string): string {
    if (!runs.some((r) => this.ids(r) || CriticComments.change(r))) return inline(runs, true);
    let out = '';
    for (let i = 0; i < runs.length; ) {
      const key = this.ids(runs[i]!);
      const change = CriticComments.change(runs[i]!);
      let j = i + 1;
      while (j < runs.length && this.ids(runs[j]!) === key && CriticComments.change(runs[j]!) === change) j++;
      const part = runs.slice(i, j);
      const inner = inline(
        part.map((r) => (isTextRun(r) && (r.inserted || r.deleted) ? (({ inserted: _i, deleted: _d, ...rest }) => rest)(r) : r)),
        i === 0,
      );
      const text = change ? `{${change}${inner}${change}}` : inner;
      if (!key) out += text;
      else {
        out += `{==${text}==}`;
        for (const id of key.split(' ')) if (part.includes(this.last.get(id)!)) out += this.thread(id);
      }
      i = j;
    }
    return out;
  }
}

const MARKUP = /(\{==|==\}|\{\+\+|\+\+\}|\{--|--\}|\{>>[\s\S]*?<<\})/;

/** Read the CriticMarkup comments of a document read from Markdown. */
export function readCriticComments(doc: RichDocument): void {
  const paragraphs = allParagraphs(doc.blocks);
  if (!paragraphs.some((p) => p.runs.some((r) => isTextRun(r) && /\{==|\{>>|\{\+\+|\{--/.test(r.text)))) return;
  const comments: DocComment[] = [];
  const highlighted = new Map<string, TextRun[]>();
  let open: string | undefined;
  let awaiting: string[] = [];
  let last: DocComment | undefined;
  let afterComment = false;
  /** REV-005: inside `{++…++}` or `{--…--}`. */
  let change: 'inserted' | 'deleted' | undefined;
  const rewritten: [Paragraph, Run[]][] = [];
  for (const p of paragraphs) {
    const out: Run[] = [];
    for (const run of p.runs) {
      if (!isTextRun(run) || run.code) {
        out.push(run);
        afterComment = false;
        continue;
      }
      for (const piece of run.text.split(MARKUP)) {
        if (!piece) continue;
        if (piece === '{++' || piece === '{--') {
          change = piece === '{++' ? 'inserted' : 'deleted';
        } else if ((piece === '++}' && change === 'inserted') || (piece === '--}' && change === 'deleted')) {
          change = undefined;
        } else if (piece === '{==') {
          open = `h${highlighted.size + 1}`;
          highlighted.set(open, []);
          afterComment = false;
        } else if (piece === '==}') {
          if (open) awaiting.push(open);
          open = undefined;
        } else if (piece.startsWith('{>>') && piece.endsWith('<<}')) {
          const body = piece.slice(3, -3).trim();
          const m = /^([^:\n]{1,60}):\s+([\s\S]*)$/.exec(body);
          const comment: DocComment = { id: `c${comments.length + 1}`, ...(m ? { author: m[1]!.trim() } : {}), text: m ? m[2]! : body };
          if (afterComment && last) comment.parent = last.parent ?? last.id;
          else if (awaiting.length) {
            for (const key of awaiting) for (const r of highlighted.get(key) ?? []) r.comments = [...(r.comments ?? []), comment.id];
            awaiting = [];
          } else anchorOnWordBefore(out, comment.id);
          comments.push(comment);
          last = comment;
          afterComment = true;
        } else {
          const r: TextRun = { ...run, text: piece, ...(change ? { [change]: {} } : {}) };
          if (open) highlighted.get(open)!.push(r);
          out.push(r);
          if (piece.trim()) afterComment = false;
        }
      }
    }
    rewritten.push([p, out]);
  }
  for (const [p, runs] of rewritten) p.runs = normalizeRuns(runs);
  if (comments.length) doc.comments = comments;
}
