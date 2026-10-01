/** Markdown writer (MD-002): CommonMark + GFM tables/strikethrough. */
import { writeFrontMatter } from './frontmatter';
import {
  cleanMeta,
  groupBlocks,
  paragraphText,
  isImageRun,
  isCodeCellRun,
  isDiagramRun,
  isMathRun,
  isFootnoteRun,
  splitParagraphs,
  isTextRun,
  nestLists,
  splitListSegments,

  type ListNode,
  type Paragraph,
  type RichDocument,
  type Run,
  type TableCell,
  type TextRun,
  type CodeCellRun,
} from './model';

export interface MarkdownWriteOptions {
  /**
   * URL to use for an embedded image resource. Defaults to a `data:` URI so
   * that a standalone `.md` file stays self-contained.
   */
  imageUrl?: (key: string) => string;
  /** Write document properties as YAML front matter (default true; MDZ keeps them in its manifest). */
  frontMatter?: boolean;
}

export function bytesToBase64(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}

type Mark = 'link' | 'bold' | 'italic' | 'strike' | 'underline';
const MARK_ORDER: Mark[] = ['link', 'bold', 'italic', 'strike', 'underline'];
const OPEN: Record<Exclude<Mark, 'link'>, string> = { bold: '**', italic: '*', strike: '~~', underline: '<u>' };
const CLOSE: Record<Exclude<Mark, 'link'>, string> = { bold: '**', italic: '*', strike: '~~', underline: '</u>' };

