/**
 * Markdown reader (MD-001): CommonMark + GFM tables and strikethrough via
 * markdown-it. Raw HTML is kept as literal text (MD-003), except `<u>` and
 * `<br>` which map to underline and line breaks.
 */
import { parseFrontMatter } from './frontmatter';
import MarkdownItCallable, { type MarkdownIt, type StateBlock, type StateInline, type Token } from 'markdown-it';
import {
  addResource,
  cleanFormat,
  emptyDocument,
  isCodeCellRun,
  isImageRun,
  isTextRun,
  normalizeRuns,
  type Block,
  type CodeCellRun,
  type CodeLang,
  type ImageRun,
  type Paragraph,
  type ParagraphStyle,
  type RichDocument,
  type Run,
  type TableCell,
  type TextFormat,
} from './model';

export interface ResolvedImage {
  data: Uint8Array;
  mediaType: string;
  name?: string;
}

export interface MarkdownReadOptions {
  /** Resolve a (relative) image reference to embedded data. */
  resolveImage?: (src: string) => ResolvedImage | undefined;
  /** Rewrite link targets (e.g. archive-relative links in MDZ packages). */
  rewriteLink?: (href: string) => string;
}

/** `$...$` (inline) and `$$...$$` (display) TeX math, pandoc-style rules (MATH-003). */
function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src[start] !== '$') return false;
  const display = src[start + 1] === '$';
  const delim = display ? '$$' : '$';
  if (!display && /\s/.test(src[start + 1] ?? ' ')) return false;
  let end = start + delim.length;
  for (;;) {
    end = src.indexOf(delim, end);
    if (end < 0) return false;
    let backslashes = 0;
    for (let i = end - 1; src[i] === '\\'; i--) backslashes++;
    if (backslashes % 2 === 0) break;
    end++;
  }
  const content = src.slice(start + delim.length, end);
  if (!content.trim()) return false;
  if (!display && (/\s$/.test(content) || /\d/.test(src[end + 1] ?? ''))) return false;
  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.content = content;
    token.markup = delim;
  }
  state.pos = end + delim.length;
  return true;
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const lineText = (n: number): string => state.src.slice(state.bMarks[n]! + state.tShift[n]!, state.eMarks[n]);
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
  const first = lineText(startLine);
  if (!first.startsWith('$$')) return false;
  let content: string;
  let last = startLine;
  const rest = first.slice(2).trim();
  if (rest.endsWith('$$') && rest.length >= 2) {
    content = rest.slice(0, -2);
  } else {
    const lines = [rest];
    for (last = startLine + 1; last < endLine; last++) {
      const line = lineText(last).trim();
      if (line.endsWith('$$')) {
        lines.push(line.slice(0, -2));
        break;
      }
      lines.push(line);
    }
    if (last >= endLine) return false;
    content = lines.join('\n');
  }
  if (silent) return true;
  state.line = last + 1;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = content.trim();
  token.map = [startLine, state.line];
  return true;
}

let parser: MarkdownIt | undefined;
function getParser(): MarkdownIt {
  if (!parser) {
    parser = new MarkdownItCallable('commonmark', { html: true }).enable(['table', 'strikethrough']);
    parser.inline.ruler.after('escape', 'math_inline', mathInline);
    parser.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  }
  return parser;
}

const CELL_LANGS: Record<string, CodeLang> = { python: 'python', py: 'python', javascript: 'javascript', js: 'javascript' };

/** `python {run}` -> language and attribute flags. */
function parseFenceInfo(info: string): { lang: string; flags: string[] } {
  const m = /^\s*([\w+-]*)\s*(?:\{([^}]*)\})?/.exec(info);
  return { lang: (m?.[1] ?? '').toLowerCase(), flags: (m?.[2] ?? '').trim().split(/\s+/).map((f) => f.replace(/^\./, '')).filter(Boolean) };
}

/** The code cell ending the block list, if any. */
function lastCell(blocks: Block[]): CodeCellRun | undefined {
  const last = blocks[blocks.length - 1];
  const run = last?.type === 'paragraph' && last.runs.length === 1 ? last.runs[0] : undefined;
  return run && isCodeCellRun(run) ? run : undefined;
}

