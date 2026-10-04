/** OpenDocument Text (.odt) reader (DOC-002). */
import { namedFromOdf, styleId, type NamedStyle } from './styles';
import { fillOfStyle, fractionOfStyle, isSpaceStyle, stretchOfStyle } from './springs';
import type { BibEntry } from './bibliography';
import { attr, child, children, descendants, parseXml } from '../core/xml';
import { readZip, readZipText, type ZipEntries } from '../core/zip';
import {
  addResource,
  cleanFormat,
  emptyDocument,
  mediaTypeForName,
  normalizeRuns,
  PAGE_BREAK,
  cleanColumns,
  inColumns,
  type ColumnLayout,
  cleanPageSetup,
  type PageSetup,
  type PageNumberFormat,
  type Align,
  type Block,
  type Paragraph,
  type ParagraphLayout,
  type ParagraphStyle,
  type DocComment,
  type Revision,
  type RichDocument,
  type Run,
  type TableCell,
  seqKindOf,
  type FieldKind,
  type FieldFormat,
  type InputRun,
  resolveAnchors,
  unwrapEquationNumbers,
  type TextFormat,
} from './model';
import { diagramLangOf } from './diagram';
import { anchorOnWordBefore, pruneComments, renameComments } from './comments';
import { lengthToPx, ODF_BIB_FIELDS, ODF_NS, ODF_NUMBER_FORMAT, readOdfMeta } from './odf';
import { mathmlToLatex } from '../math/convert';

interface OdfStyle {
  name: string;
  family: string;
  parent?: string;
  automatic: boolean;
  format: TextFormat;
  align?: Align;
  /** Direct paragraph spacing, from automatic styles only (DOC-020). */
  layout?: ParagraphLayout;
  /** fo:break-before / fo:break-after="page" (DOC-021). */
  pageBefore?: boolean;
  pageAfter?: boolean;
  /** fo:break-before / fo:break-after="column" (DOC-049). */
  columnBefore?: boolean;
  columnAfter?: boolean;
  /** The columns of a section style (DOC-049). */
  columns?: ColumnLayout;
  /** DOC-053: the element, to read a named style from. */
  el?: Element;
}

/** Header and footer of the first master page, as zones split at tabs (DOC-024). */
function readFurniture(xml: Document, content?: Document): PageSetup | undefined {
  const masters = descendants(xml, 'master-page');
  const master = masters.find((m) => attr(m, 'name') === 'Standard') ?? masters[0];
  if (!master) return undefined;
  const setup: PageSetup = {};
  // DOC-029: the number format of the page layout, a first number as the fields' offset.
  const layout = descendants(xml, 'page-layout').find((l) => attr(l, 'name') === attr(master, 'page-layout-name'));
  const numFormat = layout ? attr(descendants(layout, 'page-layout-properties')[0] ?? layout, 'num-format') : undefined;
  const format = (Object.entries(ODF_NUMBER_FORMAT) as [PageNumberFormat, string][]).find(([, v]) => v === numFormat)?.[0];
  if (format) setup.numberFormat = format;
  // DOC-046: the paper and its margins.
  const props = layout ? descendants(layout, 'page-layout-properties')[0] : undefined;
  if (props) {
    const mm = (name: string): number | undefined => {
      const pt = lengthPt(attr(props, name) ?? '');
      return pt === undefined ? undefined : Math.round(((pt * 25.4) / 72) * 10) / 10;
    };
    const [width, height] = [mm('page-width'), mm('page-height')];
    if (width && height) setup.geometry = { width, height, top: mm('margin-top') ?? 20, right: mm('margin-right') ?? 20, bottom: mm('margin-bottom') ?? 20, left: mm('margin-left') ?? 20 };
  }
  const field = descendants(master, 'page-number')[0];
  const adjust = field ? Number(attr(field, 'page-adjust')) : NaN;
  if (Number.isInteger(adjust)) setup.startAt = adjust + 1;
  // A title page: the first paragraph's style starts a master page without header and footer.
  if (content) {
    const empty = new Set(masters.filter((m) => m !== master && !child(m, 'header') && !child(m, 'footer')).map((m) => attr(m, 'name')));
    const first = descendants(content, 'text').find((e) => e.namespaceURI === ODF_NS.office);
    const para = first ? descendants(first, 'p').concat(descendants(first, 'h')).sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1))[0] : undefined;
    const styleName = para ? attr(para, 'style-name') : undefined;
    const style = descendants(content, 'style').find((s) => s.namespaceURI === ODF_NS.style && attr(s, 'name') === styleName);
    if (style && empty.has(attr(style, 'master-page-name'))) setup.hideOnFirstPage = true;
  }
  for (const kind of ['header', 'footer'] as const) {
    const part = child(master, kind);
    const p = part ? descendants(part, 'p').find((e) => (e.textContent ?? '').trim() || descendants(e, 'page-number').length) : undefined;
    if (!p) continue;
    let text = '';
    const walk = (el: Element): void => {
      for (const n of Array.from(el.childNodes)) {
        if (n.nodeType === 3) {
          text += n.textContent ?? '';
          continue;
        }
        if (n.nodeType !== 1) continue;
        const e = n as Element;
        switch (e.localName) {
          case 'tab':
            text += '\t';
            break;
          case 's':
            text += ' '.repeat(Number(attr(e, 'c') ?? 1) || 1);
            break;
          case 'page-number':
            text += '{page}';
            break;
          case 'page-count':
            text += '{pages}';
            break;
          case 'title':
            text += '{title}';
            break;
          case 'date':
            text += '{date}';
            break;
          default:
            walk(e);
        }
      }
    };
    walk(p);
    const parts = text.split('\t').map((x) => x.trim());
    setup[kind] = parts.length === 1 ? { left: parts[0] } : parts.length === 2 ? { left: parts[0], center: parts[1] } : { left: parts[0], center: parts[1], right: parts.slice(2).join(' ') };
  }
  return cleanPageSetup(setup);
}