/** Escape characters with Markdown meaning in inline text. */
export function escapeInline(text: string): string {
  return text.replace(/[\\`*_[\]<>~|!$]/g, '\\$&');
}

/** Escape constructs that are only special at the start of a line. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>+=-])/, '$1\\$2')
    .replace(/^(\s*\d+)([.)])/, '$1\\$2');
}

/** A fenced code block, with a fence longer than any backtick run starting a line. */
function fenced(body: string, info = ''): string {
  const longest = Math.max(2, ...(body.match(/^\s*`+/gm) ?? []).map((m) => m.trim().length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${info}\n${body}\n${fence}`;
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || /^ .* $/.test(text) ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

class MarkdownWriter {
  /** Footnote definitions, written after the text (DOC-022). */
  private readonly notes: string[] = [];

  constructor(
    private readonly doc: RichDocument,
    private readonly opts: MarkdownWriteOptions,
  ) {}

  write(): string {
    const parts: string[] = [];
    let quote: string[] = [];
    let code: string[] = [];
    const flushQuote = (): void => {
      if (quote.length) parts.push(quote.map((q) => q.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')).join('\n>\n'));
      quote = [];
    };
    const flushCode = (): void => {
      if (code.length) {
        parts.push(fenced(code.join('\n')));
      }
      code = [];
    };
    for (const group of groupBlocks(this.doc.blocks)) {
      const isQuote = group.type === 'paragraph' && group.style === 'quote';
      const isCode = group.type === 'paragraph' && group.style === 'code';
      if (!isQuote) flushQuote();
      if (!isCode) flushCode();
      if (group.type === 'list') {
        for (const segment of splitListSegments(group.items)) {
          for (const list of nestLists(segment)) parts.push(this.list(list, ''));
        }
      } else if (group.type === 'table') {
        parts.push(this.table(group.rows));
      } else if (group.type === 'rule') {
        // \newpage is understood by Pandoc and most Markdown-to-PDF tools (DOC-021).
        parts.push(group.page ? '\\newpage' : '---');
      } else if (isQuote) {
        quote.push(this.inline(group.runs, true));
      } else if (isCode) {
        code.push(group.runs.map((r) => (isTextRun(r) ? r.text : '')).join(''));
      } else {
        parts.push(this.paragraph(group));
      }
    }
    flushQuote();
    flushCode();
    // Notes may hold notes' text only, so their definitions are complete now.
    parts.push(...this.notes);
    return parts.filter((p) => p !== '').join('\n\n') + '\n';
  }

  private paragraph(p: Paragraph): string {
    const only = p.runs.length === 1 ? p.runs[0] : undefined;
    if (only && isMathRun(only) && only.display) return `$$\n${only.math}\n$$`;
    if (only && isDiagramRun(only)) return fenced(only.diagram, only.lang);
    if (only && isCodeCellRun(only)) return this.cell(only);
    const heading = /^h(\d)$/.exec(p.style);
    const inline = this.inline(p.runs, true);
    if (heading) return `${'#'.repeat(Number(heading[1]))} ${inline.replace(/\n/g, ' ')}`;
    return inline || '<br>';
  }

  /** CODE-006: the cell as a `{run}` fence, then its last output and figures. */
  private cell(run: CodeCellRun): string {
    const parts = [fenced(run.cell, `${run.lang} {run}`)];
    const text = run.output?.text.replace(/\n$/, '');
    if (text) parts.push(fenced(text, `text {output${run.output?.error ? ' error' : ''}}`));
    const images = (run.output?.images ?? []).filter((key) => this.doc.resources.has(key));
    if (images.length) parts.push(images.map((key) => `![Output](${this.imageUrl(key).replace(/[()\s]/g, encodeURIComponent)} "output")`).join(' '));
    return parts.join('\n\n');
  }

  private imageUrl(key: string): string {
    return this.opts.imageUrl ? this.opts.imageUrl(key) : this.dataUri(key);
  }

  private list(list: ListNode, indent: string): string {
    const lines: string[] = [];
    let n = 1;
    for (const item of list.items) {
      const marker = list.ordered ? `${n++}. ` : '- ';
      const pad = indent + ' '.repeat(marker.length);
      const text = item.paragraph ? this.inline(item.paragraph.runs, false) : '';
      const [first = '', ...rest] = text.split('\n');
      lines.push(`${indent}${marker}${first}`.trimEnd(), ...rest.map((l) => `${pad}${l}`));
      for (const child of item.children) lines.push(this.list(child, pad));
    }
    return lines.join('\n');
  }

  private table(rows: TableCell[][]): string {
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const cell = (c: TableCell | undefined): string =>
      (c?.blocks ?? [])
        .map((p) => this.inline(p.runs, false).replace(/\n/g, '<br>'))
        .join('<br>')
        .replace(/\|/g, '\\|') || ' ';
    const line = (r: TableCell[]): string => `| ${Array.from({ length: cols }, (_, i) => cell(r[i])).join(' | ')} |`;
    const [head = [], ...body] = rows;
    return [line(head), `|${' --- |'.repeat(cols)}`, ...body.map(line)].join('\n');
  }

  /** Render runs with a minimal, always-valid nesting of emphasis markers. */
  private inline(runs: Run[], escapeStarts: boolean): string {
    let out = '';
    const open: Mark[] = [];
    let link: string | undefined;
    let pendingSpace = '';

    const closeTo = (keep: number): void => {
      while (open.length > keep) {
        const m = open.pop()!;
        if (m === 'link') {
          out += `](${link ?? ''})`;
          link = undefined;
        } else {
          out += CLOSE[m];
        }
      }
    };

    for (const run of runs) {
      const wanted: Mark[] = !isTextRun(run) ? [] : MARK_ORDER.filter((m) => (m === 'link' ? !!run.link : !!run[m]));
      // Keep the longest common prefix of open marks (same link target).
      let keep = 0;
      while (
        keep < open.length &&
        keep < wanted.length &&
        open[keep] === wanted[keep] &&
        (open[keep] !== 'link' || link === (run as TextRun).link)
      ) {
        keep++;
      }
      if (keep < open.length) closeTo(keep);
      out += pendingSpace;
      pendingSpace = '';

      if (isDiagramRun(run) || isCodeCellRun(run)) {
        // Only a diagram or cell alone in its paragraph can be a fence; keep the source visible.
        out += codeSpan((isDiagramRun(run) ? run.diagram : run.cell).replace(/\n/g, ' '));
        continue;
      }
      if (isMathRun(run)) {
        out += run.display ? `$$${run.math}$$` : `$${run.math}$`;
        continue;
      }
      if (isFootnoteRun(run)) {
        const n = this.notes.length + 1;
        this.notes.push('');
        const body = splitParagraphs(run.footnote.filter((r) => !isFootnoteRun(r)))
          .map((part, i) => {
            const para = this.inline(part, false);
            return i === 0 ? para : para.split('\n').map((l) => `    ${l}`).join('\n');
          })
          .join('\n\n');
        this.notes[n - 1] = `[^${n}]: ${body}`;
        out += `[^${n}]`;
        continue;
      }
      if (isImageRun(run)) {
        const url = run.image ? (this.opts.imageUrl ? this.opts.imageUrl(run.image) : this.dataUri(run.image)) : (run.src ?? '');
        out += `![${escapeInline(run.alt ?? '')}](${url.replace(/[()\s]/g, encodeURIComponent)})`;
        continue;
      }
      let text = run.text;
      const lead = /^[ \t]*/.exec(text)![0];
      const trail = /[ \t]*$/.exec(text.slice(lead.length))![0];
      text = text.slice(lead.length, text.length - trail.length);
      if (!text) {
        out += run.code ? codeSpan(run.text) : lead + trail;
        continue;
      }
      out += lead;
      for (const m of wanted.slice(keep)) {
        if (m === 'link') {
          out += '[';
          link = run.link;
        } else {
          out += OPEN[m];
        }
        open.push(m);
      }
      out += run.code
        ? text.split('\n').map(codeSpan).join('\\\n')
        : escapeInline(text).replace(/\n/g, '\\\n');
      pendingSpace = trail;
    }
    closeTo(0);
    out += pendingSpace;
    if (!escapeStarts) return out;
    return out
      .split('\n')
      .map((l) => escapeLineStart(l))
      .join('\n');
  }

  private dataUri(key: string): string {
    const res = this.doc.resources.get(key);
    return res ? `data:${res.mediaType};base64,${bytesToBase64(res.data)}` : '';
  }
}

export function writeMarkdown(doc: RichDocument, opts: MarkdownWriteOptions = {}): string {
  const body = new MarkdownWriter(doc, opts).write();
  return opts.frontMatter === false ? body : markdownFrontMatter(doc) + body;
}

/**
 * Front matter for the document properties (DOC-017). A title that merely
 * repeats the first heading (as read from a plain Markdown file) is not
 * worth a front matter block on its own.
 */
function markdownFrontMatter(doc: RichDocument): string {
  const meta = cleanMeta(doc.meta);
  const extra = typeof doc.extras?.frontMatter === 'string' ? doc.extras.frontMatter : '';
  const firstHeading = doc.blocks.find((b): b is Paragraph => b.type === 'paragraph' && b.style === 'h1');
  const onlyHeadingTitle = Object.keys(meta).length === 1 && meta.title !== undefined && firstHeading !== undefined && paragraphText(firstHeading) === meta.title;
  if (!extra && (Object.keys(meta).length === 0 || onlyHeadingTitle)) return '';
  return writeFrontMatter(meta, extra);
}

