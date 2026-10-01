/** PowerPoint (.pptx) reader (PRES-001, PRES-003, PRES-010). */
import { attr, child, children, descendants, parseXml } from '../core/xml';
import { readZip, readZipText, type ZipEntries } from '../core/zip';
import { addResource, cleanFormat, normalizeRuns, type Align, type Paragraph, type Run, type TextFormat } from '../document/model';
import { EMU_PER_PX, IMAGE_CONTENT_TYPES, readCoreProps, readRels, REL, type Relationship } from '../document/ooxml';
import { newShapeId, type Placeholder, type Presentation, type Shape, type Slide } from './model';

const px = (emu: string | null | undefined): number => Math.round((Number(emu ?? 0) / EMU_PER_PX) * 100) / 100;

interface Xfrm {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlaceholderRef {
  type: string;
  idx?: string;
}

/** Affine mapping applied to children of group shapes. */
type Transform = (x: Xfrm) => Xfrm;
const identity: Transform = (x) => x;

const DEFAULT_SIZES: Record<string, number> = { title: 44, ctrTitle: 44, subTitle: 24, body: 24, obj: 24 };

function readXfrm(el: Element | undefined): Xfrm | undefined {
  const xfrm = el && (child(el, 'xfrm') ?? undefined);
  if (!xfrm) return undefined;
  const off = child(xfrm, 'off');
  const ext = child(xfrm, 'ext');
  if (!off || !ext) return undefined;
  return { x: px(attr(off, 'x')), y: px(attr(off, 'y')), width: px(attr(ext, 'cx')), height: px(attr(ext, 'cy')) };
}

function placeholderOf(sp: Element): PlaceholderRef | undefined {
  const nv = children(sp).find((c) => c.localName.startsWith('nv'));
  const nvPr = nv && child(nv, 'nvPr');
  const ph = nvPr && child(nvPr, 'ph');
  if (!ph) return undefined;
  const ref: PlaceholderRef = { type: attr(ph, 'type') ?? 'obj' };
  const idx = attr(ph, 'idx');
  if (idx !== null) ref.idx = idx;
  return ref;
}

function placeholderKind(type: string): Placeholder {
  if (type === 'title' || type === 'ctrTitle') return 'title';
  if (type === 'subTitle') return 'subtitle';
  return 'body';
}

class PptxReader {
  private theme = new Map<string, string>();
  readonly pres: Presentation = { width: 960, height: 540, slides: [], resources: new Map(), meta: {} };

  constructor(private readonly zip: ZipEntries) {}

  read(): Presentation {
    const text = readZipText(this.zip, 'ppt/presentation.xml');
    if (!text) throw new Error('Not a PowerPoint presentation: ppt/presentation.xml is missing.');
    const doc = parseXml(text);
    const size = descendants(doc, 'sldSz')[0];
    if (size) {
      this.pres.width = px(attr(size, 'cx'));
      this.pres.height = px(attr(size, 'cy'));
    }
    const rels = readRels(this.zip, 'ppt/presentation.xml');
    const themeRel = [...rels.values()].find((r) => r.type === REL.theme);
    if (themeRel) this.readTheme(themeRel.target);
    for (const id of descendants(doc, 'sldId')) {
      const rid = id.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const rel = rid ? rels.get(rid) : undefined;
      if (rel) this.pres.slides.push(this.readSlide(rel.target));
    }
    this.pres.meta = readCoreProps(this.zip);
    return this.pres;
  }

  private readTheme(path: string): void {
    const text = readZipText(this.zip, path);
    if (!text) return;
    const scheme = descendants(parseXml(text), 'clrScheme')[0];
    if (!scheme) return;
    for (const c of children(scheme)) {
      const val = children(c)[0];
      const color = val ? (val.localName === 'sysClr' ? attr(val, 'lastClr') : attr(val, 'val')) : null;
      if (color) this.theme.set(c.localName, `#${color.toLowerCase()}`);
    }
    // clrMap aliases used by masters
    const alias: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    for (const [a, b] of Object.entries(alias)) {
      const v = this.theme.get(b);
      if (v) this.theme.set(a, v);
    }
  }

  private color(el: Element | undefined): string | undefined {
    if (!el) return undefined;
    const fill = el.localName === 'solidFill' ? el : child(el, 'solidFill');
    const c = fill && children(fill)[0];
    if (!c) return undefined;
    if (c.localName === 'srgbClr') return `#${(attr(c, 'val') ?? '000000').toLowerCase()}`;
    if (c.localName === 'schemeClr') return this.theme.get(attr(c, 'val') ?? '');
    if (c.localName === 'sysClr') return `#${(attr(c, 'lastClr') ?? '000000').toLowerCase()}`;
    return undefined;
  }

  private part(path: string): Document | undefined {
    const text = readZipText(this.zip, path);
    return text ? parseXml(text) : undefined;
  }

  private relOfType(rels: Map<string, Relationship>, type: string): Relationship | undefined {
    return [...rels.values()].find((r) => r.type === type);
  }

