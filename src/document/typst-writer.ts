/**
 * PDF-020: a text document as Typst source, to typeset it as a PDF in the
 * browser. Every run of text is a Typst string (`#"…";`), so that nothing in
 * it is read as markup; the look follows the page on screen (Calibri 11 pt,
 * line height 1.45, the sizes of the headings); numbers, cross-references and
 * citations are written as the editor shows them, cross-references linked.
 */
import { tex2typst } from 'tex2typst';
import { imageSize } from '../core/image-size';
import { citationsOf, citeRuns, formatEntry, type Citations } from './bibliography';
import { acceptAll } from './changes';
import { diagramsAsPictures } from './diagram';
import { isSafeUrl } from './html';
import { equationMark, typstString } from './typst-text';

export { typstString };
import {
  cleanPageSetup,
  columnSegments,
  crossTargets,
  defaultGeometry,
  extensionForType,
  fieldValue,
  groupBlocks,
  inputText,
  isCiteRun,
  isCodeCellRun,
  isDiagramRun,
  isFieldRun,
  isFillRun,
  isFootnoteRun,
  isImageRun,
  isInputRun,
  isMathRun,
  isRefRun,
  isSeqRun,
  nestLists,
  seqText,
  splitListSegments,
  tableGrid,
  textHeight,
  textWidth,
  zoneParts,
  type Block,
  type CodeCellRun,
  type ListNode,
  type MathRun,
  type PageGeometry,
  type Paragraph,
  type RichDocument,
  type Run,
  type SeqRun,
  type Table,
  type TextRun,
  type WriteOptions,
} from './model';
import type { NamedStyle } from './styles';

/** A family of fonts the PDF needs, fetched before typesetting (see `src/pdf/typst-fonts.ts`). */
export type FontFamily = 'carlito' | 'arimo' | 'tinos' | 'cousine' | 'caladea' | 'libertinus' | 'math';

export interface TypstOptions extends WriteOptions {
  /** Texts of the interface: the title of the list of references. */
  labels?: { references?: string };
  /** For the fields: today, and the name of the file. */
  now?: Date;
  fileName?: string;
}

export interface TypstOutput {
  /** `main.typ`. */
  source: string;
  /** Pictures, by their path in the Typst project (`/img/…`). */
  files: Map<string, Uint8Array>;
  /** The font families the document uses (metric-compatible stand-ins for Calibri, Arial…). */
  fonts: Set<FontFamily>;
  /** The equations, as converted, to test one by one when the document does not compile. */
  equations: { latex: string; typst: string }[];
}

const PT_PER_MM = 72 / 25.4;
const PT_PER_PX = 0.75;
const BODY_SIZE = 11;
/** The line height of the page on screen (CSS), and the space after a paragraph. */
const LINE = 1.45;
const PARA_AFTER = 8;
const HEADING_SIZE: Record<string, number> = { h1: 20, h2: 16, h3: 14, h4: 12, h5: 12, h6: 12 };
/** Browsers' margins of h1…h6, in em of the heading. */
const HEADING_MARGIN: Record<string, number> = { h1: 0.67, h2: 0.83, h3: 1, h4: 1.33, h5: 1.67, h6: 2.33 };
/** Picture formats Typst reads. */
const TYPST_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp']);


