/** OpenDocument Presentation (.odp) reader (PRES-002, PRES-010). */
import { attr, child, children, descendants, parseXml } from '../core/xml';
import { readZip, readZipText } from '../core/zip';
import { addResource, cleanFormat, mediaTypeForName, normalizeRuns, type Align, type Paragraph, type Run, type TextFormat } from '../document/model';
import { lengthToPx, ODF_NS, readOdfMeta } from '../document/odf';
import { newShapeId, type Placeholder, type Presentation, type Shape, type Slide } from './model';

interface Style {
  parent?: string;
  props: Record<string, string>;
}

const r2 = (v: number | undefined): number => Math.round((v ?? 0) * 100) / 100;
const CLASS_SIZES: Record<string, number> = { title: 44, subtitle: 24, outline: 24 };

class OdpReader {
  private styles = new Map<string, Style>();
  private listStyles = new Map<string, boolean[]>();
  readonly pres: Presentation = { width: 1280, height: 720, slides: [], resources: new Map(), meta: {} };

  constructor(private readonly zip: Record<string, Uint8Array>) {}

  read(): Presentation {
    const content = readZipText(this.zip, 'content.xml');
    if (!content) throw new Error('Not an OpenDocument presentation: content.xml is missing.');
    const stylesText = readZipText(this.zip, 'styles.xml');
    const stylesDoc = stylesText ? parseXml(stylesText) : undefined;
    const doc = parseXml(content);
    for (const d of [stylesDoc, doc]) if (d) this.collect(d);
    if (stylesDoc) {
      const layout = descendants(stylesDoc, 'page-layout-properties')[0];
      const w = lengthToPx(layout ? attr(layout, 'page-width') : null);
      const h = lengthToPx(layout ? attr(layout, 'page-height') : null);
      if (w && h) {
        this.pres.width = r2(w);
        this.pres.height = r2(h);
      }
    }
    for (const page of descendants(doc, 'page')) {
      if (page.namespaceURI === ODF_NS.draw) this.pres.slides.push(this.readPage(page));
    }
    this.pres.meta = readOdfMeta(this.zip);
    return this.pres;
  }

  private collect(d: Document): void {
    for (const s of descendants(d, 'style')) {
      if (s.namespaceURI !== ODF_NS.style) continue;
      const name = attr(s, 'name');
      if (!name) continue;
      const props: Record<string, string> = {};
      for (const p of children(s)) for (const a of Array.from(p.attributes)) props[a.localName] = a.value;
      const style: Style = { props };
      const parent = attr(s, 'parent-style-name');
      if (parent) style.parent = parent;
      this.styles.set(name, style);
    }
    for (const ls of descendants(d, 'list-style')) {
      const levels: boolean[] = [];
      for (const lvl of children(ls)) levels[Number(attr(lvl, 'level') ?? 1)] = lvl.localName === 'list-level-style-number';
      const name = attr(ls, 'name');
      if (name) this.listStyles.set(name, levels);
    }
  }

  /** Style property with inheritance. */
  private prop(name: string | null, key: string): string | undefined {
    const seen = new Set<string>();
    while (name && !seen.has(name)) {
      seen.add(name);
      const s = this.styles.get(name);
      if (!s) return undefined;
      if (key in s.props) return s.props[key];
      name = s.parent ?? null;
    }
    return undefined;
  }

  private readPage(page: Element): Slide {
    const slide: Slide = { shapes: [] };
    const ps = attr(page, 'style-name');
    if (this.prop(ps, 'fill') === 'solid') {
      const c = this.prop(ps, 'fill-color');
      if (c) slide.background = c.toLowerCase();
    }
    for (const el of children(page)) this.readElement(el, slide.shapes);
    const notes = children(page, 'notes')[0];
    if (notes) {
      const frame = children(notes, 'frame').find((f) => attr(f, 'class') === 'notes');
      const box = frame && child(frame, 'text-box');
      const text = box ? descendants(box, 'p').map((p) => this.plain(p)).join('\n') : '';
      if (text.trim()) slide.notes = text;
    }
    return slide;
  }