  private readSlide(path: string): Slide {
    const doc = this.part(path);
    const slide: Slide = { shapes: [] };
    if (!doc) return slide;
    const rels = readRels(this.zip, path);
    const layoutRel = this.relOfType(rels, REL.slideLayout);
    const layoutDoc = layoutRel ? this.part(layoutRel.target) : undefined;
    const masterRel = layoutRel ? this.relOfType(readRels(this.zip, layoutRel.target), REL.slideMaster) : undefined;
    const masterDoc = masterRel ? this.part(masterRel.target) : undefined;
    const inherited = [layoutDoc, masterDoc].filter((d): d is Document => !!d);

    for (const d of [doc, layoutDoc, masterDoc]) {
      if (!d) continue;
      const bgPr = descendants(d, 'bgPr')[0];
      const bg = bgPr ? this.color(bgPr) : undefined;
      if (bg) {
        slide.background = bg;
        break;
      }
    }
    const tree = descendants(doc, 'spTree')[0];
    if (tree) this.readTree(tree, rels, inherited, identity, slide.shapes);
    const notesRel = this.relOfType(rels, REL.notesSlide);
    const notesDoc = notesRel ? this.part(notesRel.target) : undefined;
    if (notesDoc) {
      const body = descendants(notesDoc, 'sp').find((sp) => placeholderOf(sp)?.type === 'body');
      const text = body ? descendants(body, 'p').map((p) => descendants(p, 't').map((t) => t.textContent ?? '').join('')).join('\n') : '';
      if (text.trim()) slide.notes = text;
    }
    return slide;
  }

  /** Find the layout/master shape matching a placeholder. */
  private inheritedShape(ph: PlaceholderRef, docs: Document[]): Element | undefined {
    const sameType = (a: string, b: string): boolean => a === b || (['title', 'ctrTitle'].includes(a) && ['title', 'ctrTitle'].includes(b)) || (['body', 'obj', 'subTitle'].includes(a) && b === 'body');
    for (const d of docs) {
      const shapes = descendants(d, 'sp');
      const byIdx = ph.idx !== undefined ? shapes.find((s) => placeholderOf(s)?.idx === ph.idx && readXfrm(child(s, 'spPr'))) : undefined;
      const found = byIdx ?? shapes.find((s) => {
        const other = placeholderOf(s);
        return other && sameType(ph.type, other.type) && readXfrm(child(s, 'spPr'));
      });
      if (found) return found;
    }
    return undefined;
  }