const num = (n: number): string => String(Math.round(n * 100) / 100);
const pt = (n: number): string => `${num(n)}pt`;
const rgb = (hex: string): string => (/^#[0-9a-f]{6}$/i.test(hex) ? `rgb("${hex}")` : 'black');

/** A label Typst accepts (`<…>`): letters, digits, `_`, `-`, `.`, `:`. */
const label = (id: string): string => `pwo-${id.replace(/[^\w.:-]/g, '_')}`;

// --- fonts ------------------------------------------------------------------------

/** The stand-in shipped for a font of the document (same widths for Calibri, Arial, Times…), and its family. */
export function fontStandIn(name: string): { family: string; files: FontFamily } {
  const n = name.toLowerCase();
  if (/calibri|carlito/.test(n)) return { family: 'Carlito', files: 'carlito' };
  if (/cambria|caladea/.test(n)) return { family: 'Caladea', files: 'caladea' };
  if (/mono|courier|consolas|menlo|monaco|cousine|code/.test(n)) return { family: 'Cousine', files: 'cousine' };
  if (/times|tinos|georgia|garamond|palatino|book|serif|roman|cambria|libertin|minion|baskerville|didot/.test(n) && !/sans/.test(n)) return { family: 'Tinos', files: 'tinos' };
  return { family: 'Arimo', files: 'arimo' };
}

class TypstWriter {
  readonly files = new Map<string, Uint8Array>();
  readonly fonts = new Set<FontFamily>(['carlito']);
  readonly equations: { latex: string; typst: string }[] = [];
  private readonly paths = new Map<string, string>();
  private readonly xref: ReturnType<typeof crossTargets>;
  private readonly cites: Citations;
  private readonly styles: Map<string, NamedStyle>;
  /** Labels written, so that links only go to targets that exist. */
  private readonly anchors = new Set<string>();
  private readonly geometry: PageGeometry;
  /** Width of the text where a picture stands (narrower in columns), in points. */
  private width: number;

  constructor(
    private readonly doc: RichDocument,
    private readonly opts: TypstOptions,
  ) {
    this.xref = crossTargets(doc.blocks);
    this.cites = citationsOf(citeRuns(doc.blocks), doc.references);
    this.styles = new Map((doc.styles ?? []).map((s) => [s.id, s]));
    this.geometry = cleanPageSetup(doc.page)?.geometry ?? defaultGeometry(doc.meta.language);
    this.width = textWidth(this.geometry) * PT_PER_MM;
    for (const p of this.allParagraphs(doc.blocks)) if (p.id && this.xref.targets.has(p.id)) this.anchors.add(p.id);
  }

  private allParagraphs(blocks: Block[]): Paragraph[] {
    const out: Paragraph[] = [];
    for (const b of blocks) {
      if (b.type === 'paragraph') out.push(b);
      else if (b.type === 'table') for (const row of b.rows) for (const cell of row) out.push(...cell.blocks);
    }
    return out;
  }

  write(): string {
    const body = this.blocks(this.doc.blocks);
    return [...this.preamble(), '', body.trimEnd(), ''].join('\n');
  }

  // --- the page -------------------------------------------------------------------

  private preamble(): string[] {
    const g = this.geometry;
    const page = cleanPageSetup(this.doc.page);
    const meta = this.doc.meta;
    const lang = (meta.language ?? '').toLowerCase().split('-')[0];
    const region = (meta.language ?? '').split('-')[1];
    const numbering = { decimal: '1', 'lower-roman': 'i', 'upper-roman': 'I', 'lower-alpha': 'a', 'upper-alpha': 'A' }[page?.numberFormat ?? 'decimal'];
    const zone = (text: string): string =>
      zoneParts(text)
        .map((p) =>
          typeof p === 'string'
            ? `#${typstString(p)};`
            : p.field === 'page'
              ? `#counter(page).display(${typstString(numbering)});`
              : p.field === 'pages'
                ? `#counter(page).final().first();`
                : p.field === 'title'
                  ? `#${typstString(meta.title ?? '')};`
                  : `#${typstString(fieldValue('date', { meta, now: this.opts.now }))};`,
        )
        .join('');
    const furniture = (kind: 'header' | 'footer'): string => {
      const z = page?.[kind];
      if (!z) return 'none';
      const row = `grid(columns: (1fr, 1fr, 1fr), align(left)[${zone(z.left ?? '')}], align(center)[${zone(z.center ?? '')}], align(right)[${zone(z.right ?? '')}])`;
      // DOC-029: no header and footer on the title page.
      return page?.hideOnFirstPage ? `context { if here().page() > 1 { ${row} } }` : `context ${row}`;
    };
    const keywords = meta.keywords?.length ? `, keywords: (${meta.keywords.map(typstString).join(', ')})` : '';
    return [
      `// ${meta.title ?? 'Document'} — typeset by Progressive Web Office`,
      `#set document(${[meta.title ? `title: ${typstString(meta.title)}` : '', meta.author ? `author: ${typstString(meta.author)}` : ''].filter(Boolean).join(', ')}${keywords})`,
      `#set page(width: ${pt(g.width * PT_PER_MM)}, height: ${pt(g.height * PT_PER_MM)}, margin: (top: ${pt(g.top * PT_PER_MM)}, right: ${pt(g.right * PT_PER_MM)}, bottom: ${pt(g.bottom * PT_PER_MM)}, left: ${pt(g.left * PT_PER_MM)}), header: ${furniture('header')}, footer: ${furniture('footer')}, numbering: none)`,
      // Each line is 1 em high, as in a browser: the leading is the rest of the line height.
      `#set text(font: ("Calibri", "Carlito"), size: ${BODY_SIZE}pt, fill: rgb("#1c2430"), top-edge: 0.8em, bottom-edge: -0.2em${lang ? `, lang: ${typstString(lang)}` : ''}${region ? `, region: ${typstString(region)}` : ''}, hyphenate: false)`,
      `#set par(leading: ${num(LINE - 1)}em, spacing: ${pt(PARA_AFTER)} + ${num(LINE - 1)}em, justify: false)`,
      `#show heading: set text(weight: "bold")`,
      ...Object.entries(HEADING_SIZE).map(([h, size]) => {
        const level = Number(h.slice(1));
        const m = HEADING_MARGIN[h]! * size;
        return `#show heading.where(level: ${level}): set block(above: ${pt(m)}, below: ${pt(m)})\n#show heading.where(level: ${level}): set text(size: ${size}pt)`;
      }),
      `#show raw: set text(font: ("Liberation Mono", "Cousine", "DejaVu Sans Mono"), size: 10pt)`,
      `#show link: set text(fill: rgb("#0563c1"))`,
      `#show link: underline`,
      `#show math.equation: set text(font: ("New Computer Modern Math", "Libertinus Serif"))`,
      ...(page?.startAt !== undefined ? [`#counter(page).update(${Math.max(0, Math.round(page.startAt))})`] : []),
    ];
  }

  // --- blocks --------------------------------------------------------------------

  private blocks(blocks: Block[]): string {
    return columnSegments(blocks)
      .map((s) => {
        if (!s.columns) return this.plainBlocks(s.blocks);
        const gap = s.columns.gap ?? 12;
        const outer = this.width;
        this.width = (outer - gap * (s.columns.count - 1)) / s.columns.count;
        const inner = this.plainBlocks(s.blocks);
        this.width = outer;
        return `#columns(${s.columns.count}, gutter: ${pt(gap)})[\n${inner.trimEnd()}\n]\n`;
      })
      .join('\n');
  }

  private plainBlocks(blocks: Block[]): string {
    const out: string[] = [];
    let code: string[] = [];
    let quote: Paragraph[] = [];
    const flush = (): void => {
      if (code.length) this.fonts.add('cousine');
      if (code.length) out.push(`#block(fill: rgb("#f2f4f7"), inset: (x: 6pt, y: 2pt), width: 100%, below: ${pt(PARA_AFTER)})[#raw(block: true, ${typstString(code.join('\n'))})]`);
      code = [];
      if (quote.length) {
        const body = quote.map((p) => this.paragraph(p)).join('\n\n');
        out.push(`#block(stroke: (left: 3pt + rgb("#c7d0dc")), inset: (left: 12pt), below: ${pt(PARA_AFTER)})[#set text(fill: rgb("#404a57"), style: "italic")\n${body}\n]`);
      }
      quote = [];
    };
    for (const group of groupBlocks(blocks)) {
      // CODE-001: a code cell, its code then its output and figures.
      const cell = group.type === 'paragraph' && group.runs.length === 1 && isCodeCellRun(group.runs[0]!) ? group.runs[0] : undefined;
      if (cell) {
        flush();
        out.push(this.cell(cell));
        continue;
      }
      if (group.type === 'paragraph' && group.style === 'code') {
        if (quote.length) flush();
        code.push(group.runs.map((r) => ('text' in r ? r.text : '')).join(''));
        continue;
      }
      if (group.type === 'paragraph' && group.style === 'quote') {
        if (code.length) flush();
        quote.push(group);
        continue;
      }
      flush();
      if (group.type === 'list') {
        for (const seg of splitListSegments(group.items)) for (const list of nestLists(seg)) out.push(this.list(list, ''));
      } else if (group.type === 'table') {
        out.push(this.table(group));
      } else if (group.type === 'toc') {
        out.push(`#outline(depth: ${Math.max(1, Math.min(6, group.levels ?? 3))})`);
      } else if (group.type === 'bibliography') {
        out.push(this.bibliography());
      } else if (group.type === 'space') {
        // DOC-042: springs share the free height of the page; fixed spaces keep theirs.
        if (group.stretch) out.push(`#v(${num(group.stretch)}fr)`);
        else if (group.fraction) out.push(`#v(${pt(group.fraction * textHeight(this.geometry) * PT_PER_MM)})`);
        else if (group.size) out.push(`#v(${pt(group.size)})`);
      } else if (group.type === 'include') {
        out.push(`#${typstString(`[${group.src}]`)};`);
      } else if (group.type === 'rule') {
        out.push(group.page ? '#pagebreak(weak: true)' : group.column ? '#colbreak()' : `#line(length: 100%, stroke: 0.75pt + rgb("#8a94a3"))`);
      } else {
        out.push(this.paragraph(group));
      }
    }
    flush();
    return out.filter(Boolean).join('\n\n') + '\n';
  }

  private paragraph(p: Paragraph): string {
    const anchor = p.id && this.anchors.has(p.id) ? `#metadata(none) <${label(p.id)}>` : '';
    const heading = HEADING_SIZE[p.style];
    if (heading) {
      const level = Number(p.style.slice(1));
      return `#heading(level: ${level})[${anchor}${this.inline(p.runs)}]`;
    }
    // DOC-026: a numbered equation, its number at the right.
    const seq = p.runs.find(isSeqRun) as SeqRun | undefined;
    const maths = p.runs.filter((r): r is MathRun => isMathRun(r) && !!r.display);
    if (seq?.seq === 'equation' && maths.length === 1 && p.runs.every((r) => r === seq || r === maths[0] || ('text' in r && !r.text.trim()))) {
      return `${anchor}#block(width: 100%, above: 6pt, below: 6pt)[#align(center)[${this.math(maths[0]!)}]#place(right + horizon)[#${typstString(seqText('equation', this.xref.numbers.get(seq) ?? 1))};]]`;
    }
    const named = p.named ? this.styles.get(p.named) : undefined;
    const caption = p.style === 'caption';
    // The direct values of the paragraph over those of its named style (DOC-053).
    const pick = <K extends 'align' | 'indent' | 'firstLine' | 'spaceBefore' | 'spaceAfter' | 'lineHeight'>(k: K): Paragraph[K] | NamedStyle[K] => (p[k] ?? named?.[k]) as Paragraph[K];
    const align = pick('align');
    const indent = pick('indent') ?? 0;
    const first = pick('firstLine') ?? 0;
    const before = pick('spaceBefore');
    const after = pick('spaceAfter');
    const lh = pick('lineHeight');
    let body = this.inline(p.runs);
    if (!body) body = '#box[]';
    // The text look of a named style, and of a caption.
    const textArgs: string[] = [];
    if (named?.font) textArgs.push(this.fontArg(named.font));
    if (named?.size) textArgs.push(`size: ${pt(named.size)}`);
    if (named?.color) textArgs.push(`fill: ${rgb(named.color)}`);
    if (named?.bold) textArgs.push('weight: "bold"');
    if (named?.italic || caption) textArgs.push('style: "italic"');
    if (caption) textArgs.push('size: 0.9em', 'fill: rgb("#44546a")');
    if (named?.underline) body = `#underline[${body}]`;
    if (named?.smallCaps) body = `#smallcaps[${body}]`;
    const sets: string[] = [];
    if (textArgs.length) sets.push(`#set text(${textArgs.join(', ')})`);
    // Inline content alone in a block is no paragraph for Typst: its settings go to an explicit one.
    const parArgs: string[] = [];
    // A line height n × single spacing is n × 1.2 em on screen (DOC-020).
    const leading = lh ? `${num(lh * 1.2 - 1)}em` : undefined;
    if (leading) parArgs.push(`leading: ${leading}`);
    if (align === 'justify') parArgs.push('justify: true');
    // A hanging indent: the first line at the left, the others further (DOC-020).
    if (first > 0) parArgs.push(`first-line-indent: (amount: ${pt(first)}, all: true)`);
    if (first < 0) parArgs.push(`hanging-indent: ${pt(-first)}`);
    if (parArgs.length) body = `#par(${parArgs.join(', ')})[${body}]`;
    const plain = !sets.length && !parArgs.length && !indent && before === undefined && after === undefined && !caption && (!align || align === 'left' || align === 'justify');
    if (plain) return `${anchor}${body}`;
    const gap = leading ?? `${num(LINE - 1)}em`;
    const above = before !== undefined ? `${pt(before)} + ${gap}` : caption ? `4pt + ${gap}` : 'auto';
    const below = after !== undefined ? `${pt(after)} + ${gap}` : caption ? `10pt + ${gap}` : 'auto';
    const left = indent + Math.min(0, first);
    const where = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
    return `${anchor}#block(width: 100%, above: ${above}, below: ${below}, inset: (left: ${pt(left)}))[${sets.join('\n')}${sets.length ? '\n' : ''}#align(${where})[${body}]]`;
  }

  /** A code cell as shown: its code (unless hidden), its output set apart, its figures and widgets' pictures (CODE-013, CODE-016). */
  private cell(run: CodeCellRun): string {
    const parts: string[] = [];
    this.fonts.add('cousine');
    if (!run.hidden && run.cell) parts.push(`#block(fill: rgb("#f6f8fa"), stroke: 0.75pt + rgb("#d6dce5"), radius: 4pt, inset: (x: 8pt, y: 5pt), width: 100%, below: 4pt)[#raw(block: true, lang: ${typstString(run.lang === 'cpp' ? 'cpp' : run.lang)}, ${typstString(run.cell)})]`);
    const text = run.output?.text.replace(/\n+$/, '');
    if (text) parts.push(`#block(stroke: (left: 2pt + rgb(${run.output?.error ? '"#b3261e"' : '"#c3cad5"'})), inset: (left: 8pt, y: 2pt), width: 100%, below: 4pt)[#raw(block: true, ${typstString(text)})]`);
    const pictures = [...(run.output?.images ?? []), ...(run.output?.widgets ?? []).map((w) => w.snapshot).filter((k): k is string => !!k)].filter((k) => this.doc.resources.has(k));
    if (pictures.length) parts.push(pictures.map((k) => this.image(k)).join(' '));
    return `#block(below: ${pt(PARA_AFTER)})[${parts.join('\n')}]`;
  }

  private list(list: ListNode, indent: string): string {
    const lines: string[] = [];
    for (const item of list.items) {
      const text = item.paragraph ? this.inline(item.paragraph.runs) : '';
      lines.push(`${indent}${list.ordered ? '+' : '-'} ${text || '#box[]'}`);
      for (const child of item.children) lines.push(this.list(child, `${indent}  `));
    }
    return lines.join('\n');
  }

  /** DOC-025: merged cells, the header row repeated on each page. */
  private table(t: Table): string {
    const { cols, slots } = tableGrid(t.rows);
    const outer = this.width;
    this.width = outer / cols - 9;
    const cells: string[] = [];
    slots.forEach((row, r) => {
      for (let c = 0; c < cols; c++) {
        const slot = row[c];
        if (!slot || slot.row !== r || slot.col !== c) continue;
        const span: string[] = [];
        if ((slot.cell.colSpan ?? 1) > 1) span.push(`colspan: ${slot.cell.colSpan}`);
        if ((slot.cell.rowSpan ?? 1) > 1) span.push(`rowspan: ${Math.min(slot.cell.rowSpan!, t.rows.length - r)}`);
        const body = slot.cell.blocks.map((p) => this.paragraph(p)).join('\n\n');
        cells.push(span.length ? `table.cell(${span.join(', ')})[${body}]` : `[${body}]`);
      }
    });
    this.width = outer;
    const header = t.header && t.rows.length > 1 ? (() => {
      const n = slots[0]!.filter((s, c) => s && s.row === 0 && s.col === c).length;
      return `table.header(${cells.splice(0, n).join(', ')}), `;
    })() : '';
    const fill = t.header ? `, fill: (_, y) => if y == 0 { rgb("#eef1f5") }` : '';
    return `#block(below: ${pt(PARA_AFTER)})[#set par(spacing: ${pt(4)})\n#show table.cell.where(y: 0): set text(weight: ${t.header ? '"semibold"' : '"regular"'})\n#table(columns: (${Array(cols).fill('1fr').join(', ')}), stroke: 0.75pt + rgb("#8a94a3"), inset: (x: 4.5pt, y: 3pt)${fill}, ${header}${cells.join(', ')})]`;
  }

  /** DOC-027: the list of the references cited, as on screen. */
  private bibliography(): string {
    const title = `#block(below: 6pt)[#text(size: 14pt, weight: "semibold")[#${typstString(this.opts.labels?.references ?? 'References')};]]`;
    const items = this.cites.cited.map((e) => {
      const body = this.inline(formatEntry(e));
      const tag = this.cites.numeric ? `#box(width: 2.5em)[#${typstString(`[${this.cites.numbers.get(e.key)}]`)};]` : '';
      return `#block(below: 4pt)[#par(hanging-indent: 2.5em)[${tag}${body}]]`;
    });
    return [title, ...items].join('\n');
  }

  // --- runs ------------------------------------------------------------------------

  private fontArg(font: string): string {
    const stand = fontStandIn(font);
    this.fonts.add(stand.files);
    return `font: (${typstString(font)}, ${typstString(stand.family)})`;
  }

  private math(run: MathRun): string {
    let typst: string;
    try {
      typst = tex2typst(run.math).trim();
    } catch {
      typst = '';
    }
    this.fonts.add('math');
    const k = this.equations.length;
    this.equations.push({ latex: run.math, typst });
    // Each equation is marked: one that Typst refuses is written as its LaTeX instead (see `typesetPdf`).
    const body = typst ? `$${run.display ? ' ' : ''}${typst}${run.display ? ' ' : ''}$` : `#raw(${typstString(run.math)})`;
    return equationMark(k, body);
  }

  private inline(runs: Run[]): string {
    let out = '';
    for (const run of runs) {
      if (isMathRun(run)) {
        out += run.display ? `#block(width: 100%, above: 6pt, below: 6pt)[#align(center)[${this.math(run)}]]` : this.math(run);
        continue;
      }
      if (isImageRun(run)) {
        out += this.image(run.image, run.width, run.alt);
        continue;
      }
      if (isDiagramRun(run)) continue; // replaced by diagramsAsPictures
      if (isCodeCellRun(run)) {
        // A cell among text: its code, inline.
        this.fonts.add('cousine');
        out +=  `#raw(${typstString(run.cell)});`;
        continue;
      }
      if (isSeqRun(run)) {
        out += `#${typstString(seqText(run.seq, this.xref.numbers.get(run) ?? 1))};`;
        continue;
      }
      if (isFillRun(run)) {
        out += `#h(${num(Math.max(0.01, run.hfill))}fr)`;
        continue;
      }
      if (isInputRun(run)) {
        out += `#${typstString(inputText(run))};`;
        continue;
      }
      if (isFieldRun(run)) {
        // DOC-041: the page fields are Typst's counters; the others are written as they show.
        if (run.field === 'page') out += '#context counter(page).display();';
        else if (run.field === 'pages') out += '#context counter(page).final().first();';
        else out += `#${typstString(fieldValue(run.field, { meta: this.doc.meta, now: this.opts.now, fileName: this.opts.fileName }, run))};`;
        continue;
      }
      if (isCiteRun(run)) {
        out += `#${typstString(this.cites.text(run))};`;
        continue;
      }
      if (isRefRun(run)) {
        const target = this.xref.targets.get(run.ref);
        const text = `#${typstString(target?.label ?? '??')};`;
        out += target && this.anchors.has(run.ref) ? `#link(<${label(run.ref)}>)[${text}]` : text;
        continue;
      }
      if (isFootnoteRun(run)) {
        // DOC-022: a blank line in the note starts a new paragraph of it.
        out += `#footnote[${this.inline(run.footnote.filter((r) => !isFootnoteRun(r)))}]`;
        continue;
      }
      out += this.text(run);
    }
    return out;
  }

  private text(run: TextRun): string {
    if (!run.text || run.deleted) return '';
    // Lines and tabs: a line break; a tab, a fixed space (Typst has no tab stops).
    let body = run.text
      .split('\n')
      .map((line) =>
        line
          .split('\t')
          .map((part) => (part ? (run.code ? `#raw(${typstString(part)});` : `#${typstString(part)};`) : ''))
          .join('#h(2em)'),
      )
      .join('#linebreak()');
    if (!body) return '';
    if (run.code) this.fonts.add('cousine');
    if (run.code) body = `#box(fill: rgb("#f2f4f7"), inset: (x: 2pt), outset: (y: 2pt), radius: 2pt)[${body}]`;
    const args: string[] = [];
    if (run.font) args.push(this.fontArg(run.font));
    if (run.size) args.push(`size: ${pt(run.size)}`);
    if (run.color) args.push(`fill: ${rgb(run.color)}`);
    if (args.length) body = `#text(${args.join(', ')})[${body}]`;
    if (run.strike) body = `#strike[${body}]`;
    if (run.smallCaps) body = `#smallcaps[${body}]`;
    if (run.underline) body = `#underline[${body}]`;
    if (run.italic) body = `#emph[${body}]`;
    if (run.bold) body = `#strong[${body}]`;
    if (run.highlight) body = `#highlight(fill: ${rgb(run.highlight)})[${body}]`;
    if (run.link && isSafeUrl(run.link)) body = `#link(${typstString(run.link)})[${body}]`;
    return body;
  }

  /** A picture at its size on screen, no wider than the text; formats Typst cannot read are left out. */
  private image(key: string, widthPx?: number, alt?: string): string {
    const res = this.doc.resources.get(key);
    if (!res || !TYPST_IMAGES.has(res.mediaType)) return alt ? `#${typstString(`[${alt}]`)};` : '';
    let path = this.paths.get(key);
    if (!path) {
      path = `/img/${key}.${extensionForType(res.mediaType)}`;
      this.paths.set(key, path);
      this.files.set(path, res.data);
    }
    const natural = widthPx ?? imageSize(res.data)?.width ?? svgWidth(res);
    const width = natural ? Math.min(natural * PT_PER_PX, this.width) : this.width;
    return `#box(image(${typstString(path)}, width: ${pt(width)}${alt ? `, alt: ${typstString(alt)}` : ''}))`;
  }
}

/** The width of an SVG picture from its root element, in pixels. */
function svgWidth(res: { data: Uint8Array; mediaType: string }): number | undefined {
  if (res.mediaType !== 'image/svg+xml') return undefined;
  const head = new TextDecoder().decode(res.data.subarray(0, 2048));
  const w = /<svg[^>]*\swidth="([\d.]+)(px)?"/.exec(head)?.[1];
  if (w) return Number(w);
  const box = /<svg[^>]*\sviewBox="[\d.\s-]+?\s([\d.]+)\s[\d.]+"/.exec(head)?.[1];
  return box ? Number(box) : undefined;
}

/** The document as Typst source, with its pictures and the fonts it needs. */
export function writeTypst(doc: RichDocument, opts: TypstOptions = {}): TypstOutput {
  // REV-005: the document as it reads once its tracked changes are accepted.
  const ready = diagramsAsPictures(acceptAll(doc), opts.diagrams);
  const writer = new TypstWriter(ready, opts);
  const source = writer.write();
  return { source, files: writer.files, fonts: writer.fonts, equations: writer.equations };
}
