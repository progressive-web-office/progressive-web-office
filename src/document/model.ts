/**
 * Format-neutral rich-text document model shared by the DOCX, ODT, Markdown
 * and MDZ readers/writers and by the WYSIWYG editor.
 */

export type ParagraphStyle = 'normal' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'quote' | 'code';
export type Align = 'left' | 'center' | 'right' | 'justify';

export interface TextFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  /** Hyperlink target (validated with `isSafeUrl` before rendering). */
  link?: string;
  /** Font size in points. */
  size?: number;
  /** Text colour as `#rrggbb`. */
  color?: string;
  /** Font family name (e.g. `Liberation Serif`). */
  font?: string;
  /** Background (highlight) colour as `#rrggbb`. */
  highlight?: string;
}

export interface TextRun extends TextFormat {
  /** Text; `\n` is a line break, `\t` a tab. */
  text: string;
}

export interface ImageRun {
  /** Key into `RichDocument.resources` (empty when the image is external). */
  image: string;
  /** Original reference for images that could not be embedded (e.g. Markdown URL). */
  src?: string;
  alt?: string;
  /** Picture title; a diagram language (e.g. `mermaid`) marks a rendered diagram whose `alt` is the source (DIAG-005). */
  title?: string;
  /** Display size in CSS pixels, when known. */
  width?: number;
  height?: number;
}

/** An equation, stored as LaTeX (MATH-001). */
export interface MathRun {
  math: string;
  /** Display (block) equation rather than inline. */
  display?: boolean;
}

/** Languages of executable code cells (CODE-001). */
export type CodeLang = 'python' | 'javascript';

/** Diagram languages understood by the editor (DIAG-001). */
export type DiagramLang = 'mermaid';

/** A diagram, stored as source text and rendered on demand (DIAG-001). */
export interface DiagramRun {
  diagram: string;
  lang: DiagramLang;
}

/** The last result of running a code cell, kept in the document (CODE-005). */
export interface CellOutput {
  text: string;
  error?: boolean;
  /** Figures, as keys into `RichDocument.resources`. */
  images?: string[];
}

/** An executable code cell, run on request in a sandbox (CODE-001). */
export interface CodeCellRun {
  cell: string;
  lang: CodeLang;
  output?: CellOutput;
}

/** A footnote, numbered automatically where it is referenced (DOC-022). */
export interface FootnoteRun {
  /** The note's content (text and equations; several paragraphs separated by `\n\n`). */
  footnote: Run[];
}

export type Run = TextRun | ImageRun | MathRun | DiagramRun | CodeCellRun | FootnoteRun;

export interface ListInfo {
  ordered: boolean;
  /** Nesting level, 0-based. */
  level: number;
}

/** Direct paragraph spacing (DOC-020); lengths in points. */
export interface ParagraphLayout {
  /** Left indent. */
  indent?: number;
  /** First-line indent (negative for a hanging indent). */
  firstLine?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  /** Line spacing as a multiple of single spacing (1.15, 1.5, 2…). */
  lineHeight?: number;
}

export interface Paragraph extends ParagraphLayout {
  type: 'paragraph';
  style: ParagraphStyle;
  align?: Align;
  list?: ListInfo;
  runs: Run[];
}

/** Monospaced font names: text in them is inline code. */
export const MONO_FONT = /mono|courier|consolas|menlo|monaco|source code|fira code/i;

export const LAYOUT_KEYS: (keyof ParagraphLayout)[] = ['indent', 'firstLine', 'spaceBefore', 'spaceAfter', 'lineHeight'];

export interface TableCell {
  blocks: Paragraph[];
}

export interface Table {
  type: 'table';
  rows: TableCell[][];
}

export interface Rule {
  type: 'rule';
  /** A page break rather than a horizontal line (DOC-021). */
  page?: boolean;
}

export const PAGE_BREAK: Rule = { type: 'rule', page: true };

/** A table of contents, generated from the headings (DOC-023). */
export interface Toc {
  type: 'toc';
  /** Deepest heading level listed (default 3). */
  levels?: number;
}

export type Block = Paragraph | Table | Rule | Toc;

export interface Resource {
  data: Uint8Array;
  mediaType: string;
  /** Original file name, when known. */
  name?: string;
}