  private plain(p: Element): string {
    let out = '';
    for (let n = p.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) out += n.nodeValue ?? '';
      else if (n.nodeType === 1) {
        const e = n as Element;
        if (e.localName === 's') out += ' '.repeat(Number(attr(e, 'c') ?? 1) || 1);
        else if (e.localName === 'line-break') out += '\n';
        else if (e.localName === 'tab') out += '\t';
        else out += this.plain(e);
      }
    }
    return out;
  }

  private geometry(el: Element): { x: number; y: number; width: number; height: number } {
    return {
      x: r2(lengthToPx(attr(el, 'x'))),
      y: r2(lengthToPx(attr(el, 'y'))),
      width: r2(lengthToPx(attr(el, 'width'))),
      height: r2(lengthToPx(attr(el, 'height'))),
    };
  }

  private applyGraphic(shape: Shape, el: Element): void {
    const gs = attr(el, 'style-name');
    if (this.prop(gs, 'fill') === 'solid') {
      const c = this.prop(gs, 'fill-color');
      if (c) shape.fill = c.toLowerCase();
    }
    const stroke = this.prop(gs, 'stroke');
    if (stroke && stroke !== 'none') shape.line = (this.prop(gs, 'stroke-color') ?? '#000000').toLowerCase();
    const size = this.prop(gs, 'font-size');
    if (size?.endsWith('pt')) shape.fontSize = Number(size.slice(0, -2));
    const va = this.prop(gs, 'textarea-vertical-align');
    if (va === 'middle' || va === 'top' || va === 'bottom') shape.anchor = va;
  }

  private readElement(el: Element, out: Shape[]): void {
    if (el.namespaceURI !== ODF_NS.draw) return;
    switch (el.localName) {
      case 'g':
        for (const c of children(el)) this.readElement(c, out);
        return;
      case 'frame': {
        const image = child(el, 'image');
        if (image && !child(el, 'text-box')) {
          const href = image.getAttributeNS(ODF_NS.xlink, 'href') ?? '';
          const data = this.zip[href.replace(/^\.\//, '')];
          if (!data) return;
          const shape: Shape = { id: newShapeId(), kind: 'image', ...this.geometry(el), paragraphs: [], fontSize: 18, image: addResource(this.pres, data, mediaTypeForName(href), href.slice(href.lastIndexOf('/') + 1)) };
          const alt = (child(el, 'desc') ?? child(el, 'title'))?.textContent?.trim();
          if (alt) shape.alt = alt;
          out.push(shape);
          return;
        }
        const box = child(el, 'text-box');
        if (!box) return;
        const cls = attr(el, 'class');
        const shape: Shape = { id: newShapeId(), kind: 'text', ...this.geometry(el), paragraphs: this.readText(box), fontSize: CLASS_SIZES[cls ?? ''] ?? 18 };
        const ph: Placeholder | undefined = cls === 'title' ? 'title' : cls === 'subtitle' ? 'subtitle' : cls === 'outline' ? 'body' : undefined;
        if (ph) shape.placeholder = ph;
        this.applyGraphic(shape, el);
        out.push(shape);
        return;
      }
      case 'rect':
      case 'ellipse':
      case 'circle':
      case 'custom-shape': {
        const geom = child(el, 'enhanced-geometry');
        const type = geom ? attr(geom, 'type') : null;
        const kind = el.localName === 'rect' || (el.localName === 'custom-shape' && type !== 'ellipse') ? 'rect' : 'ellipse';
        const shape: Shape = { id: newShapeId(), kind, ...this.geometry(el), paragraphs: this.readText(el), fontSize: 18 };
        this.applyGraphic(shape, el);
        out.push(shape);
        return;
      }
      default:
        return;
    }
  }

  private readText(container: Element, listStyle?: string, depth = 0): Paragraph[] {
    const out: Paragraph[] = [];
    for (const el of children(container)) {
      if (el.namespaceURI !== ODF_NS.text) continue;
      if (el.localName === 'p' || el.localName === 'h') {
        const para: Paragraph = { type: 'paragraph', style: 'normal', runs: [] };
        const ta = this.prop(attr(el, 'style-name'), 'text-align');
        const align: Align | undefined = ta === 'center' ? 'center' : ta === 'end' || ta === 'right' ? 'right' : ta === 'justify' ? 'justify' : undefined;
        if (align) para.align = align;
        if (depth > 0) para.list = { ordered: listStyle ? (this.listStyles.get(listStyle)?.[depth] ?? false) : false, level: depth - 1 };
        const runs: Run[] = [];
        this.inline(el, {}, runs);
        para.runs = normalizeRuns(runs);
        out.push(para);
      } else if (el.localName === 'list') {
        const style = attr(el, 'style-name') ?? listStyle;
        for (const item of children(el)) {
          if (item.localName === 'list-item' || item.localName === 'list-header') out.push(...this.readText(item, style, depth + 1));
        }
      }
    }
    return out;
  }

  private textFormat(name: string | null, base: TextFormat): TextFormat {
    const f = { ...base };
    const w = this.prop(name, 'font-weight');
    if (w === 'bold' || Number(w) >= 600) f.bold = true;
    if (this.prop(name, 'font-style') === 'italic') f.italic = true;
    const u = this.prop(name, 'text-underline-style');
    if (u && u !== 'none') f.underline = true;
    const s = this.prop(name, 'text-line-through-style');
    if (s && s !== 'none') f.strike = true;
    const size = this.prop(name, 'font-size');
    if (size?.endsWith('pt')) f.size = Number(size.slice(0, -2));
    const color = this.prop(name, 'color');
    if (color) f.color = color.toLowerCase();
    return f;
  }

  private inline(el: Element, fmt: TextFormat, out: Run[]): void {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        const text = (n.nodeValue ?? '').replace(/[ \t\r\n]+/g, ' ');
        if (text) out.push({ text, ...cleanFormat(fmt) });
      } else if (n.nodeType === 1) {
        const c = n as Element;
        if (c.localName === 's') out.push({ text: ' '.repeat(Number(attr(c, 'c') ?? 1) || 1), ...cleanFormat(fmt) });
        else if (c.localName === 'tab') out.push({ text: '\t', ...cleanFormat(fmt) });
        else if (c.localName === 'line-break') out.push({ text: '\n', ...cleanFormat(fmt) });
        else if (c.localName === 'span') this.inline(c, this.textFormat(attr(c, 'style-name'), fmt), out);
        else if (c.localName === 'a') {
          const href = c.getAttributeNS(ODF_NS.xlink, 'href');
          this.inline(c, href ? { ...fmt, link: href } : fmt, out);
        } else if (!['note', 'annotation', 'bookmark'].includes(c.localName)) this.inline(c, fmt, out);
      }
    }
  }
}

export function readOdp(bytes: Uint8Array): Presentation {
  return new OdpReader(readZip(bytes)).read();
}