/** `12pt`, `0.5in`, `1cm`… in points. */
/** Paragraph styles of the word processors themselves, not named styles of the user (DOC-053). */
const BUILTIN_PARAGRAPH = /^(Standard|Default|Text_20_body|Text_20_Body|Body_20_Text|First_20_line_20_indent|Hanging_20_indent|Heading|Heading_20_\d+|Title|Subtitle|Quotations|Preformatted_20_Text|Caption|Horizontal_20_Line|List.*|Numbering.*|Table_20_Contents|Table_20_Heading|Footnote|Endnote|Header.*|Footer.*|Contents.*|Index.*|Bibliography.*|Illustration|Figure|Drawing|Text|Frame_20_contents|Addressee|Sender|Signature|Marginalia|PWO_Space.*|Spring.*|Fill.*)$/;

function lengthPt(value: string | null): number | undefined {
  const m = /^(-?[\d.]+)(pt|in|cm|mm|px|pc)$/.exec(value?.trim() ?? '');
  if (!m) return undefined;
  const n = Number(m[1]);
  const factor = { pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, px: 0.75, pc: 12 }[m[2] as 'pt'];
  return Math.round(n * factor * 10) / 10;
}

/** FORM-003: an input field (named by its description) or a drop-down field as a form field. */
export function odfInputOf(el: Element): InputRun | undefined {
  const value = Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3 || (n as Element).localName === 'span' || (n as Element).localName === 's')
    .map((n) => ((n as Element).localName === 's' ? ' ' : (n.textContent ?? '')))
    .join('');
  if (el.localName === 'text-input') {
    const name = attr(el, 'description');
    return name ? { input: 'text', name, ...(value ? { value } : {}) } : undefined;
  }
  const name = attr(el, 'name');
  if (!name) return undefined;
  const options = children(el, 'label').map((l) => attr(l, 'value') ?? '');
  if (options.length === 2 && options[0] === '☐' && options[1] === '☒') return { input: 'checkbox', name, checked: value.trim() === '☒' };
  return { input: 'dropdown', name, options, ...(value ? { value } : {}) };
}

/** DOC-050: a fixed date (`2025-12-24…`) or time (`PT08H30M00S`, or a timestamp) as the field keeps it. */
function odfFixedValue(kind: string, value: string | null): string | undefined {
  if (!value) return undefined;
  if (kind === 'date') return /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
  if (kind !== 'time') return undefined;
  const d = /^PT(\d+)H(\d+)M/.exec(value) ?? /T(\d{2}):(\d{2})/.exec(value);
  return d ? `${d[1]!.padStart(2, '0')}:${d[2]!.padStart(2, '0')}` : undefined;
}

/** DOC-041: the fields of OpenDocument text read as fields. */
const ODT_FIELDS: Record<string, FieldKind> = {
  date: 'date',
  time: 'time',
  'page-number': 'page',
  'page-count': 'pages',
  title: 'title',
  'initial-creator': 'author',
  creator: 'author',
  'author-name': 'author',
  'file-name': 'filename',
};

const odfColor = (v: string | null): string | undefined => (v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined);

const MONO = /mono|courier|consolas|menlo|source code|liberation mono/i;

class OdtReader {
  private styles = new Map<string, OdfStyle>();
  /** list style name -> ordered flag per level (1-based index) */
  private listStyles = new Map<string, boolean[]>();
  readonly doc: RichDocument = emptyDocument();

  constructor(private readonly zip: ZipEntries) {}

