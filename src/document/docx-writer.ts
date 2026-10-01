/** DOCX writer producing a minimal, standards-conformant package (DOC-006). */
import { escapeXml as esc, escapeXmlAttr } from '../core/xml';
import { writeZip, type ZipEntryInput } from '../core/zip';
import { imageSize } from '../core/image-size';
import { t } from '../i18n';
import {
  extensionForType,
  groupBlocks,
  splitListSegments,
  isCodeCellRun,
  isDiagramRun,
  isImageRun,
  isFootnoteRun,
  splitParagraphs,
  tocEntries,
  cleanPageSetup,
  zoneParts,
  type PageZones,
  isMathRun,
  type Block,
  type ImageRun,
  type Paragraph,
  type ParagraphLayout,
  type RichDocument,
  type Run,
  type TableCell,
  type WriteOptions,
} from './model';
import { mathmlToOmml, OMML_NS } from '../math/convert';
import { cellsAsBlocks } from './code-cells';
import { diagramsAsPictures } from './diagram';
import { APP_XML, coreXml, EMU_PER_PX, NS, REL } from './ooxml';

const STYLE_IDS: Record<string, string> = {
  h1: 'Heading1',
  h2: 'Heading2',
  h3: 'Heading3',
  h4: 'Heading4',
  h5: 'Heading5',
  h6: 'Heading6',
  quote: 'Quote',
  code: 'Code',
};

/** Content width of an A4 page with 2.54 cm margins, in pixels (for image scaling). */
const MAX_IMAGE_WIDTH_PX = 600;

class DocxWriter {
  private rels: { id: string; type: string; target: string; external?: boolean }[] = [];
  private linkIds = new Map<string, string>();
  private media = new Map<string, { rid: string; path: string }>();
  private abstractNums: string[] = [];
  private nums: string[] = [];
  private drawingId = 1;
  /** Footnote bodies (DOC-022); a note's id is its index + 1. */
  private footnotes: string[] = [];
  private ridCounter = 1;

  constructor(
    private readonly doc: RichDocument,
    private readonly opts: WriteOptions = {},
  ) {}

  private nextRid(): string {
    return `rId${this.ridCounter++}`;
  }

  write(): Uint8Array {
    this.rels.push({ id: this.nextRid(), type: REL.styles, target: 'styles.xml' });
    this.rels.push({ id: this.nextRid(), type: REL.numbering, target: 'numbering.xml' });
    const body = this.blocks(this.doc.blocks);
    if (this.footnotes.length) this.rels.push({ id: this.nextRid(), type: REL.footnotes, target: 'footnotes.xml' });
    // DOC-024: header and footer parts.
    const furniture: { kind: 'header' | 'footer'; rid: string; xml: string }[] = [];
    const page = cleanPageSetup(this.doc.page);
    for (const kind of ['header', 'footer'] as const) {
      const zones = page?.[kind];
      if (!zones) continue;
      const rid = this.nextRid();
      this.rels.push({ id: rid, type: REL[kind], target: `${kind}1.xml` });
      furniture.push({ kind, rid, xml: this.furnitureXml(kind, zones) });
    }
    this.furnitureKinds = furniture.map((f) => f.kind);
    const refs = furniture.map((f) => `<w:${f.kind}Reference w:type="default" r:id="${f.rid}"/>`).join('');
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<w:document xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}" xmlns:m="${OMML_NS}">` +
      `<w:body>${body}<w:sectPr>${refs}<w:pgSz w:w="11906" w:h="16838"/>` +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>';

