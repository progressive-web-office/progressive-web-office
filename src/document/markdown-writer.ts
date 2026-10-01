/** Markdown writer (MD-002): CommonMark + GFM tables/strikethrough. */
import { writeFrontMatter } from './frontmatter';
import {
  cleanMeta,
  groupBlocks,
  paragraphText,
  isImageRun,
  isMathRun,
  isTextRun,
  nestLists,
  splitListSegments,

  type ListNode,
  type Paragraph,
  type RichDocument,
  type Run,
  type TableCell,
  type TextRun,
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

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || /^ .* $/.test(text) ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

class MarkdownWriter {
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
        const body = code.join('\n');
        const longest = Math.max(2, ...(body.match(/^`+/gm) ?? []).map((m) => m.length));
        const fence = '`'.repeat(longest + 1);
        parts.push(`${fence}\n${body}\n${fence}`);
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
        parts.push('---');
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
    return parts.filter((p) => p !== '').join('\n\n') + '\n';
  }

  private paragraph(p: Paragraph): string {
    const only = p.runs.length === 1 ? p.runs[0] : undefined;
    if (only && isMathRun(only) && only.display) return `$$\n${only.math}\n$$`;
    const heading = /^h(\d)$/.exec(p.style);
    const inline = this.inline(p.runs, true);
    if (heading) return `${'#'.repeat(Number(heading[1]))} ${inline.replace(/\n/g, ' ')}`;
    return inline || '<br>';
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

      if (isMathRun(run)) {
        out += run.display ? `$$${run.math}$$` : `$${run.math}$`;
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