  /** Sources carried by bibliography marks (DOC-027). */
  private entries = new Map<string, BibEntry>();
  private authorYear = false;
  /** Anchors met in the current paragraph (DOC-026). */
  private anchors: string[] = [];
  private anchorAlias = new Map<string, string>();

  read(): RichDocument {
    const content = readZipText(this.zip, 'content.xml');
    if (!content) throw new Error('Not an OpenDocument text: content.xml is missing.');
    const stylesText = readZipText(this.zip, 'styles.xml');
    if (stylesText) this.collectStyles(parseXml(stylesText), false);
    const xml = parseXml(content);
    this.collectStyles(xml, true);
    const body = xml.getElementsByTagNameNS(ODF_NS.office, 'text')[0];
    if (!body) throw new Error('Not an OpenDocument text: no office:text body.');
    for (const end of descendants(body, 'annotation-end')) this.annotationEnds.add(attr(end, 'name') ?? '');
    this.readChangedRegions(body);
    this.doc.blocks = this.readBlocks(body, undefined, 0);
    this.finishComments();
    resolveAnchors(this.doc.blocks, this.anchorAlias);
    if (this.entries.size) this.doc.references = { entries: [...this.entries.values()], ...(this.authorYear ? { style: 'author-year' as const } : {}) };
    if (!this.doc.blocks.length) this.doc.blocks = emptyDocument().blocks;
    if (this.named.size) this.doc.styles = [...this.named.values()];
    this.doc.meta = readOdfMeta(this.zip);
    if (stylesText) {
      const page = readFurniture(parseXml(stylesText), xml);
      if (page) this.doc.page = page;
    }
    return this.doc;
  }

