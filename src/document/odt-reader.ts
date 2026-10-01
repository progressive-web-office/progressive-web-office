/** OpenDocument Text (.odt) reader (DOC-002). */
import { attr, child, children, descendants, parseXml } from '../core/xml';
import { readZip, readZipText, type ZipEntries } from '../core/zip';
import {
  addResource,
  cleanFormat,
  emptyDocument,
  mediaTypeForName,
  normalizeRuns,
  PAGE_BREAK,
  type Align,
  type Block,
  type Paragraph,
  type ParagraphLayout,
  type ParagraphStyle,
  type RichDocument,
  type Run,
  type TableCell,
  type TextFormat,
} from './model';
import { diagramLangOf } from './diagram';
import { lengthToPx, ODF_NS, readOdfMeta } from './odf';
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
}

/** `12pt`, `0.5in`, `1cm`… in points. */
function lengthPt(value: string | null): number | undefined {
  const m = /^(-?[\d.]+)(pt|in|cm|mm|px|pc)$/.exec(value?.trim() ?? '');
  if (!m) return undefined;
  const n = Number(m[1]);
  const factor = { pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, px: 0.75, pc: 12 }[m[2] as 'pt'];
  return Math.round(n * factor * 10) / 10;
}

const odfColor = (v: string | null): string | undefined => (v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined);

const MONO = /mono|courier|consolas|menlo|source code|liberation mono/i;

class OdtReader {
  private styles = new Map<string, OdfStyle>();
  /** list style name -> ordered flag per level (1-based index) */
  private listStyles = new Map<string, boolean[]>();
  readonly doc: RichDocument = emptyDocument();

  constructor(private readonly zip: ZipEntries) {}

  read(): RichDocument {
    const content = readZipText(this.zip, 'content.xml');
    if (!content) throw new Error('Not an OpenDocument text: content.xml is missing.');
    const stylesText = readZipText(this.zip, 'styles.xml');
    if (stylesText) this.collectStyles(parseXml(stylesText), false);
    const xml = parseXml(content);
    this.collectStyles(xml, true);
    const body = xml.getElementsByTagNameNS(ODF_NS.office, 'text')[0];
    if (!body) throw new Error('Not an OpenDocument text: no office:text body.');
    this.doc.blocks = this.readBlocks(body, undefined, 0);
    if (!this.doc.blocks.length) this.doc.blocks = emptyDocument().blocks;
    this.doc.meta = readOdfMeta(this.zip);
    return this.doc;
  }

  private collectStyles(xml: Document, fromContent: boolean): void {
    for (const s of descendants(xml, 'style')) {
      if (s.namespaceURI !== ODF_NS.style) continue;
      const name = attr(s, 'name');
      if (!name) continue;
      const automatic = s.parentElement?.localName === 'automatic-styles';
      const style: OdfStyle = { name, family: attr(s, 'family') ?? '', automatic: automatic && fromContent, format: {} };
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

  private paragraphKind(name: string | null): ParagraphStyle | 'rule' {
    for (const s of this.chain('paragraph', name)) {
      const m = /^Heading_20_(\d)$/.exec(s.name);
      if (m) return `h${Math.min(6, Number(m[1]))}` as ParagraphStyle;
      if (s.name === 'Title') return 'h1';
      if (s.name === 'Subtitle') return 'h2';
      if (s.name === 'Quotations') return 'quote';
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
            if (!(empty && (before || after))) out.push(b);
            if (after) out.push({ ...PAGE_BREAK });
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
          case 'table-of-content': {
            // DOC-023: regenerated from the headings.
            const source = child(el, 'table-of-content-source');
            const levels = Number(source ? attr(source, 'outline-level') : 3) || 3;
            out.push(levels === 3 ? { type: 'toc' } : { type: 'toc', levels });
            break;
          }
          case 'section':
          case 'index-body':
          case 'illustration-index':
          case 'table-index':
          case 'alphabetical-index':
          case 'bibliography':
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
    const para: Paragraph = { type: 'paragraph', style: kind === 'rule' ? 'normal' : kind, runs: [] };
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
    this.readInline(el, base, para.runs, para.style === 'code');
    para.runs = normalizeRuns(para.runs);
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

  private readInline(el: Element, fmt: TextFormat, out: Run[], pre: boolean): void {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        const text = pre ? (n.nodeValue ?? '') : (n.nodeValue ?? '').replace(/[ \t\r\n]+/g, ' ');
        if (text) out.push({ text, ...cleanFormat(fmt) });
        continue;
      }
      if (n.nodeType !== 1) continue;
      const c = n as Element;
      if (c.namespaceURI === ODF_NS.text) {
        switch (c.localName) {
          case 's':
            out.push({ text: ' '.repeat(Math.max(1, Number(attr(c, 'c') ?? 1) || 1)), ...cleanFormat(fmt) });
            break;
          case 'tab':
            out.push({ text: '\t', ...cleanFormat(fmt) });
            break;
          case 'line-break':
            out.push({ text: '\n', ...cleanFormat(fmt) });
            break;
          case 'span':
            this.readInline(c, this.textFormat(attr(c, 'style-name'), fmt), out, pre);
            break;
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
          case 'annotation':
          case 'bookmark':
          case 'bookmark-start':
          case 'bookmark-end':
          case 'soft-page-break':
          case 'reference-mark':
          case 'tracked-changes':
            break;
          default:
            // fields (date, page-number...), meta, ruby... -> keep their text
            this.readInline(c, fmt, out, pre);
        }
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

  private readTable(table: Element): Block {
    const rows: TableCell[][] = [];
    const visit = (el: Element): void => {
      for (const c of children(el)) {
        if (c.localName === 'table-row') {
          const row: TableCell[] = [];
          for (const cell of children(c)) {
            if (cell.localName !== 'table-cell' && cell.localName !== 'covered-table-cell') continue;
            const repeat = Math.min(64, Number(attr(cell, 'number-columns-repeated') ?? 1) || 1);
            const blocks = this.readBlocks(cell, undefined, 0).flatMap((b): Paragraph[] =>
              b.type === 'paragraph' ? [b] : b.type === 'table' ? b.rows.flat().flatMap((x) => x.blocks) : [],
            );
            for (let i = 0; i < repeat; i++) {
              row.push({ blocks: blocks.length ? structuredClone(blocks) : [{ type: 'paragraph', style: 'normal', runs: [] }] });
            }
          }
          // Drop trailing repeated empty cells beyond the content (LibreOffice padding).
          rows.push(row);
        } else if (['table-header-rows', 'table-rows', 'table-row-group'].includes(c.localName)) {
          visit(c);
        }
      }
    };
    visit(table);
    return { type: 'table', rows };
  }
}

export function readOdt(bytes: Uint8Array): RichDocument {
  return new OdtReader(readZip(bytes)).read();
}
