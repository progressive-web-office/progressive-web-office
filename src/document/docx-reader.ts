/** DOCX (Office Open XML word-processing) reader (DOC-001). */
import { attr, child, children, descendants, parseXml } from '../core/xml';
import { readZip, readZipText, type ZipEntries } from '../core/zip';
import {
  addResource,
  cleanFormat,
  emptyDocument,
  normalizeRuns,
  type Align,
  type Block,
  type ListInfo,
  type Paragraph,
  type ParagraphStyle,
  type RichDocument,
  type Run,
  type TableCell,
  type TextFormat,
} from './model';
import { ommlToLatex } from '../math/convert';
import { diagramLangOf } from './diagram';
import { EMU_PER_PX, IMAGE_CONTENT_TYPES, onOff, readCoreProps, readRels, type Relationship } from './ooxml';

interface StyleInfo {
  name: string;
  basedOn?: string;
  numPr?: { numId: string; ilvl: number };
  monospace?: boolean;
}

const MONO = /courier|consolas|menlo|monaco|mono|source code|fira code/i;

class DocxReader {
  private styles = new Map<string, StyleInfo>();
  /** numId -> per-level "ordered" flags */
  private numbering = new Map<string, boolean[]>();
  private rels: Map<string, Relationship>;
  readonly doc: RichDocument = emptyDocument();

  constructor(private readonly zip: ZipEntries) {
    this.rels = readRels(zip, 'word/document.xml');
    this.readStyles();
    this.readNumbering();
  }

  private readStyles(): void {
    const text = readZipText(this.zip, 'word/styles.xml');
    if (!text) return;
    for (const s of descendants(parseXml(text), 'style')) {
      const id = attr(s, 'styleId');
      if (!id) continue;
      const info: StyleInfo = { name: (attr(child(s, 'name') ?? s, 'val') ?? id).toLowerCase() };
      const based = child(s, 'basedOn');
      if (based) info.basedOn = attr(based, 'val') ?? undefined;
      const numPr = child(s, 'pPr') && child(child(s, 'pPr')!, 'numPr');
      if (numPr) {
        const numId = attr(child(numPr, 'numId') ?? numPr, 'val');
        if (numId) info.numPr = { numId, ilvl: Number(attr(child(numPr, 'ilvl') ?? numPr, 'val') ?? 0) || 0 };
      }
      const fonts = child(s, 'rPr') && child(child(s, 'rPr')!, 'rFonts');
      if (fonts && MONO.test(attr(fonts, 'ascii') ?? '')) info.monospace = true;
      this.styles.set(id, info);
    }
  }

  private readNumbering(): void {
    const text = readZipText(this.zip, 'word/numbering.xml');
    if (!text) return;
    const xml = parseXml(text);
    const abstracts = new Map<string, boolean[]>();
    for (const an of descendants(xml, 'abstractNum')) {
      const levels: boolean[] = [];
      for (const lvl of children(an, 'lvl')) {
        const ilvl = Number(attr(lvl, 'ilvl') ?? 0);
        const fmt = attr(child(lvl, 'numFmt') ?? lvl, 'val') ?? 'decimal';
        levels[ilvl] = fmt !== 'bullet' && fmt !== 'none';
      }
      abstracts.set(attr(an, 'abstractNumId') ?? '', levels);
    }
    for (const num of descendants(xml, 'num')) {
      const abs = attr(child(num, 'abstractNumId') ?? num, 'val') ?? '';
      this.numbering.set(attr(num, 'numId') ?? '', abstracts.get(abs) ?? []);
    }
  }

