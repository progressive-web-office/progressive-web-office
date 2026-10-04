/** DOCX (Office Open XML word-processing) reader (DOC-001). */
import { fillOfStyle, fractionOfStyle, isSpaceStyle, stretchOfStyle } from './springs';
import { attr, child, children, descendants, parseXml } from '../core/xml';
import { readZip, readZipText, type ZipEntries } from '../core/zip';
import {
  addResource,
  cleanFormat,
  emptyDocument,
  normalizeRuns,
  resolveAnchors,
  unwrapEquationNumbers,
  seqKindOf,
  type FieldKind,
  type InputRun,
  PAGE_BREAK,
  cleanColumns,
  inColumns,
  cleanPageSetup,
  type PageSetup,
  type PageNumberFormat,
  type PageZones,
  type Align,
  type Block,
  type ListInfo,
  type Paragraph,
  type ParagraphStyle,
  type DocComment,
  type Revision,
  type RichDocument,
  type Run,
  type TableCell,
  type TextFormat,
} from './model';
import { ommlToLatex } from '../math/convert';
import type { BibEntry } from './bibliography';
import { parseCitation, parseCslCitation, readSources } from './word-sources';
import { diagramLangOf } from './diagram';
import { pruneComments } from './comments';
import { DOCX_NUMBER_FORMAT, EMU_PER_PX, IMAGE_CONTENT_TYPES, onOff, readCoreProps, readRels, type Relationship } from './ooxml';

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

  /** Default header and footer of the (last) section, as zones (DOC-024). */
  private readFurniture(body: Element): PageSetup | undefined {
    const sections = descendants(body, 'sectPr');
    const sect = sections.pop();
    if (!sect) return undefined;
    // DOC-049: with several sections (columns), the first one numbers the pages.
    const first = sections[0] ?? sect;
    const setup: PageSetup = {};
    for (const kind of ['header', 'footer'] as const) {
      const refs = children(sect, `${kind}Reference`);
      const ref = refs.find((r) => attr(r, 'type') === 'default') ?? refs[0];
      const target = ref ? this.rels.get(attr(ref, 'id') ?? '')?.target : undefined;
      const text = target ? readZipText(this.zip, target) : undefined;
      if (!text) continue;
      const zones = furnitureZones(parseXml(text).documentElement);
      if (zones) setup[kind] = zones;
    }
    // DOC-029: page number style, first number, title page.
    const numbering = children(first, 'pgNumType')[0];
    const fmt = numbering ? attr(numbering, 'fmt') : undefined;
    const format = (Object.entries(DOCX_NUMBER_FORMAT) as [PageNumberFormat, string][]).find(([, v]) => v === fmt)?.[0];
    if (format) setup.numberFormat = format;
    const start = numbering ? Number(attr(numbering, 'start')) : NaN;
    if (Number.isInteger(start)) setup.startAt = start;
    // DOC-046: the paper and its margins (twentieths of a point).
    const size = children(sect, 'pgSz')[0];
    const margins = children(sect, 'pgMar')[0];
    const mm = (el: Element | undefined, name: string): number | undefined => {
      const v = el ? Number(attr(el, name)) : NaN;
      return Number.isFinite(v) ? Math.round((v / 20 / 72) * 25.4 * 10) / 10 : undefined;
    };
    const [width, height] = [mm(size, 'w'), mm(size, 'h')];
    if (width && height) setup.geometry = { width, height, top: mm(margins, 'top') ?? 25.4, right: mm(margins, 'right') ?? 25.4, bottom: mm(margins, 'bottom') ?? 25.4, left: mm(margins, 'left') ?? 25.4 };
    const titlePg = children(first, 'titlePg')[0];
    if (titlePg && !/^(0|false|off)$/.test(attr(titlePg, 'val') ?? '')) setup.hideOnFirstPage = true;
    return cleanPageSetup(setup);
  }

  /** Word comment id → model id (REV-002). */
  private commentIds = new Map<string, string>();
  private commentList: DocComment[] = [];
  /** Replies are not anchored by themselves: their ranges are left out. */
  private replyIds = new Set<string>();
  private openComments: string[] = [];

  /** Comments, their replies and resolved states (comments.xml, commentsExtended.xml). */
  private readComments(): void {
    const part = (suffix: string, fallback: string): string | undefined => readZipText(this.zip, [...this.rels.values()].find((r) => r.type.endsWith(suffix))?.target ?? fallback);
    const text = part('/comments', 'word/comments.xml');
    if (!text) return;
    const ext = part('/commentsExtended', 'word/commentsExtended.xml');
    const states = new Map<string, { parent?: string; done: boolean }>();
    if (ext) {
      for (const c of descendants(parseXml(ext), 'commentEx')) {
        const id = attr(c, 'paraId');
        if (id) states.set(id.toUpperCase(), { ...(attr(c, 'paraIdParent') ? { parent: attr(c, 'paraIdParent')!.toUpperCase() } : {}), done: /^(1|true)$/.test(attr(c, 'done') ?? '') });
      }
    }
    const byPara = new Map<string, string>();
    const parents: [DocComment, string][] = [];
    for (const el of descendants(parseXml(text), 'comment')) {
      const wid = attr(el, 'id');
      if (wid === null) continue;
      const id = `c${this.commentList.length + 1}`;
      this.commentIds.set(wid, id);
      const paras = children(el, 'p');
      const comment: DocComment = { id, text: '' };
      const author = attr(el, 'author');
      if (author) comment.author = author;
      if (attr(el, 'initials')) comment.initials = attr(el, 'initials')!;
      if (attr(el, 'date')) comment.date = attr(el, 'date')!;
      comment.text = paras.map((p) => descendants(p, 't').map((t) => t.textContent ?? '').join('')).join('\n');
      const paraId = paras.length ? attr(paras[paras.length - 1]!, 'paraId')?.toUpperCase() : undefined;
      const state = paraId ? states.get(paraId) : undefined;
      if (paraId) byPara.set(paraId, id);
      if (state?.done) comment.resolved = true;
      if (state?.parent) parents.push([comment, state.parent]);
      this.commentList.push(comment);
    }
    for (const [comment, parentPara] of parents) {
      const parent = byPara.get(parentPara);
      if (parent && parent !== comment.id) {
        comment.parent = parent;
        this.replyIds.add(comment.id);
      }
    }
  }

  private footnoteXml: Map<string, Element> | undefined;

  /** The content of a footnote (DOC-022), paragraphs separated by a blank line. */
  private footnote(id: string | null): Run[] | undefined {
    if (!this.footnoteXml) {
      this.footnoteXml = new Map();
      const target = [...this.rels.values()].find((r) => r.type.endsWith('/footnotes'))?.target ?? 'word/footnotes.xml';
      const text = readZipText(this.zip, target);
      if (text) for (const fn of descendants(parseXml(text), 'footnote')) this.footnoteXml.set(attr(fn, 'id') ?? '', fn);
    }
    const fn = id === null ? undefined : this.footnoteXml.get(id);
    if (!fn) return undefined;
    const runs: Run[] = [];
    children(fn, 'p').forEach((p, i) => {
      if (i > 0) runs.push({ text: '\n\n' });
      this.readInline(p, {}, runs);
    });
    const out = normalizeRuns(runs);
    // The number Word puts at the start is followed by a space.
    const first = out[0];
    if (first && 'text' in first) {
      first.text = first.text.replace(/^\s+/, '');
      if (!first.text) out.shift();
    }
    return out;
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
      if (s.name === 'caption') return 'caption';
      if (['code', 'html preformatted', 'source text', 'preformatted text', 'plain text'].includes(s.name)) return 'code';
    }
    const m = /^heading(\d)$/i.exec(styleId ?? '');
    if (m) return `h${Math.min(6, Number(m[1]))}` as ParagraphStyle;
    if (/^(caption|l[ée]gende)$/i.test(styleId ?? '')) return 'caption';
    return 'normal';
  }

  /** Bibliography items found in Zotero / Mendeley citations (DOC-027). */
  private cslEntries: BibEntry[] = [];
  /** Whether citations read like "(Author, 2020)". */
  private authorYear = false;

  /** A field's runs: SEQ, REF, CITATION… (DOC-026, DOC-027). */
  private field(instr: string, result: Run[]): Run[] {
    const csl = parseCslCitation(instr);
    if (csl) this.cslEntries.push(...csl.entries);
    const cite = csl?.cite ?? parseCitation(instr);
    if (cite) {
      const shown = result.map((r) => ('text' in r ? r.text : '')).join('');
      if (/^\(.*\d{4}/.test(shown.trim())) this.authorYear = true;
      return [cite];
    }
    return fieldRuns(instr, result);
  }

  /** Open complex fields of the current paragraph (DOC-026). */
  private fields: { instr: string; start: number; result: boolean }[] = [];
  /** Other bookmarks of a target paragraph → its anchor. */
  private anchorAlias = new Map<string, string>();

  read(): RichDocument {
    const text = readZipText(this.zip, 'word/document.xml');
    if (!text) throw new Error('Not a Word document: word/document.xml is missing.');
    const body = descendants(parseXml(text), 'body')[0];
    if (!body) throw new Error('Not a Word document: missing body.');
    this.readComments();
    this.doc.blocks = this.readBlocks(body);
    if (this.commentIds.size) {
      this.doc.comments = this.commentList;
      pruneComments(this.doc);
    }
    resolveAnchors(this.doc.blocks, this.anchorAlias);
    // DOC-027: Word's sources, and the items carried by Zotero / Mendeley citations.
    const entries = new Map<string, BibEntry>();
    for (const path of Object.keys(this.zip).filter((p) => /^customXml\/item\d+\.xml$/.test(p)).sort()) {
      try {
        for (const e of readSources(readZipText(this.zip, path) ?? '')) entries.set(e.key, e);
      } catch {
        /* another kind of custom XML */
      }
    }
    for (const e of this.cslEntries) if (!entries.has(e.key)) entries.set(e.key, e);
    if (entries.size) this.doc.references = { entries: [...entries.values()], ...(this.authorYear ? { style: 'author-year' as const } : {}) };
    const page = this.readFurniture(body);
    if (page) this.doc.page = page;
    if (!this.doc.blocks.length) this.doc.blocks = emptyDocument().blocks;
    this.doc.meta = readCoreProps(this.zip);
    return this.doc;
  }

  /** Where the current section of the body starts (DOC-049). */
  private sectionStart = 0;

  /** The blocks of a section in its columns (DOC-049). */
  private endSection(out: Block[], sect: Element): void {
    const cols = child(sect, 'cols');
    const count = cols ? Number(attr(cols, 'num')) || 1 : 1;
    const space = cols ? pt(attr(cols, 'space')) : undefined;
    const columns = cleanColumns({ count, ...(space !== undefined ? { gap: space } : {}), ...(cols && /^(1|true|on)$/.test(attr(cols, 'sep') ?? '') ? { rule: true } : {}) });
    if (columns) out.splice(this.sectionStart, Infinity, ...inColumns(out.slice(this.sectionStart), columns));
    this.sectionStart = out.length;
  }

  private readBlocks(container: Element): Block[] {
    const out: Block[] = [];
    for (const el of children(container)) {
      switch (el.localName) {
        case 'p': {
          // DOC-028: a sub-document of a master document.
          const sub = child(el, 'subDoc');
          const rel = sub ? this.rels.get(attr(sub, 'id') ?? '') : undefined;
          if (rel) {
            out.push({ type: 'include', src: decodeURI(rel.target.replace(/^file:\/+/, '')) });
            break;
          }
          const pPr = child(el, 'pPr');
          const sect = pPr ? child(pPr, 'sectPr') : undefined;
          const blocks = withPageBreaks(this.readParagraph(el), el);
          // DOC-049: a paragraph ending a section; Word keeps an empty one for the break alone.
          const only = blocks.length === 1 ? blocks[0] : undefined;
          if (!(sect && only?.type === 'paragraph' && !only.runs.length)) out.push(...blocks);
          if (sect && container.localName === 'body') this.endSection(out, sect);
          break;
        }
        case 'sectPr':
          this.endSection(out, el);
          break;
        case 'tbl':
          out.push(this.readTable(el));
          break;
        case 'sdt': {
          // DOC-023: a table of contents is regenerated from the headings.
          const gallery = descendants(child(el, 'sdtPr') ?? el, 'docPartGallery')[0];
          if (gallery && /bibliograph/i.test(attr(gallery, 'val') ?? '')) {
            // DOC-027: the list of references is regenerated from the citations.
            out.push({ type: 'bibliography' });
            break;
          }
          if (gallery && /table of contents/i.test(attr(gallery, 'val') ?? '')) {
            const instr = descendants(el, 'instrText').map((i) => i.textContent ?? '').join('');
            const m = /\\o\s+"\d+-(\d+)"/.exec(instr);
            out.push(m && m[1] !== '3' ? { type: 'toc', levels: Number(m[1]) } : { type: 'toc' });
            break;
          }
          const content = child(el, 'sdtContent');
          // TEACH-001: a content control holding solutions.
          const props = child(el, 'sdtPr');
          const tag = props ? attr(child(props, 'tag') ?? props, 'val') : null;
          const alias = props ? attr(child(props, 'alias') ?? props, 'val') : null;
          const solution = tag === 'pwo:solution' || /^(solution|corrig[eé]|answer)s?$/i.test(alias ?? '');
          if (content) out.push(...this.readBlocks(content).map((b) => (solution && b.type === 'paragraph' ? { ...b, solution: true } : b)));
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
    // DOC-042: a spring or a space, kept as the space it was last shown with.
    const styleNames = this.styleChain(styleId).map((s) => s.name);
    const stretch = styleNames.map(stretchOfStyle).find((w) => w !== undefined);
    const fraction = styleNames.map(fractionOfStyle).find((f) => f !== undefined);
    if (stretch !== undefined || fraction !== undefined || styleNames.some(isSpaceStyle)) {
      const before = Number(attr(child(pPr!, 'spacing') ?? pPr!, 'before') ?? 0) / 20;
      if (stretch !== undefined) return { type: 'space', stretch, ...(before ? { size: before } : {}) };
      return fraction !== undefined ? { type: 'space', fraction, ...(before ? { size: before } : {}) } : { type: 'space', size: before };
    }
    const para: Paragraph = { type: 'paragraph', style: this.paragraphStyle(styleId), runs: [] };
    if (pPr) {
      const jc = attr(child(pPr, 'jc') ?? pPr, 'val');
      const align = jcToAlign(jc);
      if (align) para.align = align;
      const list = this.listInfo(pPr, styleId);
      if (list) para.list = list;
      readLayout(pPr, para, !!list);
    } else if (styleId) {
      const list = this.listInfo(undefined, styleId);
      if (list) para.list = list;
    }
    this.fields = [];
    this.readInline(p, {}, para.runs);
    // DOC-026: the paragraph's bookmarks make it a cross-reference target.
    const names = descendants(p, 'bookmarkStart')
      .map((b) => attr(b, 'name') ?? '')
      .filter((n) => n && n !== '_GoBack');
    if (names.length) {
      para.id = anchorFromBookmark(names[0]!);
      for (const n of names.slice(1)) this.anchorAlias.set(anchorFromBookmark(n), para.id);
    }
    para.runs = normalizeRuns(unwrapEquationNumbers(para.runs));
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
        case 'commentRangeStart': {
          const id = this.commentIds.get(attr(el, 'id') ?? '');
          if (id && !this.replyIds.has(id) && !this.openComments.includes(id)) this.openComments.push(id);
          break;
        }
        case 'commentRangeEnd': {
          const id = this.commentIds.get(attr(el, 'id') ?? '');
          this.openComments = this.openComments.filter((x) => x !== id);
          break;
        }
        case 'ins':
        case 'del': {
          // REV-005: tracked insertions and deletions.
          const by: Revision = {};
          if (attr(el, 'author')) by.author = attr(el, 'author')!;
          if (attr(el, 'date')) by.date = attr(el, 'date')!;
          const f = { ...fmt };
          delete f.inserted;
          delete f.deleted;
          f[el.localName === 'ins' ? 'inserted' : 'deleted'] = by;
          this.readInline(el, f, out);
          break;
        }
        case 'moveFrom':
        case 'pPr':
        case 'rPr':
        case 'bookmarkStart':
        case 'bookmarkEnd':
        case 'proofErr':
          break;
        case 'AlternateContent': {
          const choice = children(el)[0];
          if (choice) this.readInline(choice, fmt, out);
          break;
        }
        case 'sdt': {
          // FORM-003: a content control of a form; any other: its content.
          const input = inputOfControl(el);
          if (input) out.push(input);
          else this.readInline(el, fmt, out);
          break;
        }
        case 'fldSimple': {
          const result: Run[] = [];
          this.readInline(el, fmt, result);
          out.push(...this.field(attr(el, 'instr') ?? '', result));
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
    const set = (key: 'bold' | 'italic' | 'strike' | 'smallCaps', el: Element | undefined): void => {
      const v = onOff(el);
      if (v === true) f[key] = true;
      else if (v === false) delete f[key];
    };
    set('bold', child(rPr, 'b'));
    set('italic', child(rPr, 'i'));
    set('strike', child(rPr, 'strike') ?? child(rPr, 'dstrike'));
    set('smallCaps', child(rPr, 'smallCaps'));
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
    const family = fonts ? (attr(fonts, 'ascii') ?? attr(fonts, 'hAnsi')) : null;
    if (family && MONO.test(family)) f.code = true;
    else if (family) f.font = family;
    const sz = child(rPr, 'sz');
    const half = sz ? Number(attr(sz, 'val')) : NaN;
    if (half > 0) f.size = half / 2;
    const color = child(rPr, 'color');
    const cv = color ? attr(color, 'val') : null;
    if (cv && /^[0-9a-f]{6}$/i.test(cv)) f.color = `#${cv.toLowerCase()}`;
    const shd = child(rPr, 'shd');
    const fill = shd ? attr(shd, 'fill') : null;
    if (fill && /^[0-9a-f]{6}$/i.test(fill) && fill.toLowerCase() !== 'ffffff') f.highlight = `#${fill.toLowerCase()}`;
    const hl = child(rPr, 'highlight');
    const named = hl ? HIGHLIGHTS[attr(hl, 'val') ?? ''] : undefined;
    if (named) f.highlight = named;
    return f;
  }

  private readRun(r: Element, parent: TextFormat, out: Run[]): void {
    const fmt = cleanFormat(this.runFormat(r, parent));
    if (this.openComments.length) fmt.comments = [...this.openComments];
    for (const el of children(r)) {
      switch (el.localName) {
        case 't':
        case 'delText':
          out.push({ text: el.textContent ?? '', ...fmt });
          break;
        case 'tab': {
          // DOC-042: a tab in a "PWO Fill" run is a horizontal spring.
          const rStyle = child(child(r, 'rPr') ?? r, 'rStyle');
          const fill = this.styleChain(rStyle ? attr(rStyle, 'val') : null)
            .map((s) => fillOfStyle(s.name))
            .find((w) => w !== undefined);
          out.push(fill !== undefined ? { hfill: fill } : { text: '\t', ...fmt });
          break;
        }
        case 'br':
        case 'cr':
          // A page break is marked with a form feed; the paragraph is split there.
          out.push({ text: attr(el, 'type') === 'page' ? '\f' : attr(el, 'type') === 'column' ? '\v' : '\n', ...fmt });
          break;
        case 'fldChar': {
          // Complex fields (DOC-026): SEQ and REF become numbers and references.
          const type = attr(el, 'fldCharType');
          if (type === 'begin') this.fields.push({ instr: '', start: out.length, result: false });
          else if (type === 'separate' && this.fields.length) Object.assign(this.fields[this.fields.length - 1]!, { start: out.length, result: true });
          else if (type === 'end' && this.fields.length) {
            const f = this.fields.pop()!;
            const result = f.result ? out.splice(f.start) : [];
            out.push(...this.field(f.instr, result));
          }
          break;
        }
        case 'instrText':
          if (this.fields.length) this.fields[this.fields.length - 1]!.instr += el.textContent ?? '';
          break;
        case 'noBreakHyphen':
          out.push({ text: '‑', ...fmt });
          break;
        case 'footnoteReference': {
          const note = this.footnote(attr(el, 'id'));
          if (note) out.push({ footnote: note });
          break;
        }
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
    // DRAW-007: the SVG of a picture rather than its PNG version.
    const blip = descendants(drawing, 'svgBlip')[0] ?? descendants(drawing, 'blip')[0];
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

  /** Table cells with their spans (gridSpan, vMerge) and header row (DOC-025). */
  private readTable(tbl: Element): Block {
    const rows: TableCell[][] = [];
    /** The cell occupying each grid column, for vertical merges. */
    const above = new Map<number, TableCell>();
    let header = false;
    children(tbl, 'tr').forEach((tr, r) => {
      const row: TableCell[] = [];
      const trPr = child(tr, 'trPr');
      if (r === 0 && trPr && child(trPr, 'tblHeader') && onOff(child(trPr, 'tblHeader')) !== false) header = true;
      let col = 0;
      for (const tc of children(tr, 'tc')) {
        const tcPr = child(tc, 'tcPr');
        const span = Math.max(1, Number(tcPr && child(tcPr, 'gridSpan') ? attr(child(tcPr, 'gridSpan')!, 'val') : 1) || 1);
        const vMerge = tcPr ? child(tcPr, 'vMerge') : undefined;
        const restart = vMerge && attr(vMerge, 'val') === 'restart';
        if (vMerge && !restart && above.has(col)) {
          const origin = above.get(col)!;
          origin.rowSpan = (origin.rowSpan ?? 1) + 1;
          col += span;
          continue;
        }
        const blocks = this.readBlocks(tc).flatMap((b): Paragraph[] =>
          b.type === 'paragraph' ? [b] : b.type === 'table' ? b.rows.flat().flatMap((c) => c.blocks) : [],
        );
        const cell: TableCell = { blocks: blocks.length ? blocks : [{ type: 'paragraph', style: 'normal', runs: [] }] };
        if (span > 1) cell.colSpan = span;
        row.push(cell);
        for (let i = 0; i < span; i++) above.set(col + i, cell);
        col += span;
      }
      rows.push(row);
    });
    return header ? { type: 'table', rows, header } : { type: 'table', rows };
  }

}

/** FORM-003: a content control of a form (text, check box, list), with its name and answer. */
export function inputOfControl(sdt: Element): InputRun | undefined {
  const props = child(sdt, 'sdtPr');
  if (!props) return undefined;
  const name = attr(child(props, 'tag') ?? props, 'val') || attr(child(props, 'alias') ?? props, 'val');
  if (!name || name.startsWith('pwo:')) return undefined;
  const content = child(sdt, 'sdtContent');
  const placeholder = !!child(props, 'showingPlcHdr');
  const text = placeholder ? '' : descendants(content ?? sdt, 't').map((t) => t.textContent ?? '').join('');
  const box = children(props).find((c) => c.localName === 'checkbox');
  if (box) {
    const checked = children(box).find((c) => c.localName === 'checked');
    return { input: 'checkbox', name, checked: checked ? ['1', 'true', 'on'].includes(attr(checked, 'val') ?? '1') : text.includes('☒') };
  }
  const list = child(props, 'dropDownList') ?? child(props, 'comboBox');
  if (list) {
    const options = children(list, 'listItem').map((i) => attr(i, 'displayText') ?? attr(i, 'value') ?? '').filter(Boolean);
    return { input: 'dropdown', name, options, ...(text ? { value: text } : {}) };
  }
  if (child(props, 'text')) return { input: 'text', name, ...(text ? { value: text } : {}) };
  return undefined;
}

/** DOC-041: Word fields read as fields of the body. */
const DOCX_FIELD_OF: Record<string, FieldKind> = { DATE: 'date', TIME: 'time', PAGE: 'page', NUMPAGES: 'pages', TITLE: 'title', AUTHOR: 'author', FILENAME: 'filename' };

const FIELD_OF: Record<string, string> = { PAGE: '{page}', NUMPAGES: '{pages}', SECTIONPAGES: '{pages}', TITLE: '{title}', DATE: '{date}', CREATEDATE: '{date}', SAVEDATE: '{date}' };

/** Zones of a header/footer part: its first non-empty paragraph, split at tabs (DOC-024). */
function furnitureZones(root: Element): PageZones | undefined {
  for (const p of descendants(root, 'p')) {
    let text = '';
    let inField = false;
    let instr = '';
    const walk = (el: Element): void => {
      for (const c of children(el)) {
        const name = c.localName;
        if (name === 'fldSimple') {
          text += FIELD_OF[(attr(c, 'instr') ?? '').trim().split(/\s+/)[0]!.toUpperCase()] ?? c.textContent ?? '';
        } else if (name === 'fldChar') {
          const type = attr(c, 'fldCharType');
          if (type === 'begin') {
            inField = true;
            instr = '';
          } else if (type === 'separate') {
            const field = FIELD_OF[instr.trim().split(/\s+/)[0]!.toUpperCase()];
            if (field) text += field;
            else inField = false; // unknown field: keep its shown text
          } else if (type === 'end') {
            inField = false;
          }
        } else if (name === 'instrText') {
          instr += c.textContent ?? '';
        } else if (name === 't') {
          if (!inField) text += c.textContent ?? '';
        } else if (name === 'tab' && el.localName === 'r') {
          if (!inField) text += '\t';
        } else if (name !== 'pPr' && name !== 'rPr') {
          walk(c);
        }
      }
    };
    walk(p);
    if (!text.trim()) continue;
    const parts = text.split('\t').map((x) => x.trim());
    const jc = attr(descendants(p, 'jc')[0] ?? p, 'val');
    if (parts.length === 1) return jc === 'center' ? { center: parts[0] } : jc === 'right' || jc === 'end' ? { right: parts[0] } : { left: parts[0] };
    if (parts.length === 2) return { left: parts[0], center: parts[1] };
    return { left: parts[0], center: parts[1], right: parts.slice(2).join(' ') };
  }
  return undefined;
}

/**
 * Split a paragraph at its page breaks (`\f`, from `<w:br w:type="page"/>`) and
 * honour `w:pageBreakBefore` (DOC-021).
 */
function withPageBreaks(block: Block, p: Element): Block[] {
  const pPr = child(p, 'pPr');
  const before = pPr && child(pPr, 'pageBreakBefore') && onOff(child(pPr, 'pageBreakBefore')) !== false ? [PAGE_BREAK] : [];
  // DOC-049: column breaks (`\v`) likewise.
  if (block.type !== 'paragraph' || !block.runs.some((r) => 'text' in r && /[\f\v]/.test(r.text))) return [...before, block];
  const out: Block[] = [...before];
  let runs: Run[] = [];
  const emit = (): void => {
    const normalized = normalizeRuns(runs);
    if (normalized.length || out.length === 0) out.push({ ...block, runs: normalized });
    runs = [];
  };
  for (const run of block.runs) {
    if (!('text' in run) || !/[\f\v]/.test(run.text)) {
      runs.push(run);
      continue;
    }
    for (const part of run.text.split(/([\f\v])/)) {
      if (part === '\f' || part === '\v') {
        emit();
        out.push(part === '\f' ? { ...PAGE_BREAK } : { type: 'rule', column: true });
      } else if (part) runs.push({ ...run, text: part });
    }
  }
  emit();
  // A paragraph holding only a page break is just the break.
  return out.filter((b, i) => !(b.type === 'paragraph' && !b.runs.length && (out[i - 1]?.type === 'rule' || out[i + 1]?.type === 'rule')));
}

/** Word's highlight colour names. */
const HIGHLIGHTS: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
  darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000',
};

const pt = (twips: string | null): number | undefined => {
  const n = Number(twips);
  return twips !== null && Number.isFinite(n) ? Math.round((n / 20) * 10) / 10 : undefined;
};

/** Direct paragraph spacing (DOC-020); list indents come from the numbering, not the paragraph. */
function readLayout(pPr: Element, para: Paragraph, inList: boolean): void {
  const spacing = child(pPr, 'spacing');
  if (spacing) {
    const before = pt(attr(spacing, 'before'));
    const after = pt(attr(spacing, 'after'));
    if (before !== undefined) para.spaceBefore = before;
    if (after !== undefined) para.spaceAfter = after;
    const line = Number(attr(spacing, 'line'));
    const rule = attr(spacing, 'lineRule') ?? 'auto';
    if (line > 0 && rule === 'auto' && line !== 240) para.lineHeight = Math.round((line / 240) * 100) / 100;
  }
  const ind = child(pPr, 'ind');
  if (ind && !inList) {
    const left = pt(attr(ind, 'left') ?? attr(ind, 'start'));
    if (left) para.indent = left;
    const first = pt(attr(ind, 'firstLine'));
    const hanging = pt(attr(ind, 'hanging'));
    if (first) para.firstLine = first;
    else if (hanging) para.firstLine = -hanging;
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

/** Anchor of a Word bookmark: ours carry a `_Ref_` prefix. */
const anchorFromBookmark = (name: string): string => name.replace(/^_Ref_/, '');

/** A field's runs (DOC-026): SEQ → number, REF → cross-reference, others → their shown text. */
function fieldRuns(instr: string, result: Run[]): Run[] {
  const [name = '', arg = ''] = instr.trim().split(/\s+/);
  if (name.toUpperCase() === 'SEQ' && arg) return [{ seq: seqKindOf(arg) }];
  if (name.toUpperCase() === 'REF' && arg) return [{ ref: anchorFromBookmark(arg) }];
  // DOC-041: fields computed when shown.
  const field = DOCX_FIELD_OF[name.toUpperCase()];
  if (field) return [{ field }];
  return result;
}
