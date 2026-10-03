/**
 * Markdown reader (MD-001): CommonMark + GFM tables and strikethrough via
 * markdown-it. Raw HTML is kept as literal text (MD-003), except `<u>` and
 * `<br>` which map to underline and line breaks.
 */
import { FENCE_CLOSE, SOLUTION_OPEN } from './solutions';
import { readCriticComments } from './critic';
import { parseFrontMatter } from './frontmatter';
import { fromCsl, type BibEntry } from './bibliography';
import { wikiRuns } from './wiki-links';
import footnotePlugin from 'markdown-it-footnote';
import MarkdownItCallable, { type MarkdownIt, type StateBlock, type StateInline, type Token } from 'markdown-it';
import {
  addResource,
  cleanFormat,
  emptyDocument,
  isCodeCellRun,
  isImageRun,
  isTextRun,
  normalizeRuns,
  allParagraphs,
  anchorKind,
  seqKindOf,
  isFootnoteRun,
  isRefRun,
  resolveAnchors,
  type TextRun,
  runsText,
  cleanPageSetup,
  type PageSetup,
  type PageZones,
  type PageNumberFormat,
  PAGE_NUMBER_FORMATS,
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
  /** Keep the relative link of resolved pictures, to write it back (a note saved into its folder). */
  keepImageLinks?: boolean;
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

/** MD-019: the colour of `==highlighted==` text. */
export const MARK_COLOUR = '#fff176';

/** MD-019: `==text==`, highlighted (its content parsed as inline Markdown). */
function highlightInline(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  const src = state.src;
  if (src.charCodeAt(start) !== 0x3d || src.charCodeAt(start + 1) !== 0x3d || src.charCodeAt(start + 2) === 0x3d) return false;
  // Not CriticMarkup's `{==text==}` (REV-004).
  if (src[start - 1] === '{' || src[start + 2] === '}') return false;
  const end = src.indexOf('==', start + 2);
  if (end < 0 || end + 2 > max || src[end + 2] === '}') return false;
  const inner = src.slice(start + 2, end);
  if (!inner || /^\s|\s$/.test(inner)) return false;
  if (!silent) {
    state.pos = start + 2;
    state.posMax = end;
    state.push('mark_open', 'mark', 1);
    state.md.inline.tokenize(state);
    state.push('mark_close', 'mark', -1);
    state.posMax = max;
  }
  state.pos = end + 2;
  return true;
}

/** MD-019: a callout's first line, `[!NOTE] Title` (Obsidian, GitHub alerts). */
export const CALLOUT = /^\[!([A-Za-z][\w-]*)\]([+-]?)/;

let parser: MarkdownIt | undefined;
function getParser(): MarkdownIt {
  if (!parser) {
    parser = new MarkdownItCallable('commonmark', { html: true }).enable(['table', 'strikethrough']).use(footnotePlugin);
    parser.inline.ruler.after('escape', 'math_inline', mathInline);
    parser.inline.ruler.after('emphasis', 'mark', highlightInline);
    parser.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  }
  return parser;
}

export const CELL_LANGS: Record<string, CodeLang> = { python: 'python', py: 'python', javascript: 'javascript', js: 'javascript', julia: 'julia', lua: 'lua', sql: 'sql', r: 'r', c: 'cpp', cpp: 'cpp', 'c++': 'cpp' };

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

/** A link that is a path next to the note (not data, not a web address). */
export const isRelativeImage = (src: string): boolean => !!src && !/^(data:|[a-z][a-z0-9+.-]*:|\/\/)/i.test(src);

/** The picture of a reference: the exact reference, else its decoded path (accents, spaces). */
function resolveImage(src: string, opts: MarkdownReadOptions): ResolvedImage | undefined {
  if (src.startsWith('data:')) return decodeDataUri(src);
  let decoded = src;
  try {
    decoded = decodeURI(src);
  } catch {
    /* kept */
  }
  return opts.resolveImage?.(src) ?? (decoded !== src ? opts.resolveImage?.(decoded) : undefined);
}

/** An image run; a picture read from next to the note keeps its link, to be written back as it was. */
function imageRun(src: string, alt: string, title: string | undefined, doc: RichDocument, opts: MarkdownReadOptions): Run {
  const resolved = resolveImage(src, opts);
  const run: Run = { image: resolved ? addResource(doc, resolved.data, resolved.mediaType, resolved.name) : '' };
  if (alt) run.alt = alt;
  if (title) run.title = title;
  if (!resolved || (opts.keepImageLinks && isRelativeImage(src))) run.src = src;
  return run;
}

/** The `<img>` tags of some HTML, as image runs. */
function htmlImages(html: string, doc: RichDocument, opts: MarkdownReadOptions): Run[] {
  const out: Run[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const attr = (name: string): string | undefined => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(m[0])?.slice(1).find((v) => v !== undefined);
    const src = attr('src');
    if (!src) continue;
    const run = imageRun(src, attr('alt') ?? '', attr('title'), doc, opts);
    const width = Number(attr('width'));
    if (width > 0 && 'image' in run) run.width = width;
    out.push(run);
  }
  return out;
}

/** The picture references of a note, as the reader asks for them (MD-018). */
export function imageRefs(source: string): string[] {
  const refs = new Map<string, string>();
  readMarkdown(source, {
    resolveImage: (src) => {
      let key = src;
      try {
        key = decodeURI(src);
      } catch {
        /* kept */
      }
      // The reader asks again with the decoded path: one reference each.
      if (!refs.has(key)) refs.set(key, src);
      return undefined;
    },
  });
  return [...refs.values()];
}

export function readMarkdown(source: string, opts: MarkdownReadOptions = {}): RichDocument {
  const doc = emptyDocument();
  // DOC-017: document properties from the YAML front matter.
  const front = parseFrontMatter(source.replace(/^﻿/, ''));
  const text = front.body;
  doc.meta = { ...front.meta };
  // DOC-024: header-left / footer-center… keys are the header and footer.
  const kept: string[] = [];
  const page: PageSetup = {};
  // DOC-027: `references:` as one JSON (CSL) item per line, as written by PWO;
  // other YAML forms are kept as they are.
  const lines = front.extra ? front.extra.split('\n') : [];
  const refsAt = lines.findIndex((l) => /^references:\s*$/.test(l));
  if (refsAt >= 0) {
    let end = refsAt + 1;
    while (end < lines.length && /^(-|\s)/.test(lines[end]!)) end++;
    const items = lines.slice(refsAt + 1, end);
    try {
      const entries = items.map((l) => fromCsl(JSON.parse(l.replace(/^-\s*/, '')) as Record<string, unknown>));
      if (entries.every(Boolean)) {
        doc.references = { entries: entries as BibEntry[] };
        lines.splice(refsAt, end - refsAt);
      }
    } catch {
      /* not PWO's form: keep it */
    }
  }
  const styleAt = lines.findIndex((l) => /^citation-style:\s*author-year\s*$/.test(l));
  if (styleAt >= 0) {
    doc.references = { entries: doc.references?.entries ?? [], style: 'author-year' };
    lines.splice(styleAt, 1);
  }
  for (const line of lines) {
    // DOC-029: page numbering.
    const numbering = /^page-numbering:\s*([\w-]+)\s*$/.exec(line)?.[1];
    if (numbering && (PAGE_NUMBER_FORMATS as readonly string[]).includes(numbering)) {
      page.numberFormat = numbering as PageNumberFormat;
      continue;
    }
    const start = /^page-start:\s*(\d+)\s*$/.exec(line)?.[1];
    if (start) {
      page.startAt = Number(start);
      continue;
    }
    if (/^first-page-hidden:\s*true\s*$/.test(line)) {
      page.hideOnFirstPage = true;
      continue;
    }
    const m = /^(header|footer)-(left|center|right):\s*(.*)$/.exec(line);
    if (!m) {
      kept.push(line);
      continue;
    }
    let value = m[3]!.trim();
    try {
      if (/^["']/.test(value)) value = value.startsWith('"') ? (JSON.parse(value) as string) : value.slice(1, -1).replace(/''/g, "'");
    } catch {
      /* keep the raw text */
    }
    ((page[m[1] as 'header'] ??= {}) as PageZones)[m[2] as 'left'] = value;
  }
  const setup = cleanPageSetup(page);
  if (setup) doc.page = setup;
  if (kept.join('\n').trim()) doc.extras = { ...doc.extras, frontMatter: kept.join('\n') };
  const env: { footnotes?: { list?: { tokens?: Token[] }[] } } = {};
  // TEACH-001: fenced div lines (`::: solution`, `:::`) become paragraphs of their own.
  const fenced = text.replace(/^(:{3,}[^\S\n]*(?:solution|\{\s*\.solution\s*\})?[^\S\n]*)$/gm, '\n$1\n');
  const tokens = getParser().parse(fenced, env);
  // DOC-022: footnote contents, gathered before the text that refers to them.
  const notes = new Map<number, Run[]>();
  const noteRuns = (id: number): Run[] => notes.get(id) ?? [];
  let noteId = -1;
  for (const tok of tokens) {
    if (tok.type === 'footnote_open') {
      noteId = (tok.meta as { id: number }).id;
      notes.set(noteId, []);
    } else if (tok.type === 'footnote_close') {
      noteId = -1;
    } else if (noteId >= 0 && tok.type === 'inline') {
      const runs = notes.get(noteId)!;
      if (runs.length) runs.push({ text: '\n\n' });
      runs.push(...inlineRuns(tok.children ?? [], doc, opts, noteRuns));
    }
  }
  env.footnotes?.list?.forEach((item, id) => {
    // Inline notes: ^[text].
    if (item?.tokens && !notes.has(id)) notes.set(id, inlineRuns(item.tokens, doc, opts, noteRuns));
  });
  for (const [id, runs] of notes) notes.set(id, normalizeRuns(runs));
  let inNotes = false;
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
    if (tok.type === 'footnote_block_open') inNotes = true;
    if (inNotes) {
      if (tok.type === 'footnote_block_close') inNotes = false;
      continue;
    }
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
        // MD-019: a callout's marker line is a paragraph of its own, before its body.
        const kids = tok.children ?? [];
        const brk = quoteDepth > 0 && !heading && kids[0]?.type === 'text' && CALLOUT.test(kids[0].content) ? kids.findIndex((k) => k.type === 'softbreak') : -1;
        if (brk > 0) {
          const head = newParagraph('normal');
          head.runs = normalizeRuns(inlineRuns(kids.slice(0, brk), doc, opts, noteRuns));
          push(head);
        }
        const runs = normalizeRuns(inlineRuns(brk > 0 ? kids.slice(brk + 1) : kids, doc, opts, noteRuns));
        // CODE-006: figures produced by the previous cell.
        const target = !heading && !row ? lastCell(blocks) : undefined;
        const figures = runs.filter((r) => !(isTextRun(r) && !r.text.trim()));
        if (target && figures.length && figures.every((r) => isImageRun(r) && (r.title === 'output' || r.title === 'widget') && r.image)) {
          target.output ??= { text: '' };
          const pictures = figures as ImageRun[];
          const images = pictures.filter((r) => r.title === 'output').map((r) => r.image);
          // CODE-016: the picture of a widget the cell showed.
          const widgets = pictures.filter((r) => r.title === 'widget').map((r, i) => ({ id: `saved-${target.output!.widgets?.length ?? 0}-${i}`, snapshot: r.image }));
          if (images.length) target.output.images = [...(target.output.images ?? []), ...images];
          if (widgets.length) target.output.widgets = [...(target.output.widgets ?? []), ...widgets];
          break;
        }
        const p = newParagraph(heading ?? 'normal');
        // DOC-026: `<a id="…"></a>` anchors the paragraph.
        p.runs = normalizeRuns(
          runs.map((r) => {
            if (!isTextRun(r) || !r.text.includes(ANCHOR_MARK)) return r;
            return { ...r, text: r.text.replace(ANCHOR_RE, (_, id: string) => ((p.id ??= id), '')) };
          }),
        );
        push(p);
        break;
      }
      case 'math_block': {
        const p = newParagraph();
        // DOC-026: `\tag{n}` numbers the equation, `\label{…}` anchors it.
        const label = /\\label\{([^}]*)\}/.exec(tok.content)?.[1]?.trim();
        const tagged = /\\tag\*?\{[^}]*\}/.test(tok.content);
        const math = tok.content.replace(/\\(?:label|tag\*?)\{[^}]*\}/g, '').trim();
        p.runs = tagged ? [{ math, display: true }, { seq: 'equation' }] : [{ math: tok.content, display: true }];
        if (label) p.id = label;
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
          p.runs = [{ cell: content, lang, ...(info!.flags.includes('hide') ? { hidden: true } : {}) }];
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
        // DOC-027: pandoc puts the references in the div with id "refs".
        if (/^<div\s+id\s*=\s*"refs"\s*>\s*<\/div>\s*$/.test(tok.content.trim())) {
          blocks.push({ type: 'bibliography' });
          break;
        }
        const p = newParagraph();
        const html = tok.content.replace(/\n+$/, '');
        // MD-018: pictures given as HTML (`<img>`, `<p align="center"><img …></p>`) are pictures.
        const pictures = /<img\b/i.test(html) && !/<\/?(?:table|ul|ol|pre|script)\b/i.test(html) ? htmlImages(html, doc, opts) : [];
        if (pictures.length) p.runs = pictures;
        else if (html) p.runs = [{ text: html }];
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
        // GFM tables always start with a header row (DOC-025).
        if (table) blocks.push({ type: 'table', rows: table, header: true });
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
    if (b.type === 'paragraph' && b.style === 'normal' && !b.list && b.runs.length && b.runs.every((r) => 'text' in r)) {
      // `[[_TOC_]]` reads as "[[" + italic "TOC" + "]]": look at the text only.
      const text = runsText(b.runs).trim();
      if (b.runs.length === 1 && PAGE.test(text)) blocks[i] = { type: 'rule', page: true };
      // DOC-023: GitLab's [[_TOC_]], Typora's / MkDocs' [TOC].
      else if (/^(?:\[\[_?TOC_?\]\]|\[TOC\]|\[toc\])$/.test(text)) blocks[i] = { type: 'toc' };
    }
  }
  crossReferences(blocks);
  // FOLDER-005, MD-018: pictures embedded with ![[name.png]] are read like the others.
  for (const p of allParagraphs(blocks)) {
    for (const run of p.runs) {
      if (!isImageRun(run) || run.image || !run.src) continue;
      const resolved = resolveImage(run.src, opts);
      if (resolved) run.image = addResource(doc, resolved.data, resolved.mediaType, resolved.name);
    }
  }
  // DOC-028: `{{#include chapter.md}}` alone on a line is a sub-document.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== 'paragraph' || b.list || b.style !== 'normal') continue;
    const m = /^\{\{#include\s+([^}\s]+)\s*\}\}$/.exec(runsText(b.runs).trim());
    if (m && b.runs.every(isTextRun)) blocks[i] = { type: 'include', src: m[1]! };
  }
  doc.blocks = blocks.length ? blocks : emptyDocument().blocks;
  // REV-004: CriticMarkup comments.
  readCriticComments(doc);
  // TEACH-001: the paragraphs between `::: solution` and `:::` are solutions.
  let inSolution = false;
  const outside: Block[] = [];
  for (const b of doc.blocks) {
    const text = b.type === 'paragraph' && b.runs.length && b.runs.every(isTextRun) ? b.runs.map((r) => (r as { text: string }).text).join('').trim() : undefined;
    if (text !== undefined && SOLUTION_OPEN.test(text)) inSolution = true;
    else if (text !== undefined && inSolution && FENCE_CLOSE.test(text)) inSolution = false;
    else outside.push(inSolution && b.type === 'paragraph' ? { ...b, solution: true } : b);
  }
  if (outside.length !== doc.blocks.length) doc.blocks = outside.length ? outside : emptyDocument().blocks;
  const firstHeading = blocks.find((b): b is Paragraph => b.type === 'paragraph' && b.style === 'h1');
  if (firstHeading && !doc.meta.title) doc.meta.title = firstHeading.runs.map((r) => ('text' in r ? r.text : '')).join('');
  return doc;
}