  /** Walk the style inheritance chain. */
  private styleChain(id: string | null | undefined): StyleInfo[] {
    const out: StyleInfo[] = [];
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const s = this.styles.get(id);
      if (!s) break;
      out.push(s);
      id = s.basedOn;
    }
    return out;
  }

  private paragraphStyle(styleId: string | null): ParagraphStyle {
    const chain = this.styleChain(styleId);
    for (const s of chain) {
      const m = /^heading (\d)$/.exec(s.name);
      if (m) return `h${Math.min(6, Number(m[1]))}` as ParagraphStyle;
      if (s.name === 'title') return 'h1';
      if (s.name === 'subtitle') return 'h2';
      if (s.name === 'quote' || s.name === 'intense quote' || s.name === 'block text') return 'quote';
      if (['code', 'html preformatted', 'source text', 'preformatted text', 'plain text'].includes(s.name)) return 'code';
    }
    const m = /^heading(\d)$/i.exec(styleId ?? '');
    if (m) return `h${Math.min(6, Number(m[1]))}` as ParagraphStyle;
    return 'normal';
  }

  read(): RichDocument {
    const text = readZipText(this.zip, 'word/document.xml');
    if (!text) throw new Error('Not a Word document: word/document.xml is missing.');
    const body = descendants(parseXml(text), 'body')[0];
    if (!body) throw new Error('Not a Word document: missing body.');
    this.doc.blocks = this.readBlocks(body);
    if (!this.doc.blocks.length) this.doc.blocks = emptyDocument().blocks;
    this.doc.meta = readCoreProps(this.zip);
    return this.doc;
  }

  private readBlocks(container: Element): Block[] {
    const out: Block[] = [];
    for (const el of children(container)) {
      switch (el.localName) {
        case 'p':
          out.push(this.readParagraph(el));
          break;
        case 'tbl':
          out.push(this.readTable(el));
          break;
        case 'sdt': {
          const content = child(el, 'sdtContent');
          if (content) out.push(...this.readBlocks(content));
          break;
        }
        case 'customXml':
          out.push(...this.readBlocks(el));
          break;
        default:
          break;
      }
    }
    return out;
  }

  private readParagraph(p: Element): Block {
    const pPr = child(p, 'pPr');
    const styleId = pPr && child(pPr, 'pStyle') ? attr(child(pPr, 'pStyle')!, 'val') : null;
    const para: Paragraph = { type: 'paragraph', style: this.paragraphStyle(styleId), runs: [] };
    if (pPr) {
      const jc = attr(child(pPr, 'jc') ?? pPr, 'val');
      const align = jcToAlign(jc);
      if (align) para.align = align;
      const list = this.listInfo(pPr, styleId);
      if (list) para.list = list;
    } else if (styleId) {
      const list = this.listInfo(undefined, styleId);
      if (list) para.list = list;
    }
    this.readInline(p, {}, para.runs);
    para.runs = normalizeRuns(para.runs);
    // Horizontal rule: empty paragraph with a bottom border.
    if (!para.runs.length && pPr && child(pPr, 'pBdr') && child(child(pPr, 'pBdr')!, 'bottom')) return { type: 'rule' };
    return para;
  }

  private listInfo(pPr: Element | undefined, styleId: string | null): ListInfo | undefined {
    let numId: string | null = null;
    let ilvl = 0;
    const numPr = pPr && child(pPr, 'numPr');
    if (numPr) {
      numId = attr(child(numPr, 'numId') ?? numPr, 'val');
      ilvl = Number(attr(child(numPr, 'ilvl') ?? numPr, 'val') ?? 0) || 0;
    } else {
      const fromStyle = this.styleChain(styleId).find((s) => s.numPr)?.numPr;
      if (fromStyle) {
        numId = fromStyle.numId;
        ilvl = fromStyle.ilvl;
      }
    }
    if (!numId || numId === '0') return undefined;
    const levels = this.numbering.get(numId);
    return { ordered: levels?.[ilvl] ?? false, level: ilvl };
  }

  private readInline(container: Element, fmt: TextFormat, out: Run[]): void {
    for (const el of children(container)) {
      switch (el.localName) {
        case 'r':
          this.readRun(el, fmt, out);
          break;
        case 'hyperlink': {
          const f = { ...fmt };
          const rid = attr(el, 'id');
          const anchor = attr(el, 'anchor');
          const rel = rid ? this.rels.get(rid) : undefined;
          if (rel?.external) f.link = rel.target;
          else if (anchor) f.link = `#${anchor}`;
          this.readInline(el, f, out);
          break;
        }
        case 'del':
        case 'moveFrom':
        case 'pPr':
        case 'rPr':
        case 'bookmarkStart':
        case 'bookmarkEnd':
        case 'proofErr':
        case 'commentRangeStart':
        case 'commentRangeEnd':
          break;
        case 'AlternateContent': {
          const choice = children(el)[0];
          if (choice) this.readInline(choice, fmt, out);
          break;
        }
        case 'oMath':
          out.push({ math: ommlToLatex(el) });
          break;
        case 'oMathPara':
          for (const m of children(el, 'oMath')) out.push({ math: ommlToLatex(m), display: true });
          break;
        default:
          // ins, moveTo, smartTag, sdt/sdtContent, fldSimple, customXml...
          this.readInline(el, fmt, out);
      }
    }
  }

  private runFormat(r: Element, parent: TextFormat): TextFormat {
    const f: TextFormat = { ...parent };
    const rPr = child(r, 'rPr');
    if (!rPr) return f;
    const set = (key: 'bold' | 'italic' | 'strike', el: Element | undefined): void => {
      const v = onOff(el);
      if (v === true) f[key] = true;
      else if (v === false) delete f[key];
    };
    set('bold', child(rPr, 'b'));
    set('italic', child(rPr, 'i'));
    set('strike', child(rPr, 'strike') ?? child(rPr, 'dstrike'));
    const u = child(rPr, 'u');
    if (u) {
      const val = attr(u, 'val');
      if (val && val !== 'none') f.underline = true;
      else delete f.underline;
    }
    const rStyle = child(rPr, 'rStyle');
    const styleId = rStyle ? attr(rStyle, 'val') : null;
    const chain = this.styleChain(styleId);
    if (
      chain.some((s) => s.monospace || ['code char', 'html code', 'verbatim char', 'source text'].includes(s.name)) ||
      /^code/i.test(styleId ?? '')
    ) {
      f.code = true;
    }
    const fonts = child(rPr, 'rFonts');
    if (fonts && MONO.test(attr(fonts, 'ascii') ?? '')) f.code = true;
    return f;
  }

  private readRun(r: Element, parent: TextFormat, out: Run[]): void {
    const fmt = cleanFormat(this.runFormat(r, parent));
    for (const el of children(r)) {
      switch (el.localName) {
        case 't':
          out.push({ text: el.textContent ?? '', ...fmt });
          break;
        case 'tab':
          out.push({ text: '\t', ...fmt });
          break;
        case 'br':
        case 'cr':
          out.push({ text: '\n', ...fmt });
          break;
        case 'noBreakHyphen':
          out.push({ text: '‑', ...fmt });
          break;
        case 'drawing':
          this.readDrawing(el, out);
          break;
        case 'AlternateContent': {
          const drawing = descendants(el, 'drawing')[0];
          if (drawing) this.readDrawing(drawing, out);
          break;
        }
        default:
          break;
      }
    }
  }

  private readDrawing(drawing: Element, out: Run[]): void {
    const docPr = descendants(drawing, 'docPr')[0];
    // A picture rendered from a diagram: keep the editable source (DIAG-005).
    const lang = docPr ? diagramLangOf(attr(docPr, 'title')) : undefined;
    const source = docPr ? attr(docPr, 'descr')?.replace(/\s+$/, '') : undefined;
    if (lang && source) {
      out.push({ diagram: source, lang });
      return;
    }
    const blip = descendants(drawing, 'blip')[0];
    const rid = blip ? (blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ?? attr(blip, 'embed')) : null;
    const rel = rid ? this.rels.get(rid) : undefined;
    if (!rel || rel.external) return;
    const data = this.zip[rel.target];
    if (!data) return;
    const ext = rel.target.slice(rel.target.lastIndexOf('.') + 1).toLowerCase();
    const name = rel.target.slice(rel.target.lastIndexOf('/') + 1);
    const key = addResource(this.doc, data, IMAGE_CONTENT_TYPES[ext] ?? 'application/octet-stream', name);
    const run: Run = { image: key };
    const alt = docPr ? attr(docPr, 'descr') : null;
    if (alt) run.alt = alt;
    const extent = descendants(drawing, 'extent')[0];
    if (extent) {
      const cx = Number(attr(extent, 'cx'));
      const cy = Number(attr(extent, 'cy'));
      if (cx > 0) run.width = Math.round(cx / EMU_PER_PX);
      if (cy > 0) run.height = Math.round(cy / EMU_PER_PX);
    }
    out.push(run);
  }

  private readTable(tbl: Element): Block {
    const rows: TableCell[][] = [];
    for (const tr of children(tbl, 'tr')) {
      const row: TableCell[] = [];
      for (const tc of children(tr, 'tc')) {
        const blocks = this.readBlocks(tc).flatMap((b): Paragraph[] =>
          b.type === 'paragraph' ? [b] : b.type === 'table' ? b.rows.flat().flatMap((c) => c.blocks) : [],
        );
        row.push({ blocks: blocks.length ? blocks : [{ type: 'paragraph', style: 'normal', runs: [] }] });
      }
      rows.push(row);
    }
    return { type: 'table', rows };
  }
}

function jcToAlign(jc: string | null): Align | undefined {
  switch (jc) {
    case 'center':
      return 'center';
    case 'right':
    case 'end':
      return 'right';
    case 'both':
    case 'distribute':
      return 'justify';
    default:
      return undefined;
  }
}

export function readDocx(bytes: Uint8Array): RichDocument {
  return new DocxReader(readZip(bytes)).read();
}
