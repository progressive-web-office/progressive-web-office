/** OpenDocument Presentation (.odp) writer (PRES-008, PRES-010). */
import { escapeXml as esc } from '../core/xml';
import { writeZip, type ZipEntryInput } from '../core/zip';
import { MIME_TYPES } from '../core/format';
import { extensionForType, groupBlocks, isTextRun, nestLists, splitListSegments, type ListNode, type Paragraph, type TextRun } from '../document/model';
import { manifestXml, metaXml, ODF_XMLNS, odfText, pxToIn } from '../document/odf';
import type { Presentation, Shape } from './model';

class OdpWriter {
  private styles = new Map<string, string>(); // xml -> name
  private styleXml: string[] = [];
  private pictures = new Map<string, string>();
  private listCount = 0;

  constructor(private readonly pres: Presentation) {}

  private style(family: string, prefix: string, body: string): string {
    const key = `${family}|${body}`;
    let name = this.styles.get(key);
    if (!name) {
      name = `${prefix}${this.styles.size + 1}`;
      this.styles.set(key, name);
      this.styleXml.push(`<style:style style:name="${name}" style:family="${family}">${body}</style:style>`);
    }
    return name;
  }

  private graphicStyle(s: Shape): string {
    const fill = s.fill ? `draw:fill="solid" draw:fill-color="${s.fill}"` : 'draw:fill="none"';
    const stroke = s.line ? `draw:stroke="solid" svg:stroke-color="${s.line}"` : 'draw:stroke="none"';
    const va = s.anchor ? ` draw:textarea-vertical-align="${s.anchor}"` : '';
    return this.style(
      'graphic',
      'gr',
      `<style:graphic-properties ${fill} ${stroke}${va} draw:auto-grow-height="false" fo:padding="0.05in"/><style:text-properties fo:font-size="${s.fontSize}pt"/>`,
    );
  }

  private textStyle(r: TextRun): string | undefined {
    const props: string[] = [];
    if (r.bold) props.push('fo:font-weight="bold"');
    if (r.italic) props.push('fo:font-style="italic"');
    if (r.underline) props.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
    if (r.strike) props.push('style:text-line-through-style="solid"');
    if (r.size) props.push(`fo:font-size="${r.size}pt"`);
    if (r.color) props.push(`fo:color="${r.color}"`);
    return props.length ? this.style('text', 'T', `<style:text-properties ${props.join(' ')}/>`) : undefined;
  }

  private paragraph(p: Paragraph): string {
    const ps = p.align && p.align !== 'left' ? ` text:style-name="${this.style('paragraph', 'P', `<style:paragraph-properties fo:text-align="${p.align === 'right' ? 'end' : p.align}"/>`)}"` : '';
    let body = '';
    let atStart = true;
    for (const r of p.runs) {
      if (!isTextRun(r)) continue;
      let xml = odfText(r.text, atStart);
      atStart = r.text.endsWith('\n');
      const ts = this.textStyle(r);
      if (ts) xml = `<text:span text:style-name="${ts}">${xml}</text:span>`;
      if (r.link) xml = `<text:a xlink:type="simple" xlink:href="${esc(r.link)}">${xml}</text:a>`;
      body += xml;
    }
    return `<text:p${ps}>${body}</text:p>`;
  }

  private listStyle(items: Paragraph[]): string {
    const ordered: boolean[] = [];
    for (const p of items) {
      const l = Math.min(9, p.list?.level ?? 0);
      if (ordered[l] === undefined) ordered[l] = !!p.list?.ordered;
    }
    const name = `L${++this.listCount}`;
    let levels = '';
    for (let i = 0; i < 10; i++) {
      const props = `<style:list-level-properties text:space-before="${(i * 0.4).toFixed(2)}in" text:min-label-width="0.3in"/>`;
      levels += ordered[i]
        ? `<text:list-level-style-number text:level="${i + 1}" style:num-suffix="." style:num-format="1">${props}</text:list-level-style-number>`
        : `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="•">${props}</text:list-level-style-bullet>`;
    }
    this.styleXml.push(`<text:list-style style:name="${name}">${levels}</text:list-style>`);
    return name;
  }

  private list(node: ListNode, style: string | null): string {
    let out = style ? `<text:list text:style-name="${style}">` : '<text:list>';
    for (const item of node.items) {
      out += '<text:list-item>';
      if (item.paragraph) out += this.paragraph(item.paragraph);
      for (const c of item.children) out += this.list(c, null);
      out += '</text:list-item>';
    }
    return `${out}</text:list>`;
  }

  private text(paragraphs: Paragraph[]): string {
    let out = '';
    for (const g of groupBlocks(paragraphs)) {
      if (g.type === 'list') {
        for (const seg of splitListSegments(g.items)) {
          const style = this.listStyle(seg);
          for (const node of nestLists(seg)) out += this.list(node, style);
        }
      } else if (g.type === 'paragraph') {
        out += this.paragraph(g);
      }
    }
    return out;
  }

