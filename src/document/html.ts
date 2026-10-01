/**
 * Bridge between the document model and the editor DOM (DOC-003), also used
 * to sanitise pasted HTML (DOC-008): anything outside the supported subset is
 * reduced to text, and unsafe URLs/elements are dropped.
 */
import {
  cleanFormat,
  groupBlocks,
  isImageRun,
  isCodeCellRun,
  isDiagramRun,
  isMathRun,
  isTextRun,
  nestLists,
  normalizeRuns,
  type Align,
  type Block,
  type CodeCellRun,
  type CodeLang,
  type DiagramLang,
  type ListInfo,
  type ListNode,
  type Paragraph,
  type ParagraphStyle,
  type Run,
  type TableCell,
  type TextFormat,
} from './model';
import { diagramLangOf } from './diagram';

/** Accept http(s), mailto, tel, fragment and relative URLs only. */
export function isSafeUrl(url: string): boolean {
  // eslint-disable-next-line no-control-regex
  const u = url.replace(/[\u0000- ]/g, '').toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(u);
  if (!scheme) return true;
  return ['http', 'https', 'mailto', 'tel'].includes(scheme[1]!);
}

export interface ImageInfo {
  url: string;
}

// --- model -> DOM -----------------------------------------------------------

export function blocksToDom(
  blocks: Block[],
  doc: Document,
  resolveImage: (key: string) => ImageInfo | undefined,
): DocumentFragment {
  const frag = doc.createDocumentFragment();
  let quote: HTMLElement | null = null;

  for (const group of groupBlocks(blocks)) {
    const isQuote = group.type === 'paragraph' && group.style === 'quote';
    if (!isQuote) quote = null;
    if (group.type === 'list') {
      for (const list of nestLists(group.items)) frag.append(listToDom(list, doc, resolveImage));
    } else if (group.type === 'table') {
      frag.append(tableToDom(group.rows, doc, resolveImage));
    } else if (group.type === 'rule') {
      frag.append(doc.createElement('hr'));
    } else if (isQuote) {
      if (!quote) {
        quote = doc.createElement('blockquote');
        frag.append(quote);
      }
      quote.append(paragraphToDom(group, 'p', doc, resolveImage));
    } else {
      frag.append(paragraphToDom(group, tagFor(group.style), doc, resolveImage));
    }
  }
  return frag;
}

function tagFor(style: ParagraphStyle): string {
  if (style === 'normal' || style === 'quote') return 'p';
  if (style === 'code') return 'pre';
  return style;
}

function paragraphToDom(p: Paragraph, tag: string, doc: Document, resolveImage: (key: string) => ImageInfo | undefined): HTMLElement {
  const el = doc.createElement(tag);
  if (p.align && p.align !== 'left') el.style.textAlign = p.align;
  appendRuns(el, p.runs, doc, resolveImage);
  return el;
}

function appendRuns(el: HTMLElement, runs: Run[], doc: Document, resolveImage: (key: string) => ImageInfo | undefined): void {
  for (const run of runs) {
    if (isMathRun(run)) {
      el.append(mathElement(run.math, !!run.display, doc));
      continue;
    }
    if (isDiagramRun(run)) {
      el.append(diagramElement(run.diagram, run.lang, doc));
      continue;
    }
    if (isCodeCellRun(run)) {
      el.append(codeCellElement(run, doc, resolveImage));
      continue;
    }
    if (isImageRun(run)) {
      const info = resolveImage(run.image);
      if (!info) continue;
      const img = doc.createElement('img');
      img.src = info.url;
      img.alt = run.alt ?? '';
      img.dataset.resource = run.image;
      if (run.width) img.width = Math.round(run.width);
      if (run.height) img.height = Math.round(run.height);
      el.append(img);
      continue;
    }
    let node: Node = textWithBreaks(run.text, doc);
    const wrap = (tag: string): void => {
      const w = doc.createElement(tag);
      w.append(node);
      node = w;
    };
    if (run.size || run.color) {
      const span = doc.createElement('span');
      if (run.size) span.style.fontSize = `${run.size}pt`;
      if (run.color) span.style.color = run.color;
      span.append(node);
      node = span;
    }
    if (run.code) wrap('code');
    if (run.strike) wrap('s');
    if (run.underline) wrap('u');
    if (run.italic) wrap('em');
    if (run.bold) wrap('strong');
    if (run.link && isSafeUrl(run.link)) {
      const a = doc.createElement('a');
      a.href = run.link;
      a.append(node);
      node = a;
    }
    el.append(node);
  }
  if (!el.hasChildNodes() || el.lastChild?.nodeName === 'BR') el.append(doc.createElement('br'));
}