/** Document properties (DOC-017), mapped to each format's metadata. */
export interface DocumentMeta {
  title?: string;
  author?: string;
  /** Creation or publication date, ISO 8601 (`YYYY-MM-DD` or a full timestamp). */
  date?: string;
  subject?: string;
  description?: string;
  keywords?: string[];
  /** BCP 47 language tag, e.g. `fr` or `en-GB`. */
  language?: string;
  /** Licence, preferably an SPDX identifier such as `CC-BY-4.0`. */
  license?: string;
}

/** Fields of DocumentMeta in display order. */
export const META_FIELDS = ['title', 'author', 'date', 'subject', 'description', 'keywords', 'language', 'license'] as const;

/** Drop empty values (empty strings, empty keyword lists). */
export function cleanMeta(meta: DocumentMeta): DocumentMeta {
  const out: DocumentMeta = {};
  for (const key of META_FIELDS) {
    const value = meta[key];
    if (key === 'keywords') {
      const list = (value as string[] | undefined)?.map((k) => k.trim()).filter(Boolean) ?? [];
      if (list.length) out.keywords = list;
    } else if (typeof value === 'string' && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

/** `2026-09-30T00:00:00Z` → `2026-09-30` (dates without a time of day). */
export function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?(?:Z)?$/, '$1');
}

/** ISO timestamp for formats that need one (OOXML, ODF); undefined when the date is not ISO. */
export function isoTimestamp(date: string | undefined, zulu: boolean): string | undefined {
  if (!date) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00${zulu ? 'Z' : ''}`;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const iso = parsed.toISOString().replace(/\.\d+Z$/, 'Z');
  return zulu ? iso : iso.replace(/Z$/, '');
}

/** Text of a header or footer zone; `{page}`, `{pages}`, `{title}` and `{date}` are fields (DOC-024). */
export interface PageZones {
  left?: string;
  center?: string;
  right?: string;
}

export interface PageSetup {
  header?: PageZones;
  footer?: PageZones;
}

export const PAGE_FIELDS = ['page', 'pages', 'title', 'date'] as const;
export type PageField = (typeof PAGE_FIELDS)[number];

/** A zone's text split into literal text and fields. */
export function zoneParts(text: string): (string | { field: PageField })[] {
  const out: (string | { field: PageField })[] = [];
  for (const part of text.split(/(\{(?:page|pages|title|date)\})/)) {
    if (!part) continue;
    const m = /^\{(page|pages|title|date)\}$/.exec(part);
    out.push(m ? { field: m[1] as PageField } : part);
  }
  return out;
}

/** Drop empty zones and empty header/footer; undefined when nothing is left. */
export function cleanPageSetup(page: PageSetup | undefined): PageSetup | undefined {
  const zones = (z: PageZones | undefined): PageZones | undefined => {
    if (!z) return undefined;
    const out: PageZones = {};
    for (const k of ['left', 'center', 'right'] as const) if (z[k]?.trim()) out[k] = z[k]!.trim();
    return Object.keys(out).length ? out : undefined;
  };
  const header = zones(page?.header);
  const footer = zones(page?.footer);
  return header || footer ? { ...(header ? { header } : {}), ...(footer ? { footer } : {}) } : undefined;
}

export interface RichDocument {
  blocks: Block[];
  /** Header and footer (DOC-024). */
  page?: PageSetup;
  /** Embedded binary resources (images), content-addressed. */
  resources: Map<string, Resource>;
  meta: DocumentMeta;
  /** Format-specific data preserved for round-trips (e.g. MDZ extras). */
  extras?: Record<string, unknown>;
}

export const isImageRun = (run: Run): run is ImageRun => 'image' in run;
export const isMathRun = (run: Run): run is MathRun => 'math' in run;
export const isCodeCellRun = (run: Run): run is CodeCellRun => 'cell' in run;
export const isDiagramRun = (run: Run): run is DiagramRun => 'diagram' in run;
export const isTextRun = (run: Run): run is TextRun => 'text' in run;
export const isFootnoteRun = (run: Run): run is FootnoteRun => 'footnote' in run;

/** Runs split at blank lines (`\n\n`) into paragraphs (footnotes hold several). */
export function splitParagraphs(runs: Run[]): Run[][] {
  const out: Run[][] = [[]];
  for (const run of runs) {
    if (!('text' in run) || !run.text.includes('\n\n')) {
      out[out.length - 1]!.push(run);
      continue;
    }
    run.text.split(/\n\n+/).forEach((part, i) => {
      if (i > 0) out.push([]);
      if (part) out[out.length - 1]!.push({ ...run, text: part });
    });
  }
  return out;
}

/** Plain text of runs (footnotes and atoms left out). */
export const runsText = (runs: Run[]): string => runs.map((r) => ('text' in r ? r.text : '')).join('');

export function emptyDocument(): RichDocument {
  return { blocks: [paragraph('')], resources: new Map(), meta: {} };
}

export function paragraph(text: string, opts: Partial<Omit<Paragraph, 'type' | 'runs'>> = {}): Paragraph {
  return { type: 'paragraph', style: opts.style ?? 'normal', ...opts, runs: text ? [{ text }] : [] };
}

const FORMAT_KEYS: (keyof TextFormat)[] = ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'size', 'color', 'font', 'highlight'];

export function sameFormat(a: TextFormat, b: TextFormat): boolean {
  return FORMAT_KEYS.every((k) => (a[k] || undefined) === (b[k] || undefined));
}

/** Copy only the truthy formatting flags (keeps objects minimal). */
export function cleanFormat(f: TextFormat): TextFormat {
  const out: TextFormat = {};
  for (const k of FORMAT_KEYS) {
    const v = f[k];
    if (v) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Merge adjacent text runs with identical formatting; drop empty runs. */
export function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (!isTextRun(run)) {
      out.push(run);
      continue;
    }
    if (!run.text) continue;
    const prev = out[out.length - 1];
    if (prev && isTextRun(prev) && sameFormat(prev, run)) {
      prev.text += run.text;
    } else {
      out.push({ text: run.text, ...cleanFormat(run) });
    }
  }
  return out;
}

export function paragraphText(p: Paragraph): string {
  return p.runs.map((r) => (isTextRun(r) ? r.text : '')).join('');
}

function blockText(b: Block): string[] {
  if (b.type === 'paragraph') return [paragraphText(b)];
  if (b.type === 'table') return b.rows.flatMap((row) => row.flatMap((c) => c.blocks.map(paragraphText)));
  return [];
}

export function plainText(doc: RichDocument): string {
  return doc.blocks.flatMap(blockText).join('\n');
}

export function wordCount(doc: RichDocument): { words: number; characters: number } {
  const text = plainText(doc);
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return { words, characters: text.replace(/\n/g, '').length };
}

/** Options shared by writers that need equations converted to MathML. */
export interface WriteOptions {
  /** LaTeX -> MathML conversions prepared asynchronously (see `prepareMath`). */
  mathml?: Map<string, string>;
  /** Diagram source -> rendered picture, prepared asynchronously (DIAG-005). */
  diagrams?: Map<string, RenderedDiagram>;
}

/** A diagram rasterised for formats that cannot render its source. */
export interface RenderedDiagram {
  png: Uint8Array;
  /** Display size in CSS pixels. */
  width: number;
  height: number;
}

/** Every distinct diagram source used in the blocks. */
export function collectDiagrams(blocks: Block[]): string[] {
  const out = new Set<string>();
  const visit = (bs: Block[]): void => {
    for (const b of bs) {
      if (b.type === 'paragraph') for (const r of b.runs) {
        if ('diagram' in r) out.add(r.diagram);
        // Footnotes hold equations too (DOC-022).
        if ('footnote' in r) for (const n of r.footnote) if ('diagram' in n) out.add(n.diagram);
      }
      if (b.type === 'table') for (const row of b.rows) for (const c of row) visit(c.blocks);
    }
  };
  visit(blocks);
  return [...out];
}

/** Every distinct LaTeX source used in the blocks. */
export function collectMath(blocks: Block[]): string[] {
  const out = new Set<string>();
  const visit = (bs: Block[]): void => {
    for (const b of bs) {
      if (b.type === 'paragraph') for (const r of b.runs) {
        if ('math' in r) out.add(r.math);
        // Footnotes hold equations too (DOC-022).
        if ('footnote' in r) for (const n of r.footnote) if ('math' in n) out.add(n.math);
      }
      if (b.type === 'table') for (const row of b.rows) for (const c of row) visit(c.blocks);
    }
  };
  visit(blocks);
  return [...out];
}

// --- lists -------------------------------------------------------------------

export interface ListItemNode {
  paragraph?: Paragraph;
  children: ListNode[];
}

export interface ListNode {
  ordered: boolean;
  items: ListItemNode[];
}

/**
 * Turn a sequence of list paragraphs (flat, with levels) into nested lists.
 * A change of list type at the same level starts a new sibling list.
 */
export function nestLists(paragraphs: Paragraph[]): ListNode[] {
  const roots: ListNode[] = [];
  const stack: { level: number; list: ListNode; last?: ListItemNode }[] = [];

  const openList = (level: number, ordered: boolean): void => {
    const list: ListNode = { ordered, items: [] };
    const top = stack[stack.length - 1];
    if (!top) {
      roots.push(list);
    } else {
      let parent = top.last;
      if (!parent) {
        parent = { children: [] };
        top.list.items.push(parent);
        top.last = parent;
      }
      parent.children.push(list);
    }
    stack.push({ level, list });
  };

  for (const p of paragraphs) {
    const level = p.list?.level ?? 0;
    const ordered = p.list?.ordered ?? false;
    while (stack.length && stack[stack.length - 1]!.level > level) stack.pop();
    let top = stack[stack.length - 1];
    if (top && top.level === level && top.list.ordered !== ordered) {
      stack.pop();
      top = undefined;
      openList(level, ordered);
    } else if (!top || top.level < level) {
      openList(level, ordered);
    }
    top = stack[stack.length - 1]!;
    const item: ListItemNode = { paragraph: p, children: [] };
    top.list.items.push(item);
    top.last = item;
  }
  return roots;
}

/**
 * Split consecutive list paragraphs into independent lists: a new list starts
 * when a top-level item changes type (bullet <-> numbered).
 */
export function splitListSegments(items: Paragraph[]): Paragraph[][] {
  const segments: Paragraph[][] = [];
  let topOrdered: boolean | undefined;
  for (const p of items) {
    const level = p.list?.level ?? 0;
    const ordered = !!p.list?.ordered;
    const current = segments[segments.length - 1];
    if (!current || (level === 0 && topOrdered !== undefined && topOrdered !== ordered)) {
      segments.push([p]);
      topOrdered = level === 0 ? ordered : undefined;
    } else {
      current.push(p);
      if (level === 0 && topOrdered === undefined) topOrdered = ordered;
    }
  }
  return segments;
}

/** Split blocks into runs of consecutive list paragraphs and other blocks. */
export function groupBlocks(blocks: Block[]): (Block | { type: 'list'; items: Paragraph[] })[] {
  const out: (Block | { type: 'list'; items: Paragraph[] })[] = [];
  for (const b of blocks) {
    if (b.type === 'paragraph' && b.list) {
      const last = out[out.length - 1];
      if (last && last.type === 'list') last.items.push(b);
      else out.push({ type: 'list', items: [b] });
    } else {
      out.push(b);
    }
  }
  return out;
}

// --- resources -----------------------------------------------------------------

/** Fast non-cryptographic 64-bit hash (cyrb53 x2), hex encoded. */
export function hashBytes(data: Uint8Array): string {
  let h1 = 0xdeadbeef ^ data.length;
  let h2 = 0x41c6ce57 ^ data.length;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i]!;
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** Add a resource (deduplicated by content) and return its key. */
export function addResource(doc: { resources: Map<string, Resource> }, data: Uint8Array, mediaType: string, name?: string): string {
  const key = hashBytes(data);
  if (!doc.resources.has(key)) doc.resources.set(key, { data, mediaType, ...(name ? { name } : {}) });
  return key;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
};

export function extensionForType(mediaType: string): string {
  return EXT_BY_TYPE[mediaType] ?? 'bin';
}

export function mediaTypeForName(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const found = Object.entries(EXT_BY_TYPE).find(([, e]) => e === ext);
  if (found) return found[0];
  if (ext === 'jpeg') return 'image/jpeg';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  return 'application/octet-stream';
}

// --- table of contents (DOC-023) ------------------------------------------------

export interface TocEntry {
  /** 1 for Heading 1… */
  level: number;
  text: string;
  /** Index of the heading in the blocks. */
  index: number;
}

/** The headings listed by a table of contents, in document order. */
export function tocEntries(blocks: Block[], levels = 3): TocEntry[] {
  const out: TocEntry[] = [];
  blocks.forEach((b, index) => {
    const m = b.type === 'paragraph' ? /^h(\d)$/.exec(b.style) : null;
    if (!m || b.type !== 'paragraph') return;
    const level = Number(m[1]);
    const text = runsText(b.runs).replace(/\s+/g, ' ').trim();
    if (level <= levels && text) out.push({ level, text, index });
  });
  return out;
}