    const entries: ZipEntryInput[] = [
      { path: '[Content_Types].xml', data: this.contentTypes() },
      { path: '_rels/.rels', data: ROOT_RELS },
      { path: 'docProps/core.xml', data: coreXml(this.doc.meta, esc) },
      { path: 'docProps/app.xml', data: APP_XML },
      { path: 'word/document.xml', data: documentXml },
      { path: 'word/styles.xml', data: STYLES_XML },
      { path: 'word/numbering.xml', data: this.numberingXml() },
      { path: 'word/_rels/document.xml.rels', data: this.relsXml() },
    ];
    if (this.footnotes.length) entries.push({ path: 'word/footnotes.xml', data: this.footnotesXml() });
    for (const f of furniture) entries.push({ path: `word/${f.kind}1.xml`, data: f.xml });
    for (const [key, m] of this.media) {
      const res = this.doc.resources.get(key);
      if (res) entries.push({ path: `word/${m.path}`, data: res.data });
    }
    return writeZip(entries);
  }

  private contentTypes(): string {
    const exts = new Set<string>();
    for (const m of this.media.values()) exts.add(m.path.slice(m.path.lastIndexOf('.') + 1));
    const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', bin: 'application/octet-stream' };
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<Types xmlns="${NS.ct}">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      [...exts].map((e) => `<Default Extension="${e}" ContentType="${types[e] ?? 'application/octet-stream'}"/>`).join('') +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      (this.footnotes.length ? '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' : '') +
      this.furnitureKinds.map((k) => `<Override PartName="/word/${k}1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${k}+xml"/>`).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>'
    );
  }

  private relsXml(): string {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<Relationships xmlns="${NS.rel}">` +
      this.rels
        .map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`)
        .join('') +
      '</Relationships>'
    );
  }

  private numberingXml(): string {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<w:numbering xmlns:w="${NS.w}">${this.abstractNums.join('')}${this.nums.join('')}</w:numbering>`
    );
  }

  /** Create a numbering definition for one list group; returns its numId. */
  private addList(items: Paragraph[]): string {
    const id = this.nums.length + 1;
    const ordered: boolean[] = [];
    for (const p of items) {
      const lvl = Math.min(8, p.list?.level ?? 0);
      if (ordered[lvl] === undefined) ordered[lvl] = !!p.list?.ordered;
    }
    const bullets = ['•', '◦', '▪'];
    let lvls = '';
    for (let i = 0; i < 9; i++) {
      const isOrdered = ordered[i] ?? ordered[0] ?? false;
      const fmt = isOrdered ? (['decimal', 'lowerLetter', 'lowerRoman'][i % 3] as string) : 'bullet';
      const text = isOrdered ? `%${i + 1}.` : bullets[i % 3]!;
      lvls +=
        `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
    }
    this.abstractNums.push(`<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${lvls}</w:abstractNum>`);
    this.nums.push(`<w:num w:numId="${id}"><w:abstractNumId w:val="${id}"/></w:num>`);
    return String(id);
  }

  private blocks(blocks: Block[]): string {
    let out = '';
    for (const group of groupBlocks(blocks)) {
      if (group.type === 'list') {
        for (const segment of splitListSegments(group.items)) {
          const numId = this.addList(segment);
          for (const p of segment) out += this.paragraph(p, numId);
        }
      } else if (group.type === 'paragraph') {
        out += this.paragraph(group);
      } else if (group.type === 'table') {
        out += this.table(group.rows);
      } else if (group.type === 'toc') {
        out += this.toc(group.levels ?? 3);
      } else if (group.page) {
        out += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      } else {
        out += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>';
      }
    }
    return out;
  }

  /**
   * A table of contents (DOC-023): Word's TOC field, marked dirty so that Word
   * recomputes it (with page numbers) when the document is opened; the current
   * headings are its provisional result.
   */
  private toc(levels: number): string {
    const entries = tocEntries(this.doc.blocks, levels);
    const begin =
      '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>' +
      `<w:r><w:instrText xml:space="preserve"> TOC \\o "1-${levels}" \\h \\z \\u </w:instrText></w:r>` +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>';
    const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    let body = `<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t xml:space="preserve">${esc(t('toc.title'))}</w:t></w:r></w:p>`;
    if (!entries.length) {
      body += `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr>${begin}${end}</w:p>`;
    } else {
      entries.forEach((e, i) => {
        body +=
          `<w:p><w:pPr><w:pStyle w:val="TOC${e.level}"/></w:pPr>${i === 0 ? begin : ''}` +
          `<w:r><w:t xml:space="preserve">${esc(e.text)}</w:t></w:r>${i === entries.length - 1 ? end : ''}</w:p>`;
      });
    }
    return `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>${body}</w:sdtContent></w:sdt>`;
  }

  private paragraph(p: Paragraph, numId?: string): string {
    let pPr = '';
    const styleId = STYLE_IDS[p.style];
    if (styleId) pPr += `<w:pStyle w:val="${styleId}"/>`;
    else if (numId) pPr += '<w:pStyle w:val="ListParagraph"/>';
    if (numId) pPr += `<w:numPr><w:ilvl w:val="${Math.min(8, p.list?.level ?? 0)}"/><w:numId w:val="${numId}"/></w:numPr>`;
    pPr += layoutPPr(p);
    if (p.align && p.align !== 'left') pPr += `<w:jc w:val="${p.align === 'justify' ? 'both' : p.align}"/>`;
    return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${p.runs.map((r) => this.run(r)).join('')}</w:p>`;
  }

  private furnitureKinds: ('header' | 'footer')[] = [];

  /** A header or footer: left, centre and right zones separated by tabs, with fields (DOC-024). */
  private furnitureXml(kind: 'header' | 'footer', zones: PageZones): string {
    const field = (instr: string, shown: string): string => `<w:fldSimple w:instr=" ${esc(instr)} "><w:r><w:t xml:space="preserve">${esc(shown)}</w:t></w:r></w:fldSimple>`;
    const runs = (text: string | undefined): string =>
      zoneParts(text ?? '')
        .map((p) =>
          typeof p === 'string'
            ? `<w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r>`
            : p.field === 'page'
              ? field('PAGE', '1')
              : p.field === 'pages'
                ? field('NUMPAGES', '1')
                : p.field === 'title'
                  ? field('TITLE', this.doc.meta.title ?? '')
                  : field('DATE \\@ "yyyy-MM-dd"', new Date().toISOString().slice(0, 10)),
        )
        .join('');
    const tag = kind === 'header' ? 'hdr' : 'ftr';
    const style = kind === 'header' ? 'Header' : 'Footer';
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<w:${tag} xmlns:w="${NS.w}" xmlns:r="${NS.r}">` +
      `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:tabs><w:tab w:val="center" w:pos="4513"/><w:tab w:val="right" w:pos="9026"/></w:tabs></w:pPr>` +
      `${runs(zones.left)}<w:r><w:tab/></w:r>${runs(zones.center)}<w:r><w:tab/></w:r>${runs(zones.right)}</w:p>` +
      `</w:${tag}>`
    );
  }

  private footnotesXml(): string {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<w:footnotes xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}" xmlns:m="${OMML_NS}">` +
      '<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>' +
      '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>' +
      this.footnotes.join('') +
      '</w:footnotes>'
    );
  }

  /** A footnote reference; the note's paragraphs go to footnotes.xml (DOC-022). */
  private footnote(runs: Run[]): string {
    const id = this.footnotes.length + 1;
    this.footnotes.push(''); // reserve the id: notes may hold other runs
    const paragraphs = splitParagraphs(runs).map(
      (part, i) =>
        '<w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>' +
        (i === 0 ? '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>' : '') +
        // Notes have no relationships of their own here: no pictures, links as text.
        part
          .filter((r) => !isImageRun(r) && !isFootnoteRun(r))
          .map((r) => this.run('text' in r && r.link && !r.link.startsWith('#') ? { ...r, link: undefined } : r))
          .join('') +
        '</w:p>',
    );
    this.footnotes[id - 1] = `<w:footnote w:id="${id}">${paragraphs.join('')}</w:footnote>`;
    return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;
  }

  private run(run: Run): string {
    if (isFootnoteRun(run)) return this.footnote(run.footnote);
    if (isImageRun(run)) return this.image(run);
    if (isDiagramRun(run) || isCodeCellRun(run)) return ''; // replaced by diagramsAsPictures / cellsAsBlocks
    if (isMathRun(run)) {
      const mathml = this.opts.mathml?.get(run.math);
      if (!mathml) return `<w:r><w:t xml:space="preserve">${esc(run.display ? `$$${run.math}$$` : `$${run.math}$`)}</w:t></w:r>`;
      const omml = `<m:oMath>${mathmlToOmml(mathml)}</m:oMath>`;
      return run.display ? `<m:oMathPara>${omml}</m:oMathPara>` : omml;
    }
    // Elements in the order of the OOXML schema (Word rejects other orders).
    let rPr = '';
    if (run.code) rPr += '<w:rStyle w:val="CodeChar"/>';
    else if (run.link) rPr += '<w:rStyle w:val="Hyperlink"/>';
    if (run.font && !run.code) rPr += `<w:rFonts w:ascii="${esc(run.font)}" w:hAnsi="${esc(run.font)}" w:eastAsia="${esc(run.font)}" w:cs="${esc(run.font)}"/>`;
    if (run.bold) rPr += '<w:b/><w:bCs/>';
    if (run.italic) rPr += '<w:i/><w:iCs/>';
    if (run.strike) rPr += '<w:strike/>';
    if (run.color) rPr += `<w:color w:val="${run.color.slice(1).toUpperCase()}"/>`;
    if (run.size) rPr += `<w:sz w:val="${Math.round(run.size * 2)}"/><w:szCs w:val="${Math.round(run.size * 2)}"/>`;
    if (run.underline) rPr += '<w:u w:val="single"/>';
    if (run.highlight) rPr += `<w:shd w:val="clear" w:color="auto" w:fill="${run.highlight.slice(1).toUpperCase()}"/>`;
    let content = '';
    for (const part of run.text.split(/(\t|\n)/)) {
      if (part === '\t') content += '<w:tab/>';
      else if (part === '\n') content += '<w:br/>';
      else if (part) content += `<w:t xml:space="preserve">${esc(part)}</w:t>`;
    }
    const r = `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${content}</w:r>`;
    if (!run.link) return r;
    if (run.link.startsWith('#')) return `<w:hyperlink w:anchor="${esc(run.link.slice(1))}">${r}</w:hyperlink>`;
    let rid = this.linkIds.get(run.link);
    if (!rid) {
      rid = this.nextRid();
      this.linkIds.set(run.link, rid);
      this.rels.push({ id: rid, type: REL.hyperlink, target: run.link, external: true });
    }
    return `<w:hyperlink r:id="${rid}">${r}</w:hyperlink>`;
  }

  private image(run: ImageRun): string {
    const res = this.doc.resources.get(run.image);
    if (!res) return '';
    let m = this.media.get(run.image);
    if (!m) {
      m = { rid: this.nextRid(), path: `media/image${this.media.size + 1}.${extensionForType(res.mediaType)}` };
      this.media.set(run.image, m);
      this.rels.push({ id: m.rid, type: REL.image, target: m.path });
    }
    const natural = imageSize(res.data) ?? { width: 300, height: 200 };
    let w = run.width ?? natural.width;
    let h = run.height ?? (run.width ? Math.round((natural.height * run.width) / natural.width) : natural.height);
    if (w > MAX_IMAGE_WIDTH_PX) {
      h = Math.round((h * MAX_IMAGE_WIDTH_PX) / w);
      w = MAX_IMAGE_WIDTH_PX;
    }
    const cx = w * EMU_PER_PX;
    const cy = h * EMU_PER_PX;
    const id = this.drawingId++;
    const alt = escapeXmlAttr(run.alt ?? '');
    const title = run.title ? ` title="${escapeXmlAttr(run.title)}"` : '';
    return (
      '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}" descr="${alt}"${title}/>` +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      `<pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}" descr="${alt}"${title}/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${m.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
    );
  }

  private table(rows: TableCell[][]): string {
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const colW = Math.floor(9026 / cols);
    let out =
      '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>' +
      `<w:gridCol w:w="${colW}"/>`.repeat(cols) +
      '</w:tblGrid>';
    for (const row of rows) {
      out += '<w:tr>';
      for (let c = 0; c < cols; c++) {
        const cell = row[c];
        const paras = cell?.blocks.length ? cell.blocks : [];
        const inner = paras.map((p) => this.paragraph(p)).join('') || '<w:p/>';
        out += `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
      }
      out += '</w:tr>';
    }
    return `${out}</w:tbl>`;
  }
}

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  `<Relationships xmlns="${NS.rel}">` +
  `<Relationship Id="rId1" Type="${REL.officeDocument}" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="${REL.coreProps}" Target="docProps/core.xml"/>` +
  `<Relationship Id="rId3" Type="${REL.extendedProps}" Target="docProps/app.xml"/>` +
  '</Relationships>';

const twips = (pt: number): number => Math.round(pt * 20);


/** Direct paragraph spacing (DOC-020): w:spacing then w:ind, as the schema orders them. */
export function layoutPPr(p: ParagraphLayout): string {
  let out = '';
  const spacing: string[] = [];
  if (p.spaceBefore !== undefined) spacing.push(`w:before="${twips(p.spaceBefore)}"`);
  if (p.spaceAfter !== undefined) spacing.push(`w:after="${twips(p.spaceAfter)}"`);
  if (p.lineHeight) spacing.push(`w:line="${Math.round(p.lineHeight * 240)}" w:lineRule="auto"`);
  if (spacing.length) out += `<w:spacing ${spacing.join(' ')}/>`;
  const ind: string[] = [];
  if (p.indent) ind.push(`w:left="${twips(p.indent)}"`);
  if (p.firstLine) ind.push(p.firstLine > 0 ? `w:firstLine="${twips(p.firstLine)}"` : `w:hanging="${twips(-p.firstLine)}"`);
  if (ind.length) out += `<w:ind ${ind.join(' ')}/>`;
  return out;
}

const heading = (n: number, size: number): string =>
  `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
  `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
  `<w:rPr><w:b/><w:bCs/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  `<w:styles xmlns:w="${NS.w}">` +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>' +
  '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
  '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/>' +
  '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
  '<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:semiHidden/></w:style>' +
  heading(1, 40) +
  heading(2, 32) +
  heading(3, 28) +
  heading(4, 24) +
  heading(5, 22) +
  heading(6, 22) +
  '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
  '<w:pPr><w:ind w:left="720" w:right="720"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="404040"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
  '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:pPr>' +
  '<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>' +
  '<w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/></w:rPr></w:style>' +
  '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
  '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/>' +
  '<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
  '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
  '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4513"/><w:tab w:val="right" w:pos="9026"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4513"/><w:tab w:val="right" w:pos="9026"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Heading1"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>' +
  [1, 2, 3, 4, 5, 6].map((n) => `<w:style w:type="paragraph" w:styleId="TOC${n}"><w:name w:val="toc ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="100"/><w:ind w:left="${(n - 1) * 220}"/></w:pPr></w:style>`).join('') +
  '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>' +
  '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>' +
  '</w:styles>';

export function writeDocx(doc: RichDocument, opts: WriteOptions = {}): Uint8Array {
  return new DocxWriter(cellsAsBlocks(diagramsAsPictures(doc, opts.diagrams)), opts).write();
}