/**
 * A code cell: its source and its last output (CODE-001, CODE-005). The
 * editor adds the Run / Edit controls; the document content is read back from
 * the source, output and figure elements.
 */
export function codeCellElement(run: CodeCellRun, doc: Document, resolveImage: (key: string) => ImageInfo | undefined): HTMLElement {
  const cell = doc.createElement('span');
  cell.className = 'code-cell';
  cell.dataset.lang = run.lang;
  cell.contentEditable = 'false';
  const source = doc.createElement('span');
  source.className = 'code-cell-source';
  source.textContent = run.cell;
  cell.append(source);
  if (run.output) {
    const output = doc.createElement('span');
    output.className = run.output.error ? 'code-cell-output error' : 'code-cell-output';
    output.textContent = run.output.text;
    cell.append(output);
    const figures = doc.createElement('span');
    figures.className = 'code-cell-figures';
    for (const key of run.output.images ?? []) {
      const info = resolveImage(key);
      if (!info) continue;
      const img = doc.createElement('img');
      img.src = info.url;
      img.alt = 'Output';
      img.dataset.resource = key;
      figures.append(img);
    }
    if (figures.childElementCount) cell.append(figures);
  }
  return cell;
}

const CODE_LANGS: readonly CodeLang[] = ['python', 'javascript'];

function codeCellFromDom(el: HTMLElement, lookupImage: (img: HTMLImageElement) => string | undefined): CodeCellRun | undefined {
  const lang = CODE_LANGS.find((l) => l === el.dataset.lang);
  if (!lang) return undefined;
  const run: CodeCellRun = { cell: el.querySelector('.code-cell-source')?.textContent ?? '', lang };
  // A run in progress shows its status there: not part of the document.
  const output = el.querySelector<HTMLElement>('.code-cell-output:not(.pending)');
  if (output) {
    run.output = { text: output.textContent ?? '' };
    if (output.classList.contains('error')) run.output.error = true;
    const images = Array.from(el.querySelectorAll<HTMLImageElement>('.code-cell-figures img'))
      .map(lookupImage)
      .filter((k): k is string => !!k);
    if (images.length) run.output.images = images;
  }
  return run;
}

/** Placeholder element for a diagram; editors upgrade it to a rendered picture (DIAG-001). */
export function diagramElement(source: string, lang: DiagramLang, doc: Document): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'diagram';
  span.dataset.diagram = lang;
  span.dataset.source = source;
  span.contentEditable = 'false';
  span.textContent = source;
  return span;
}

/** Placeholder element for an equation; editors upgrade it to rendered math. */
export function mathElement(latex: string, display: boolean, doc: Document): HTMLElement {
  const span = doc.createElement('span');
  span.className = display ? 'math display' : 'math';
  span.dataset.latex = latex;
  if (display) span.dataset.display = 'true';
  span.contentEditable = 'false';
  span.textContent = display ? `$$${latex}$$` : `$${latex}$`;
  return span;
}

function textWithBreaks(text: string, doc: Document): Node {
  const parts = text.split('\n');
  if (parts.length === 1) return doc.createTextNode(text);
  const frag = doc.createDocumentFragment();
  parts.forEach((part, i) => {
    if (i > 0) frag.append(doc.createElement('br'));
    if (part) frag.append(doc.createTextNode(part));
  });
  return frag;
}

function listToDom(list: ListNode, doc: Document, resolveImage: (key: string) => ImageInfo | undefined): HTMLElement {
  const el = doc.createElement(list.ordered ? 'ol' : 'ul');
  for (const item of list.items) {
    const li = doc.createElement('li');
    if (item.paragraph) {
      if (item.paragraph.align && item.paragraph.align !== 'left') li.style.textAlign = item.paragraph.align;
      appendRuns(li, item.paragraph.runs, doc, resolveImage);
      if (item.children.length && li.lastChild?.nodeName === 'BR' && item.paragraph.runs.length) li.lastChild.remove();
    }
    for (const child of item.children) li.append(listToDom(child, doc, resolveImage));
    el.append(li);
  }
  return el;
}

function tableToDom(rows: TableCell[][], doc: Document, resolveImage: (key: string) => ImageInfo | undefined): HTMLElement {
  const table = doc.createElement('table');
  const body = doc.createElement('tbody');
  for (const row of rows) {
    const tr = doc.createElement('tr');
    for (const cell of row) {
      const td = doc.createElement('td');
      td.append(blocksToDom(cell.blocks.length ? cell.blocks : [{ type: 'paragraph', style: 'normal', runs: [] }], doc, resolveImage));
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  return table;
}

// --- DOM -> model -----------------------------------------------------------

const SKIP = new Set([
  'script', 'style', 'template', 'head', 'meta', 'title', 'link', 'noscript',
  'iframe', 'object', 'embed', 'svg', 'math', 'canvas', 'video', 'audio',
  'input', 'button', 'select', 'textarea', 'form', 'colgroup', 'col',
]);
const BLOCK = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol',
  'li', 'table', 'hr', 'section', 'article', 'header', 'footer', 'main', 'nav',
  'aside', 'figure', 'figcaption', 'address', 'dl', 'dt', 'dd', 'body', 'html',
  'center', 'details', 'summary', 'caption',
]);