export function decodeDataUri(uri: string): ResolvedImage | undefined {
  const m = /^data:([\w/+.-]+)?(;base64)?,(.*)$/s.exec(uri);
  if (!m) return undefined;
  try {
    const raw = m[2] ? atob(m[3]!) : decodeURIComponent(m[3]!);
    return { data: Uint8Array.from(raw, (c) => c.charCodeAt(0)), mediaType: m[1] ?? 'application/octet-stream' };
  } catch {
    return undefined;
  }
}

export function readMarkdown(source: string, opts: MarkdownReadOptions = {}): RichDocument {
  const doc = emptyDocument();
  // DOC-017: document properties from the YAML front matter.
  const front = parseFrontMatter(source.replace(/^﻿/, ''));
  const text = front.body;
  doc.meta = { ...front.meta };
  if (front.extra) doc.extras = { ...doc.extras, frontMatter: front.extra };
  const tokens = getParser().parse(text, {});
  const blocks: Block[] = [];
  const lists: boolean[] = [];
  let quoteDepth = 0;
  let table: TableCell[][] | null = null;
  let row: TableCell[] | null = null;
  let heading: ParagraphStyle | null = null;

  const push = (p: Paragraph): void => {
    if (row) row.push({ blocks: [p] });
    else blocks.push(p);
  };

  const newParagraph = (style: ParagraphStyle = 'normal'): Paragraph => {
    const p: Paragraph = { type: 'paragraph', style: quoteDepth > 0 && style === 'normal' ? 'quote' : style, runs: [] };
    if (lists.length && !row) p.list = { ordered: lists[lists.length - 1]!, level: lists.length - 1 };
    return p;
  };

  for (const tok of tokens) {
    switch (tok.type) {
      case 'heading_open':
        heading = tok.tag as ParagraphStyle;
        break;
      case 'heading_close':
        heading = null;
        break;
      case 'bullet_list_open':
        lists.push(false);
        break;
      case 'ordered_list_open':
        lists.push(true);
        break;
      case 'bullet_list_close':
      case 'ordered_list_close':
        lists.pop();
        break;
      case 'blockquote_open':
        quoteDepth++;
        break;
      case 'blockquote_close':
        quoteDepth--;
        break;
      case 'inline': {
        const runs = normalizeRuns(inlineRuns(tok.children ?? [], doc, opts));
        // CODE-006: figures produced by the previous cell.
        const target = !heading && !row ? lastCell(blocks) : undefined;
        const figures = runs.filter((r) => !(isTextRun(r) && !r.text.trim()));
        if (target && figures.length && figures.every((r) => isImageRun(r) && r.title === 'output' && r.image)) {
          target.output ??= { text: '' };
          target.output.images = [...(target.output.images ?? []), ...figures.map((r) => (r as ImageRun).image)];
          break;
        }
        const p = newParagraph(heading ?? 'normal');
        p.runs = runs;
        push(p);
        break;
      }
      case 'math_block': {
        const p = newParagraph();
        p.runs = [{ math: tok.content, display: true }];
        push(p);
        break;
      }
      case 'fence':
      case 'code_block': {
        const info = tok.type === 'fence' ? parseFenceInfo(tok.info) : undefined;
        const content = tok.content.replace(/\n$/, '');
        // CODE-006: executable cells and the output that follows them.
        const lang = info?.flags.includes('run') ? CELL_LANGS[info.lang] : undefined;
        if (lang) {
          const p = newParagraph();
          p.runs = [{ cell: content, lang }];
          push(p);
          break;
        }
        const target = info?.flags.includes('output') && !row ? lastCell(blocks) : undefined;
        if (target && !target.output) {
          target.output = { text: content ? `${content}\n` : '' };
          if (info!.flags.includes('error')) target.output.error = true;
          break;
        }
        if (tok.type === 'fence' && tok.info.trim().split(/\s+/)[0]?.toLowerCase() === 'mermaid') {
          const p = newParagraph();
          p.runs = [{ diagram: tok.content.replace(/\n$/, ''), lang: 'mermaid' }];
          push(p);
          break;
        }
        const p = newParagraph('code');
        p.style = 'code';
        const code = tok.content.replace(/\n$/, '');
        if (code) p.runs = [{ text: code }];
        push(p);
        break;
      }
      case 'html_block': {
        const p = newParagraph();
        const html = tok.content.replace(/\n+$/, '');
        if (html) p.runs = [{ text: html }];
        push(p);
        break;
      }
      case 'hr':
        blocks.push({ type: 'rule' });
        break;
      case 'table_open':
        table = [];
        break;
      case 'table_close':
        if (table) blocks.push({ type: 'table', rows: table });
        table = null;
        break;
      case 'tr_open':
        row = [];
        break;
      case 'tr_close':
        if (table && row) table.push(row);
        row = null;
        break;
      default:
        break;
    }
  }
  // DOC-021: `\newpage` / `\pagebreak` alone on a line, or an HTML page-break div.
  const PAGE = /^(?:\\newpage|\\pagebreak|\\clearpage|<div[^>]*page-break-(?:after|before)\s*:\s*always[^>]*>\s*<\/div>)$/;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'paragraph' && b.style === 'normal' && !b.list && b.runs.length === 1 && 'text' in b.runs[0]! && PAGE.test(b.runs[0].text.trim())) blocks[i] = { type: 'rule', page: true };
  }
  doc.blocks = blocks.length ? blocks : emptyDocument().blocks;
  const firstHeading = blocks.find((b): b is Paragraph => b.type === 'paragraph' && b.style === 'h1');
  if (firstHeading && !doc.meta.title) doc.meta.title = firstHeading.runs.map((r) => ('text' in r ? r.text : '')).join('');
  return doc;
}