function inlineRuns(tokens: Token[], doc: RichDocument, opts: MarkdownReadOptions, notes: (id: number) => Run[] = () => []): Run[] {
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
      case 'footnote_ref':
        runs.push({ footnote: notes((tok.meta as { id: number }).id) });
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
      case 'mark_open':
        fmt.highlight = MARK_COLOUR;
        break;
      case 'mark_close':
        delete fmt.highlight;
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
        const title = tok.attrGet('title');
        runs.push(imageRun(src, alt, title ? String(title) : undefined, doc, opts));
        break;
      }
      case 'html_inline': {
        const tag = tok.content.trim().toLowerCase();
        const anchor = /^<a\s+(?:id|name)\s*=\s*"([^"]+)"\s*>$/.exec(tok.content.trim());
        if (anchor) runs.push({ text: `${ANCHOR_MARK}${anchor[1]}\u0000` });
        else if (tag === '</a>') break;
        else if (tag === '<u>') fmt.underline = true;
        else if (tag === '</u>') delete fmt.underline;
        else if (/^<br\s*\/?>$/.test(tag)) text('\n');
        else if (/^<img\b/.test(tag)) runs.push(...htmlImages(tok.content, doc, opts));
        else text(tok.content);
        break;
      }
      default:
        if (tok.content) text(tok.content);
    }
  }
  return runs;
}