interface BlockCtx {
  style: ParagraphStyle;
  align?: Align;
  list?: ListInfo;
  listDepth: number;
  ordered: boolean;
  pre: boolean;
}

export interface DomToBlocksOptions {
  /** Keep whitespace as typed (editor uses `white-space: pre-wrap`). */
  preserveWhitespace?: boolean;
}

export function domToBlocks(
  root: Node,
  lookupImage: (img: HTMLImageElement) => string | undefined,
  opts: DomToBlocksOptions = {},
): Block[] {
  const blocks: Block[] = [];
  let current: Paragraph | null = null;

  const flush = (): void => {
    if (!current) return;
    const runs = current.runs;
    const last = runs[runs.length - 1];
    // A trailing <br> is the browser's placeholder for an empty line end.
    if (last && isTextRun(last) && last.text.endsWith('\n') && !current.list) last.text = last.text.slice(0, -1);
    if (last && isTextRun(last) && current.list) last.text = last.text.replace(/\n$/, '');
    current.runs = normalizeRuns(runs);
    if (current.style !== 'code') trimParagraph(current, !!opts.preserveWhitespace);
    blocks.push(current);
    current = null;
  };

  const open = (ctx: BlockCtx): Paragraph => {
    if (!current) {
      current = { type: 'paragraph', style: ctx.style, runs: [] };
      if (ctx.align) current.align = ctx.align;
      if (ctx.list) current.list = { ...ctx.list };
    }
    return current;
  };

  const walk = (node: Node, fmt: TextFormat, ctx: BlockCtx): void => {
    if (node.nodeType === 3) {
      let text = node.nodeValue ?? '';
      if (!ctx.pre && !opts.preserveWhitespace) text = text.replace(/[ \t\r\n\f]+/g, ' ');
      text = text.replace(/ /g, ' ');
      if (!current && !ctx.pre && !text.trim()) return;
      if (!text) return;
      open(ctx).runs.push({ text, ...cleanFormat(fmt) });
      return;
    }
    if (node.nodeType !== 1) {
      if (node.nodeType === 11) for (const c of Array.from(node.childNodes)) walk(c, fmt, ctx);
      return;
    }
    const el = node as HTMLElement;
    const tag = el.localName.toLowerCase();
    if (SKIP.has(tag)) return;

    if (tag === 'br') {
      open(ctx).runs.push({ text: '\n', ...cleanFormat(fmt) });
      return;
    }
    if (el.dataset?.latex !== undefined && el.classList.contains('math')) {
      const run: Run = { math: el.dataset.latex };
      if (el.dataset.display === 'true') run.display = true;
      open(ctx).runs.push(run);
      return;
    }
    if (el.classList.contains('code-cell')) {
      const run = codeCellFromDom(el, lookupImage);
      if (run) open(ctx).runs.push(run);
      return;
    }
    if (el.dataset?.source !== undefined && el.classList.contains('diagram')) {
      const lang = diagramLangOf(el.dataset.diagram);
      if (lang) open(ctx).runs.push({ diagram: el.dataset.source, lang });
      return;
    }
    if (tag === 'img') {
      const key = lookupImage(el as HTMLImageElement);
      if (key) {
        const img = el as HTMLImageElement;
        const run: Run = { image: key };
        if (img.alt) run.alt = img.alt;
        const w = Number(img.getAttribute('width'));
        const hgt = Number(img.getAttribute('height'));
        if (w > 0) run.width = w;
        if (hgt > 0) run.height = hgt;
        open(ctx).runs.push(run);
      }
      return;
    }
    if (!BLOCK.has(tag) && tag !== 'tr' && tag !== 'td' && tag !== 'th' && tag !== 'tbody' && tag !== 'thead' && tag !== 'tfoot') {
      const f = inlineFormat(el, fmt);
      for (const c of Array.from(el.childNodes)) walk(c, f, ctx);
      return;
    }

    // Block-level element.
    if (tag === 'hr') {
      flush();
      blocks.push({ type: 'rule' });
      return;
    }
    if (tag === 'table') {
      flush();
      blocks.push(tableFromDom(el, lookupImage, opts));
      return;
    }
    flush();
    const align = alignOf(el) ?? ctx.align;
    const next: BlockCtx = { ...ctx, ...(align ? { align } : {}) };
    if (/^h[1-6]$/.test(tag)) next.style = tag as ParagraphStyle;
    else if (tag === 'blockquote') next.style = 'quote';
    else if (tag === 'pre') {
      next.style = 'code';
      next.pre = true;
    }
    if (tag === 'ul' || tag === 'ol') {
      next.listDepth = ctx.listDepth + 1;
      next.ordered = tag === 'ol';
    }
    if (tag === 'li') {
      next.list = { ordered: ctx.ordered, level: Math.max(0, ctx.listDepth - 1) };
      next.style = 'normal';
    }
    const f = tag === 'pre' ? fmt : inlineFormat(el, fmt);
    for (const c of Array.from(el.childNodes)) {
      // Nested lists inside <li> start a new paragraph.
      walk(c, f, next);
    }
    flush();
  };

  walk(root, {}, { style: 'normal', listDepth: 0, ordered: false, pre: false });
  flush();
  return blocks;
}