  private geometry(s: Shape): string {
    return `svg:x="${pxToIn(s.x)}" svg:y="${pxToIn(s.y)}" svg:width="${pxToIn(s.width)}" svg:height="${pxToIn(s.height)}"`;
  }

  private shape(s: Shape): string {
    const gs = this.graphicStyle(s);
    switch (s.kind) {
      case 'image': {
        const res = s.image ? this.pres.resources.get(s.image) : undefined;
        if (!res || !s.image) return '';
        let path = this.pictures.get(s.image);
        if (!path) {
          path = `Pictures/${s.image}.${extensionForType(res.mediaType)}`;
          this.pictures.set(s.image, path);
        }
        return `<draw:frame draw:style-name="${gs}" ${this.geometry(s)}><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${s.alt ? `<svg:desc>${esc(s.alt)}</svg:desc>` : ''}</draw:frame>`;
      }
      case 'rect':
        return `<draw:rect draw:style-name="${gs}" ${this.geometry(s)}>${this.text(s.paragraphs)}</draw:rect>`;
      case 'ellipse':
        return `<draw:ellipse draw:style-name="${gs}" ${this.geometry(s)}>${this.text(s.paragraphs)}</draw:ellipse>`;
      default: {
        const cls = s.placeholder ? ` presentation:class="${s.placeholder === 'body' ? 'outline' : s.placeholder}"` : '';
        return `<draw:frame draw:style-name="${gs}"${cls} ${this.geometry(s)}><draw:text-box>${this.text(s.paragraphs)}</draw:text-box></draw:frame>`;
      }
    }
  }

  write(): Uint8Array {
    const pages = this.pres.slides
      .map((slide, i) => {
        const dp = slide.background
          ? ` draw:style-name="${this.style('drawing-page', 'dp', `<style:drawing-page-properties draw:fill="solid" draw:fill-color="${slide.background}" presentation:background-visible="true"/>`)}"`
          : '';
        const notes = slide.notes
          ? `<presentation:notes><draw:frame presentation:class="notes" svg:x="0.5in" svg:y="5in" svg:width="7in" svg:height="4in"><draw:text-box>${slide.notes
              .split('\n')
              .map((l) => `<text:p>${odfText(l, true)}</text:p>`)
              .join('')}</draw:text-box></draw:frame></presentation:notes>`
          : '';
        return `<draw:page draw:name="page${i + 1}"${dp} draw:master-page-name="Default">${slide.shapes.map((s) => this.shape(s)).join('')}${notes}</draw:page>`;
      })
      .join('');
    const content =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      `<office:document-content ${ODF_XMLNS} office:version="1.3"><office:automatic-styles>${this.styleXml.join('')}</office:automatic-styles>` +
      `<office:body><office:presentation>${pages}</office:presentation></office:body></office:document-content>`;
    const styles =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      `<office:document-styles ${ODF_XMLNS} office:version="1.3"><office:styles>` +
      '<style:default-style style:family="graphic"><style:text-properties fo:font-size="18pt" style:font-name="Liberation Sans"/></style:default-style>' +
      '</office:styles><office:automatic-styles>' +
      `<style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0in" fo:margin-bottom="0in" fo:margin-left="0in" fo:margin-right="0in" fo:page-width="${pxToIn(this.pres.width)}" fo:page-height="${pxToIn(this.pres.height)}" style:print-orientation="landscape"/></style:page-layout>` +
      '<style:style style:name="Mdp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#ffffff"/></style:style>' +
      '</office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1" draw:style-name="Mdp1"/></office:master-styles></office:document-styles>';
    const files: ZipEntryInput[] = [];
    const manifest = [
      { path: 'content.xml', mediaType: 'text/xml' },
      { path: 'styles.xml', mediaType: 'text/xml' },
      { path: 'meta.xml', mediaType: 'text/xml' },
    ];
    for (const [key, path] of this.pictures) {
      const res = this.pres.resources.get(key)!;
      files.push({ path, data: res.data, store: true });
      manifest.push({ path, mediaType: res.mediaType });
    }
    return writeZip([
      { path: 'mimetype', data: MIME_TYPES.odp, store: true },
      { path: 'META-INF/manifest.xml', data: manifestXml(MIME_TYPES.odp, manifest) },
      { path: 'content.xml', data: content },
      { path: 'styles.xml', data: styles },
      { path: 'meta.xml', data: metaXml(this.pres.meta) },
      ...files,
    ]);
  }
}

export function writeOdp(pres: Presentation): Uint8Array {
  return new OdpWriter(pres).write();
}