/** Marks an `<a id>` anchor among the runs of a paragraph while it is read. */
const ANCHOR_MARK = '\u0000anchor:';
const ANCHOR_RE = /\u0000anchor:([^\u0000]*)\u0000/g;

const CAPTION_WORD = /^(Figures?|Fig\.|Illustrations?|Abbildung|Tables?|Tableaux?|Tabelle|图|表)[\s\u00a0]*(\d+)/i;

/**
 * DOC-026: anchored paragraphs that start with "Figure 3" are captions, and
 * links to an anchor of the document are cross-references.
 */
function crossReferences(blocks: Block[]): void {
  const ids = new Set<string>();
  for (const p of allParagraphs(blocks)) {
    if (!p.id) continue;
    ids.add(p.id);
    const first = p.runs[0];
    const m = first && isTextRun(first) ? CAPTION_WORD.exec(first.text) : null;
    const kind = anchorKind(p.id);
    if (!m || kind === 'heading' || kind === 'equation' || /^h\d$/.test(p.style)) continue;
    const word = m[0].slice(0, m[0].length - m[2]!.length);
    p.style = 'caption';
    p.runs.splice(0, 1, { ...(first as TextRun), text: word }, { seq: kind ?? seqKindOf(m[1]!) }, { ...(first as TextRun), text: (first as TextRun).text.slice(m[0].length) });
    p.runs = normalizeRuns(p.runs);
  }
  const visit = (runs: Run[]): Run[] => {
    const out: Run[] = [];
    for (const r of runs) {
      if (isFootnoteRun(r)) {
        out.push({ footnote: visit(r.footnote) });
        continue;
      }
      const id = isTextRun(r) && r.link?.startsWith('#') ? r.link.slice(1) : undefined;
      if (id && ids.has(id)) {
        const prev = out[out.length - 1];
        // The link's runs make one reference.
        if (!(prev && isRefRun(prev) && prev.ref === id)) out.push({ ref: id });
        continue;
      }
      out.push(r);
    }
    return out;
  };
  for (const p of allParagraphs(blocks)) p.runs = visit(p.runs);
  resolveAnchors(blocks, new Map());
  // DOC-027: pandoc citations, [@key] and [see @a; @b, p. 12].
  const cites = (runs: Run[]): Run[] =>
    runs.flatMap((r): Run[] => {
      if (isFootnoteRun(r)) return [{ footnote: cites(r.footnote) }];
      if (!isTextRun(r) || r.code || r.link || !r.text.includes('[@') && !r.text.includes('[-@')) return [r];
      const out: Run[] = [];
      let last = 0;
      for (const m of r.text.matchAll(/\[(-?@[^\[\]]+)\]/g)) {
        const parts = m[1]!.split(';').map((x) => x.trim());
        const keys = parts.map((x) => /^-?@([\w:.#$%&+?<>~/-]*\w)/.exec(x)?.[1]);
        if (keys.some((k) => !k)) continue;
        const loc = /^-?@[\w:.#$%&+?<>~/-]*\w\s*,\s*(.+)$/.exec(parts[parts.length - 1]!)?.[1];
        if (m.index! > last) out.push({ ...r, text: r.text.slice(last, m.index) });
        out.push(loc ? { cite: keys as string[], locator: loc } : { cite: keys as string[] });
        last = m.index! + m[0].length;
      }
      if (!out.length) return [r];
      if (last < r.text.length) out.push({ ...r, text: r.text.slice(last) });
      return out;
    });
  for (const p of allParagraphs(blocks)) p.runs = cites(p.runs);
  // FOLDER-005: [[wiki links]] and ![[embeds]] between notes.
  for (const p of allParagraphs(blocks)) p.runs = wikiRuns(p.runs);
}