function trimParagraph(p: Paragraph, preserve: boolean): void {
  if (preserve) return;
  const first = p.runs[0];
  if (first && isTextRun(first)) {
    first.text = first.text.replace(/^ +/, '');
    if (!first.text) p.runs.shift();
  }
  const last = p.runs[p.runs.length - 1];
  if (last && isTextRun(last)) {
    last.text = last.text.replace(/ +$/, '');
    if (!last.text) p.runs.pop();
  }
}

function tableFromDom(
  table: HTMLElement,
  lookupImage: (img: HTMLImageElement) => string | undefined,
  opts: DomToBlocksOptions,
): Block {
  const rows: TableCell[][] = [];
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    if (tr.closest('table') !== table) continue;
    const row: TableCell[] = [];
    for (const cell of Array.from(tr.children)) {
      if (cell.localName !== 'td' && cell.localName !== 'th') continue;
      const inner = domToBlocks(cell, lookupImage, opts).flatMap((b): Paragraph[] =>
        b.type === 'paragraph' ? [b] : b.type === 'table' ? b.rows.flat().flatMap((c) => c.blocks) : [],
      );
      row.push({ blocks: inner.length ? inner : [{ type: 'paragraph', style: 'normal', runs: [] }] });
    }
    if (row.length) rows.push(row);
  }
  return { type: 'table', rows };
}

function alignOf(el: HTMLElement): Align | undefined {
  const raw = (el.style?.textAlign || el.getAttribute('align') || '').toLowerCase();
  if (raw === 'center' || raw === 'right' || raw === 'justify') return raw;
  if (raw === 'left' || raw === 'start') return 'left';
  if (raw === 'end') return 'right';
  return undefined;
}

function inlineFormat(el: HTMLElement, parent: TextFormat): TextFormat {
  const f: TextFormat = { ...parent };
  const tag = el.localName.toLowerCase();
  if (tag === 'b' || tag === 'strong') f.bold = true;
  if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'var') f.italic = true;
  if (tag === 'u' || tag === 'ins') f.underline = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') f.strike = true;
  if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') f.code = true;
  if (tag === 'a') {
    const href = el.getAttribute('href');
    if (href && isSafeUrl(href)) f.link = href;
  }
  const style = el.style;
  if (style) {
    const weight = style.fontWeight;
    if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) f.bold = true;
    else if (weight === 'normal' || (Number(weight) > 0 && Number(weight) < 600)) delete f.bold;
    if (style.fontStyle === 'italic' || style.fontStyle === 'oblique') f.italic = true;
    else if (style.fontStyle === 'normal') delete f.italic;
    const deco = `${style.textDecoration} ${style.textDecorationLine}`;
    if (deco.includes('underline')) f.underline = true;
    if (deco.includes('line-through')) f.strike = true;
    const size = /^([\d.]+)(pt|px)$/.exec(style.fontSize ?? '');
    if (size) f.size = Math.round((size[2] === 'px' ? (Number(size[1]) * 72) / 96 : Number(size[1])) * 10) / 10;
    const color = cssColorToHex(style.color ?? '');
    if (color) f.color = color;
  }
  return f;
}

/** `rgb(1, 2, 3)` / `#abc` / `#aabbcc` -> `#aabbcc` (other forms ignored). */
export function cssColorToHex(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`;
  return undefined;
}

/** Sanitise arbitrary HTML into the supported subset (DOC-008). */
export function sanitizeHtml(html: string, lookupImage: (img: HTMLImageElement) => string | undefined = () => undefined): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const blocks = domToBlocks(parsed.body, lookupImage);
  const div = document.createElement('div');
  div.append(
    blocksToDom(blocks, document, (key) => {
      const img = Array.from(parsed.images).find((i) => lookupImage(i) === key);
      return img ? { url: img.src } : undefined;
    }),
  );
  return div.innerHTML;
}