function inlineRuns(tokens: Token[], doc: RichDocument, opts: MarkdownReadOptions): Run[] {
  const runs: Run[] = [];
  const fmt: TextFormat = {};
  const text = (t: string, extra: TextFormat = {}): void => {
    if (t) runs.push({ text: t, ...cleanFormat({ ...fmt, ...extra }) });
  };
  for (const tok of tokens) {
    switch (tok.type) {
      case 'text':
        text(tok.content);
        break;
      case 'softbreak':
        text(' ');
        break;
      case 'hardbreak':
        text('\n');
        break;
      case 'strong_open':
        fmt.bold = true;
        break;
      case 'strong_close':
        delete fmt.bold;
        break;
      case 'em_open':
        fmt.italic = true;
        break;
      case 'em_close':
        delete fmt.italic;
        break;
      case 's_open':
        fmt.strike = true;
        break;
      case 's_close':
        delete fmt.strike;
        break;
      case 'code_inline':
        text(tok.content, { code: true });
        break;
      case 'math_inline':
        runs.push(tok.markup === '$$' ? { math: tok.content.trim(), display: true } : { math: tok.content });
        break;
      case 'link_open': {
        const href = String(tok.attrGet('href') ?? '');
        fmt.link = opts.rewriteLink ? opts.rewriteLink(href) : href;
        break;
      }
      case 'link_close':
        delete fmt.link;
        break;
      case 'image': {
        const src = String(tok.attrGet('src') ?? '');
        const alt = tok.content;
        const resolved = src.startsWith('data:') ? decodeDataUri(src) : opts.resolveImage?.(src);
        const run: Run = { image: resolved ? addResource(doc, resolved.data, resolved.mediaType, resolved.name) : '' };
        if (alt) run.alt = alt;
        const title = tok.attrGet('title');
        if (title) run.title = String(title);
        if (!resolved) run.src = src;
        runs.push(run);
        break;
      }
      case 'html_inline': {
        const tag = tok.content.trim().toLowerCase();
        if (tag === '<u>') fmt.underline = true;
        else if (tag === '</u>') delete fmt.underline;
        else if (/^<br\s*\/?>$/.test(tag)) text('\n');
        else text(tok.content);
        break;
      }
      default:
        if (tok.content) text(tok.content);
    }
  }
  return runs;
}