  private collectStyles(xml: Document, fromContent: boolean): void {
    for (const s of descendants(xml, 'style')) {
      if (s.namespaceURI !== ODF_NS.style) continue;
      const name = attr(s, 'name');
      if (!name) continue;
      const automatic = s.parentElement?.localName === 'automatic-styles';
      const style: OdfStyle = { name, family: attr(s, 'family') ?? '', automatic: automatic && fromContent, format: {}, el: s };
      const parent = attr(s, 'parent-style-name');
      if (parent) style.parent = parent;
      const tp = child(s, 'text-properties');
      if (tp) {
        const weight = attr(tp, 'font-weight');
        if (weight === 'bold' || Number(weight) >= 600) style.format.bold = true;
        if (attr(tp, 'font-style') === 'italic' || attr(tp, 'font-style') === 'oblique') style.format.italic = true;
        const u = attr(tp, 'text-underline-style');
        if (u && u !== 'none') style.format.underline = true;
        const lt = attr(tp, 'text-line-through-style');
        if (lt && lt !== 'none') style.format.strike = true;
        if (attr(tp, 'font-variant') === 'small-caps') style.format.smallCaps = true;
        const family = (attr(tp, 'font-family') ?? attr(tp, 'font-name') ?? '').replace(/^['"]|['"]$/g, '');
        if (MONO.test(family)) style.format.code = true;
        else if (family && style.automatic) style.format.font = family;
        // Size, colour and highlight are direct formatting only: those of named
        // styles (headings…) belong to the style, not to every run.
        if (style.automatic) {
          const size = lengthPt(attr(tp, 'font-size'));
          if (size) style.format.size = size;
          const color = odfColor(attr(tp, 'color'));
          if (color) style.format.color = color;
          const bg = odfColor(attr(tp, 'background-color'));
          if (bg && bg !== '#ffffff') style.format.highlight = bg;
        }
      }
      const pp = child(s, 'paragraph-properties');
      const ta = pp ? attr(pp, 'text-align') : null;
      if (ta === 'center') style.align = 'center';
      else if (ta === 'end' || ta === 'right') style.align = 'right';
      else if (ta === 'justify') style.align = 'justify';
      else if (ta === 'start' || ta === 'left') style.align = 'left';
      if (pp && attr(pp, 'break-before') === 'page') style.pageBefore = true;
      if (pp && attr(pp, 'break-after') === 'page') style.pageAfter = true;
      if (pp && attr(pp, 'break-before') === 'column') style.columnBefore = true;
      if (pp && attr(pp, 'break-after') === 'column') style.columnAfter = true;
      // DOC-049: the columns of a section.
      const sp = child(s, 'section-properties');
      const cols = sp ? child(sp, 'columns') : undefined;
      if (cols) {
        const count = Number(attr(cols, 'column-count')) || 1;
        const gap = lengthPt(attr(cols, 'column-gap'));
        const sep = child(cols, 'column-sep');
        const sepWidth = sep ? lengthPt(attr(sep, 'width')) : undefined;
        const columns = cleanColumns({ count, gap: gap !== undefined ? Math.round(gap * 100) / 100 : undefined, rule: !!sep && sepWidth !== 0 && attr(sep, 'style') !== 'none' });
        if (columns) style.columns = columns;
      }
      if (pp && style.automatic) {
        const layout: ParagraphLayout = {};
        const left = lengthPt(attr(pp, 'margin-left'));
        if (left) layout.indent = left;
        const first = lengthPt(attr(pp, 'text-indent'));
        if (first) layout.firstLine = first;
        const before = lengthPt(attr(pp, 'margin-top'));
        if (before !== undefined) layout.spaceBefore = before;
        const after = lengthPt(attr(pp, 'margin-bottom'));
        if (after !== undefined) layout.spaceAfter = after;
        const lh = /^(\d+)%$/.exec(attr(pp, 'line-height') ?? '');
        if (lh && lh[1] !== '100') layout.lineHeight = Number(lh[1]) / 100;
        if (Object.keys(layout).length) style.layout = layout;
      }
      this.styles.set(`${style.family}:${name}`, style);
    }
    for (const ls of descendants(xml, 'list-style')) {
      const name = attr(ls, 'name');
      if (!name) continue;
      const levels: boolean[] = [];
      for (const lvl of children(ls)) {
        const n = Number(attr(lvl, 'level') ?? 1);
        levels[n] = lvl.localName === 'list-level-style-number';
      }
      this.listStyles.set(name, levels);
    }
  }

  private chain(family: string, name: string | null): OdfStyle[] {
    const out: OdfStyle[] = [];
    const seen = new Set<string>();
    while (name && !seen.has(name)) {
      seen.add(name);
      const s = this.styles.get(`${family}:${name}`);
      if (!s) {
        out.push({ name, family, automatic: false, format: {} });
        break;
      }
      out.push(s);
      name = s.parent ?? null;
    }
    return out;
  }

  /** DOC-053: the named styles met, by their name in the file. */
  private named = new Map<string, NamedStyle>();

  private namedStyle(chain: OdfStyle[]): string | undefined {
    const own = chain.find((s) => !s.automatic && s.family === 'paragraph');
    if (!own?.el || BUILTIN_PARAGRAPH.test(own.name)) return undefined;
    let found = this.named.get(own.name);
    if (!found) {
      const display = attr(own.el, 'display-name') ?? own.name.replace(/_20_/g, ' ').replace(/_([0-9a-f]{2})_/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
      const id = own.name.startsWith('PWO_') ? own.name.slice(4) : styleId(display, [...this.named.values()].map((n) => n.id));
      found = namedFromOdf(id, display, child(own.el, 'paragraph-properties') ?? undefined, child(own.el, 'text-properties') ?? undefined, (v) => lengthPt(v));
      this.named.set(own.name, found);
    }
    return found.id;
  }

  private paragraphKind(name: string | null): ParagraphStyle | 'rule' {
    for (const s of this.chain('paragraph', name)) {
      const m = /^Heading_20_(\d)$/.exec(s.name);
      if (m) return `h${Math.min(6, Number(m[1]))}` as ParagraphStyle;
      if (s.name === 'Title') return 'h1';
      if (s.name === 'Subtitle') return 'h2';
      if (s.name === 'Quotations') return 'quote';
      if (s.name === 'Caption') return 'caption';
      if (s.name === 'Preformatted_20_Text') return 'code';
      if (s.name === 'Horizontal_20_Line') return 'rule';
    }
    return 'normal';
  }

  private readBlocks(container: Element, listStyle: string | undefined, depth: number): Block[] {
    const out: Block[] = [];
    for (const el of children(container)) {
      if (el.namespaceURI === ODF_NS.text) {
        switch (el.localName) {
          case 'p':
          case 'h': {
            const b = this.readParagraph(el, depth > 0 ? { ordered: this.isOrdered(listStyle, depth), level: depth - 1 } : undefined);
            // Page breaks set on the paragraph's style (DOC-021).
            const chain = this.chain('paragraph', attr(el, 'style-name'));
            const before = chain.some((s) => s.pageBefore);
            const after = chain.some((s) => s.pageAfter);
            const empty = b.type === 'paragraph' && !b.runs.length;
            if (before && out.length) out.push({ ...PAGE_BREAK });
            // DOC-049: column breaks likewise.
            const colBefore = !before && chain.some((s) => s.columnBefore);
            const colAfter = !after && chain.some((s) => s.columnAfter);
            if (colBefore && out.length) out.push({ type: 'rule', column: true });
            if (!(empty && (before || after || colBefore || colAfter))) out.push(b);
            if (after) out.push({ ...PAGE_BREAK });
            if (colAfter) out.push({ type: 'rule', column: true });
            break;
          }
          case 'list': {
            const style = attr(el, 'style-name') ?? listStyle;
            for (const item of children(el)) {
              if (item.localName === 'list-item' || item.localName === 'list-header') {
                out.push(...this.readBlocks(item, style, depth + 1));
              }
            }
            break;
          }
          case 'bibliography':
            // DOC-027: regenerated from the citations.
            out.push({ type: 'bibliography' });
            break;
          case 'table-of-content': {
            // DOC-023: regenerated from the headings.
            const source = child(el, 'table-of-content-source');
            const levels = Number(source ? attr(source, 'outline-level') : 3) || 3;
            out.push(levels === 3 ? { type: 'toc' } : { type: 'toc', levels });
            break;
          }
          case 'section': {
            // DOC-028: a linked section is a sub-document of a master document.
            const source = child(el, 'section-source');
            const href = source ? (source.getAttributeNS(ODF_NS.xlink, 'href') ?? attr(source, 'href')) : null;
            if (href && !/^[a-z]+:/i.test(href)) {
              out.push({ type: 'include', src: decodeURI(href.replace(/^\.\.\//, '')) });
              break;
            }
            // TEACH-001: a section named Solution… holds solutions.
            const solution = /^(solution|corrig|answer)/i.test(attr(el, 'name') ?? '');
            const inner = this.readBlocks(el, listStyle, depth).map((b) => (solution && b.type === 'paragraph' ? { ...b, solution: true } : b));
            // DOC-049: a section in columns.
            const columns = this.chain('section', attr(el, 'style-name')).find((st) => st.columns)?.columns;
            out.push(...(columns ? inColumns(inner, columns) : inner));
            break;
          }
          case 'index-body':
          case 'illustration-index':
          case 'table-index':
          case 'alphabetical-index':
            out.push(...this.readBlocks(child(el, 'index-body') ?? el, listStyle, depth));
            break;
          default:
            break;
        }
      } else if (el.namespaceURI === ODF_NS.table && el.localName === 'table') {
        out.push(this.readTable(el));
      }
    }
    return out;
  }

  private isOrdered(listStyle: string | undefined, depth: number): boolean {
    if (!listStyle) return false;
    return this.listStyles.get(listStyle)?.[depth] ?? false;
  }

  private readParagraph(el: Element, list?: { ordered: boolean; level: number }): Block {
    const styleName = attr(el, 'style-name');
    let kind = this.paragraphKind(styleName);
    if (el.localName === 'h' && kind === 'normal') {
      const level = Number(attr(el, 'outline-level') ?? 1) || 1;
      kind = `h${Math.min(6, level)}` as ParagraphStyle;
    }
    const chain = this.chain('paragraph', styleName);
    // DOC-042: a spring or a space, kept as the space it was last shown with.
    const size = chain.find((s) => s.layout?.spaceBefore !== undefined)?.layout?.spaceBefore;
    const stretch = chain.map((s) => stretchOfStyle(s.name)).find((w) => w !== undefined);
    if (stretch !== undefined) return { type: 'space', stretch, ...(size ? { size } : {}) };
    const fraction = chain.map((s) => fractionOfStyle(s.name)).find((f) => f !== undefined);
    if (fraction !== undefined) return { type: 'space', fraction, ...(size ? { size } : {}) };
    if (chain.some((s) => isSpaceStyle(s.name))) return { type: 'space', size: size ?? 0 };
    const para: Paragraph = { type: 'paragraph', style: kind === 'rule' ? 'normal' : kind, runs: [] };
    // DOC-053: a named style of the user (not one of the usual ones), kept as such.
    if (kind === 'normal') {
      const named = this.namedStyle(chain);
      if (named) para.named = named;
    }
    const align = chain.find((s) => s.align)?.align;
    if (align && align !== 'left') para.align = align;
    if (list && !para.style.startsWith('h')) para.list = list;
    const layout = chain.find((s) => s.layout)?.layout;
    if (layout) Object.assign(para, list ? { ...layout, indent: undefined, firstLine: undefined } : layout);
    for (const k of ['indent', 'firstLine'] as const) if (para[k] === undefined) delete para[k];
    // Text formatting set on automatic paragraph styles applies to the whole paragraph.
    const base: TextFormat = {};
    for (const s of chain) if (s.automatic) Object.assign(base, s.format);
    if (para.style === 'code') delete base.code;
    this.anchors = [];
    this.readInline(el, base, para.runs, para.style === 'code');
    if (this.anchors.length) {
      para.id = this.anchors[0]!;
      for (const n of this.anchors.slice(1)) this.anchorAlias.set(n, para.id);
    }
    para.runs = normalizeRuns(unwrapEquationNumbers(para.runs));
    const first = para.runs[0];
    if (first && 'text' in first && para.style !== 'code') {
      first.text = first.text.replace(/^ +/, '');
      if (!first.text) para.runs.shift();
    }
    if (kind === 'rule' && !para.runs.length) return { type: 'rule' };
    return para;
  }

  private textFormat(name: string | null, parent: TextFormat): TextFormat {
    const f = { ...parent };
    const chain = this.chain('text', name);
    for (let i = chain.length - 1; i >= 0; i--) Object.assign(f, chain[i]!.format);
    if (chain.some((s) => s.name === 'Source_20_Text')) f.code = true;
    return f;
  }

  /** Annotations (REV-003): names with an end are ranges, the others points. */
  private annotationEnds = new Set<string>();
  private annotationNames = new Map<string, string>();
  private openComments: string[] = [];
  private comments: (DocComment & { parentName?: string })[] = [];

  private runFormat(fmt: TextFormat): TextFormat {
    const f = cleanFormat(fmt);
    if (this.openComments.length) f.comments = [...this.openComments];
    if (this.insertion && !f.deleted) f.inserted = { ...this.insertion };
    return f;
  }

  /** Tracked changes (REV-005): changed regions by id, the insertion being read. */
  private regions = new Map<string, { kind: string; by: Revision; content: Element }>();
  private insertion: Revision | undefined;

  private readChangedRegions(body: Element): void {
    for (const region of descendants(body, 'changed-region')) {
      const id = attr(region, 'id');
      const change = children(region).find((c) => ['insertion', 'deletion', 'format-change'].includes(c.localName));
      if (!id || !change) continue;
      const info = children(change, 'change-info')[0];
      const by: Revision = {};
      const creator = info && children(info).find((c) => c.localName === 'creator')?.textContent?.trim();
      const date = info && children(info).find((c) => c.localName === 'date')?.textContent?.trim();
      if (creator) by.author = creator;
      if (date) by.date = date;
      this.regions.set(id, { kind: change.localName, by, content: change });
    }
  }

  private readAnnotation(el: Element, out: Run[]): void {
    const id = `a${this.comments.length + 1}`;
    const name = attr(el, 'name');
    const text = (local: string): string | undefined => children(el).find((c) => c.localName === local)?.textContent?.trim() || undefined;
    const comment: DocComment & { parentName?: string } = { id, text: children(el, 'p').map((p) => p.textContent ?? '').join('\n') };
    const author = text('creator');
    if (author) comment.author = author;
    const initials = text('creator-initials');
    if (initials) comment.initials = initials;
    const date = text('date');
    if (date) comment.date = date;
    if (attr(el, 'resolved') === 'true') comment.resolved = true;
    const parent = attr(el, 'parent-name');
    if (parent) comment.parentName = parent;
    this.comments.push(comment);
    if (name) this.annotationNames.set(name, id);
    if (parent) return;
    if (name && this.annotationEnds.has(name)) this.openComments.push(id);
    else anchorOnWordBefore(out, id);
  }

  /** Comments numbered in the order they were written (by date), replies attached. */
  private finishComments(): void {
    if (!this.comments.length) return;
    const time = (c: DocComment): number => (c.date ? Date.parse(c.date) || Infinity : Infinity);
    const sorted = [...this.comments].sort((a, b) => time(a) - time(b));
    const ids = new Map(sorted.map((c, i) => [c.id, `c${i + 1}`]));
    this.doc.comments = sorted.map(({ parentName, ...c }) => {
      const parent = parentName ? this.annotationNames.get(parentName) : undefined;
      return parent ? { ...c, parent } : c;
    });
    renameComments(this.doc, ids);
    pruneComments(this.doc);
  }

  private readInline(el: Element, fmt: TextFormat, out: Run[], pre: boolean): void {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        const text = pre ? (n.nodeValue ?? '') : (n.nodeValue ?? '').replace(/[ \t\r\n]+/g, ' ');
        if (text) out.push({ text, ...this.runFormat(fmt) });
        continue;
      }
      if (n.nodeType !== 1) continue;
      const c = n as Element;
      if (c.namespaceURI === ODF_NS.text) {
        switch (c.localName) {
          case 's':
            out.push({ text: ' '.repeat(Math.max(1, Number(attr(c, 'c') ?? 1) || 1)), ...this.runFormat(fmt) });
            break;
          case 'tab':
            out.push({ text: '\t', ...this.runFormat(fmt) });
            break;
          case 'line-break':
            out.push({ text: '\n', ...this.runFormat(fmt) });
            break;
          case 'span': {
            // DOC-042: a tab in a "PWO Fill" span is a horizontal spring.
            const fill = this.chain('text', attr(c, 'style-name'))
              .map((s) => fillOfStyle(s.name))
              .find((w) => w !== undefined);
            if (fill !== undefined && children(c).some((t) => t.localName === 'tab')) out.push({ hfill: fill });
            else this.readInline(c, this.textFormat(attr(c, 'style-name'), fmt), out, pre);
            break;
          }
          case 'a': {
            const href = c.getAttributeNS(ODF_NS.xlink, 'href') ?? attr(c, 'href');
            const f = { ...fmt };
            if (href) f.link = href;
            this.readInline(c, this.textFormat(attr(c, 'style-name'), f), out, pre);
            break;
          }
          case 'note': {
            // DOC-022: footnotes (and endnotes, read as footnotes).
            const body = child(c, 'note-body');
            const runs: Run[] = [];
            for (const p of body ? children(body).filter((e) => e.localName === 'p' || e.localName === 'h') : []) {
              if (runs.length) runs.push({ text: '\n\n' });
              this.readInline(p, this.textFormat(null, {}), runs, false);
            }
            const note = normalizeRuns(runs);
            if (note.length) out.push({ footnote: note });
            break;
          }
          case 'bibliography-mark': {
            // DOC-027: the mark carries the source; neighbouring marks make one citation.
            const key = attr(c, 'identifier');
            if (!key) break;
            const fields: Record<string, string> = {};
            for (const f of ODF_BIB_FIELDS) {
              const v = attr(c, f);
              if (v) fields[f] = v;
            }
            const doi = attr(c, 'custom1');
            if (doi) fields.doi = doi;
            const type = attr(c, 'bibliography-type') ?? 'misc';
            if (!this.entries.has(key)) this.entries.set(key, { key, type: type === 'www' ? 'online' : type, fields });
            if (/^\(.*\d{4}/.test(c.textContent?.trim() ?? '')) this.authorYear = true;
            const prev = out[out.length - 1];
            if (prev && 'cite' in prev) prev.cite.push(key);
            else out.push({ cite: [key] });
            break;
          }
          case 'date':
          case 'time':
          case 'page-number':
          case 'page-count':
          case 'title':
          case 'initial-creator':
          case 'creator':
          case 'author-name':
          case 'file-name': {
            // DOC-041: a field computed when shown; a fixed date or time is its text.
            const field = ODT_FIELDS[c.localName];
            const fixedValue = attr(c, 'fixed') === 'true' ? odfFixedValue(c.localName, attr(c, c.localName === 'time' ? 'time-value' : 'date-value')) : undefined;
            if (field && (attr(c, 'fixed') !== 'true' || fixedValue) && (c.localName !== 'page-number' || (attr(c, 'select-page') ?? 'current') === 'current')) {
              // DOC-050: the format from the data style written by this application, a fixed date or time.
              const style = /^N(?:Date|Time)-(short|medium|full|iso)$/.exec(attr(c, 'data-style-name') ?? '')?.[1] as FieldFormat | undefined;
              out.push({ field, ...(style ? { format: style } : {}), ...(fixedValue ? { fixed: fixedValue } : {}) });
            } else this.readInline(c, fmt, out, pre);
            break;
          }
          case 'text-input':
          case 'drop-down': {
            // FORM-003: a field filled in, by its name: text, list, or a ☐/☒ check box.
            const input = odfInputOf(c);
            if (input) out.push(input);
            else this.readInline(c, fmt, out, pre);
            break;
          }
          case 'sequence': {
            // DOC-026: a numbered figure, table or equation.
            out.push({ seq: seqKindOf(attr(c, 'name') ?? '') });
            const name = attr(c, 'ref-name');
            if (name) this.anchors.push(name);
            break;
          }
          case 'bookmark':
          case 'bookmark-start':
          case 'reference-mark':
          case 'reference-mark-start': {
            const name = attr(c, 'name');
            if (name) this.anchors.push(name);
            break;
          }
          case 'bookmark-ref':
          case 'sequence-ref':
          case 'reference-ref':
          case 'note-ref': {
            const name = attr(c, 'ref-name');
            if (name && c.localName !== 'note-ref') out.push({ ref: name });
            else this.readInline(c, fmt, out, pre);
            break;
          }
          case 'change-start': {
            const region = this.regions.get(attr(c, 'change-id') ?? '');
            if (region?.kind === 'insertion') this.insertion = region.by;
            break;
          }
          case 'change-end':
            this.insertion = undefined;
            break;
          case 'change': {
            // The deleted text, kept in its changed region.
            const region = this.regions.get(attr(c, 'change-id') ?? '');
            if (region?.kind !== 'deletion') break;
            const deleted = { ...cleanFormat(fmt), deleted: region.by };
            children(region.content, 'p').forEach((p, i) => {
              if (i > 0) out.push({ text: ' ', ...deleted });
              const runs: Run[] = [];
              this.readInline(p, deleted, runs, pre);
              out.push(...runs);
            });
            break;
          }
          case 'annotation':
          case 'bookmark-end':
          case 'reference-mark-end':
          case 'soft-page-break':
          case 'tracked-changes':
            break;
          default:
            // fields (date, page-number...), meta, ruby... -> keep their text
            this.readInline(c, fmt, out, pre);
        }
      } else if (c.namespaceURI === ODF_NS.office && c.localName === 'annotation') {
        this.readAnnotation(c, out);
      } else if (c.namespaceURI === ODF_NS.office && c.localName === 'annotation-end') {
        const id = this.annotationNames.get(attr(c, 'name') ?? '');
        this.openComments = this.openComments.filter((x) => x !== id);
      } else if (c.namespaceURI === ODF_NS.draw && c.localName === 'frame') {
        this.readFrame(c, out);
      } else if (c.namespaceURI === ODF_NS.draw && c.localName === 'a') {
        this.readInline(c, fmt, out, pre);
      }
    }
  }

  private readFrame(frame: Element, out: Run[]): void {
    const object = children(frame, 'object')[0];
    if (object) {
      const href = (object.getAttributeNS(ODF_NS.xlink, 'href') ?? '').replace(/^\.\//, '').replace(/\/$/, '');
      const xml = href ? readZipText(this.zip, `${href}/content.xml`) : undefined;
      if (xml) {
        try {
          const math = parseXml(xml).documentElement;
          if (math.localName === 'math') {
            const run: Run = { math: mathmlToLatex(math) };
            if (math.getAttribute('display') === 'block') run.display = true;
            out.push(run);
          }
        } catch {
          /* not a formula object */
        }
      }
      return;
    }
    const image = children(frame, 'image')[0];
    if (!image) return;
    // A picture rendered from a diagram: keep the editable source (DIAG-005).
    const lang = diagramLangOf(child(frame, 'title')?.textContent);
    const source = child(frame, 'desc')?.textContent?.replace(/\s+$/, '');
    if (lang && source) {
      out.push({ diagram: source, lang });
      return;
    }
    const href = image.getAttributeNS(ODF_NS.xlink, 'href') ?? attr(image, 'href');
    if (!href || /^[a-z]+:/i.test(href)) return;
    const path = href.replace(/^\.\//, '');
    const data = this.zip[path];
    if (!data) return;
    const name = path.slice(path.lastIndexOf('/') + 1);
    const key = addResource(this.doc, data, attr(image, 'mime-type') ?? mediaTypeForName(name), name);
    const run: Run = { image: key };
    const alt = (child(frame, 'desc') ?? child(frame, 'title'))?.textContent?.trim();
    if (alt) run.alt = alt;
    const w = lengthToPx(attr(frame, 'width'));
    const h = lengthToPx(attr(frame, 'height'));
    if (w) run.width = Math.round(w);
    if (h) run.height = Math.round(h);
    out.push(run);
  }

  /** Table cells with their spans and header rows (DOC-025); covered cells are skipped. */
  private readTable(table: Element): Block {
    const rows: TableCell[][] = [];
    let header = false;
    const visit = (el: Element, inHeader: boolean): void => {
      for (const c of children(el)) {
        if (c.localName === 'table-row') {
          if (inHeader && rows.length === 0) header = true;
          const row: TableCell[] = [];
          for (const cell of children(c)) {
            if (cell.localName !== 'table-cell') continue;
            const repeat = Math.min(64, Number(attr(cell, 'number-columns-repeated') ?? 1) || 1);
            const colSpan = Number(attr(cell, 'number-columns-spanned') ?? 1) || 1;
            const rowSpan = Number(attr(cell, 'number-rows-spanned') ?? 1) || 1;
            const blocks = this.readBlocks(cell, undefined, 0).flatMap((b): Paragraph[] =>
              b.type === 'paragraph' ? [b] : b.type === 'table' ? b.rows.flat().flatMap((x) => x.blocks) : [],
            );
            for (let i = 0; i < repeat; i++) {
              const out: TableCell = { blocks: blocks.length ? structuredClone(blocks) : [{ type: 'paragraph', style: 'normal', runs: [] }] };
              if (colSpan > 1) out.colSpan = colSpan;
              if (rowSpan > 1) out.rowSpan = rowSpan;
              row.push(out);
            }
          }
          rows.push(row);
        } else if (['table-header-rows', 'table-rows', 'table-row-group'].includes(c.localName)) {
          visit(c, inHeader || c.localName === 'table-header-rows');
        }
      }
    };
    visit(table, false);
    return header ? { type: 'table', rows, header } : { type: 'table', rows };
  }

}

export function readOdt(bytes: Uint8Array): RichDocument {
  return new OdtReader(readZip(bytes)).read();
}