  private readTree(tree: Element, rels: Map<string, Relationship>, inherited: Document[], transform: Transform, out: Shape[]): void {
    for (const el of children(tree)) {
      switch (el.localName) {
        case 'sp': {
          const shape = this.readShape(el, inherited, transform);
          if (shape) out.push(shape);
          break;
        }
        case 'pic': {
          const shape = this.readPicture(el, rels, transform);
          if (shape) out.push(shape);
          break;
        }
        case 'grpSp': {
          const gx = child(child(el, 'grpSpPr') ?? el, 'xfrm');
          let t = transform;
          if (gx) {
            const off = child(gx, 'off');
            const ext = child(gx, 'ext');
            const chOff = child(gx, 'chOff');
            const chExt = child(gx, 'chExt');
            if (off && ext && chOff && chExt) {
              const sx = Number(attr(chExt, 'cx')) ? Number(attr(ext, 'cx')) / Number(attr(chExt, 'cx')) : 1;
              const sy = Number(attr(chExt, 'cy')) ? Number(attr(ext, 'cy')) / Number(attr(chExt, 'cy')) : 1;
              const [ox, oy, cx, cy] = [px(attr(off, 'x')), px(attr(off, 'y')), px(attr(chOff, 'x')), px(attr(chOff, 'y'))];
              t = (x) => transform({ x: ox + (x.x - cx) * sx, y: oy + (x.y - cy) * sy, width: x.width * sx, height: x.height * sy });
            }
          }
          this.readTree(el, rels, inherited, t, out);
          break;
        }
        case 'graphicFrame': {
          const table = descendants(el, 'tbl')[0];
          const box = readXfrm(el);
          if (table && box) {
            const paragraphs: Paragraph[] = children(table, 'tr').map((tr) => ({
              type: 'paragraph',
              style: 'normal',
              runs: [{ text: children(tr, 'tc').map((tc) => descendants(tc, 't').map((t) => t.textContent ?? '').join('')).join('  |  ') }],
            }));
            out.push({ id: newShapeId(), kind: 'text', ...transform(box), paragraphs, fontSize: 14 });
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private readShape(sp: Element, inherited: Document[], transform: Transform): Shape | undefined {
    const spPr = child(sp, 'spPr');
    const ph = placeholderOf(sp);
    let box = readXfrm(spPr);
    const base = ph ? this.inheritedShape(ph, inherited) : undefined;
    if (!box && base) box = readXfrm(child(base, 'spPr'));
    if (!box) return undefined;
    const geom = spPr && child(spPr, 'prstGeom');
    const prst = geom ? attr(geom, 'prst') : null;
    const fill = spPr ? this.color(spPr) ?? (base ? this.color(child(base, 'spPr')) : undefined) : undefined;
    const ln = spPr && child(spPr, 'ln');
    const line = ln ? this.color(ln) : undefined;
    const nv = child(sp, 'nvSpPr');
    const isTextBox = nv && child(nv, 'cNvSpPr') && attr(child(nv, 'cNvSpPr')!, 'txBox') === '1';
    const kind = prst === 'ellipse' ? 'ellipse' : ph || isTextBox || (!fill && !line) ? 'text' : 'rect';
    const txBody = child(sp, 'txBody');
    const bodyPr = txBody && child(txBody, 'bodyPr');
    const defRPr = txBody && descendants(txBody, 'lvl1pPr')[0] ? child(descendants(txBody, 'lvl1pPr')[0]!, 'defRPr') : undefined;
    const fontSize = defRPr && attr(defRPr, 'sz') ? Number(attr(defRPr, 'sz')) / 100 : ph ? (DEFAULT_SIZES[ph.type] ?? 18) : 18;
    const shape: Shape = { id: newShapeId(), kind, ...transform(box), paragraphs: txBody ? this.readParagraphs(txBody, ph) : [], fontSize };
    if (fill) shape.fill = fill;
    if (line) shape.line = line;
    if (ph) shape.placeholder = placeholderKind(ph.type);
    const anchor = bodyPr ? attr(bodyPr, 'anchor') : null;
    if (anchor === 'ctr') shape.anchor = 'middle';
    else if (anchor === 'b') shape.anchor = 'bottom';
    else if (anchor === 't') shape.anchor = 'top';
    else if (ph && (ph.type === 'title' || ph.type === 'ctrTitle')) shape.anchor = 'middle';
    return shape;
  }

  private readParagraphs(txBody: Element, ph: PlaceholderRef | undefined): Paragraph[] {
    const bulletsByDefault = ph !== undefined && placeholderKind(ph.type) === 'body' && ph.type !== 'subTitle';
    return children(txBody, 'p').map((p) => {
      const pPr = child(p, 'pPr');
      const para: Paragraph = { type: 'paragraph', style: 'normal', runs: [] };
      const algn = pPr ? attr(pPr, 'algn') : null;
      const align: Align | undefined = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' || algn === 'dist' ? 'justify' : undefined;
      if (align) para.align = align;
      const level = pPr ? Number(attr(pPr, 'lvl') ?? 0) : 0;
      const buNone = pPr && child(pPr, 'buNone');
      const buAuto = pPr && child(pPr, 'buAutoNum');
      const buChar = pPr && child(pPr, 'buChar');
      if (buAuto) para.list = { ordered: true, level };
      else if (buChar || (bulletsByDefault && !buNone)) para.list = { ordered: false, level };
      const runs: Run[] = [];
      for (const c of children(p)) {
        if (c.localName === 'r' || c.localName === 'fld') {
          runs.push({ text: child(c, 't')?.textContent ?? '', ...this.runFormat(child(c, 'rPr')) });
        } else if (c.localName === 'br') {
          runs.push({ text: '\n', ...this.runFormat(child(c, 'rPr')) });
        }
      }
      para.runs = normalizeRuns(runs);
      return para;
    });
  }

  private runFormat(rPr: Element | undefined): TextFormat {
    if (!rPr) return {};
    const f: TextFormat = {};
    if (attr(rPr, 'b') === '1' || attr(rPr, 'b') === 'true') f.bold = true;
    if (attr(rPr, 'i') === '1' || attr(rPr, 'i') === 'true') f.italic = true;
    const u = attr(rPr, 'u');
    if (u && u !== 'none') f.underline = true;
    const strike = attr(rPr, 'strike');
    if (strike && strike !== 'noStrike') f.strike = true;
    const sz = attr(rPr, 'sz');
    if (sz) f.size = Number(sz) / 100;
    const color = this.color(rPr);
    if (color) f.color = color;
    return cleanFormat(f);
  }

  private readPicture(pic: Element, rels: Map<string, Relationship>, transform: Transform): Shape | undefined {
    const box = readXfrm(child(pic, 'spPr'));
    const blip = descendants(pic, 'blip')[0];
    const rid = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
    const rel = rid ? rels.get(rid) : undefined;
    const data = rel && !rel.external ? this.zip[rel.target] : undefined;
    if (!box || !data || !rel) return undefined;
    const ext = rel.target.slice(rel.target.lastIndexOf('.') + 1).toLowerCase();
    const key = addResource(this.pres, data, IMAGE_CONTENT_TYPES[ext] ?? 'application/octet-stream', rel.target.slice(rel.target.lastIndexOf('/') + 1));
    const shape: Shape = { id: newShapeId(), kind: 'image', ...transform(box), paragraphs: [], fontSize: 18, image: key };
    const cNvPr = descendants(pic, 'cNvPr')[0];
    const alt = cNvPr ? attr(cNvPr, 'descr') : null;
    if (alt) shape.alt = alt;
    return shape;
  }
}

export function readPptx(bytes: Uint8Array): Presentation {
  return new PptxReader(readZip(bytes)).read();
}
