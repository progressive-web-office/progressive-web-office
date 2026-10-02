/** OpenDocument Text (.odt) writer (DOC-007). */
import { escapeXml as esc, escapeXmlAttr as escAttr } from '../core/xml';
import { writeZip, type ZipEntryInput } from '../core/zip';
import { imageSize } from '../core/image-size';
import { MIME_TYPES } from '../core/format';
import { t } from '../i18n';
import {
  extensionForType,
  groupBlocks,
  isImageRun,
  isCodeCellRun,
  isDiagramRun,
  isMathRun,
  isFootnoteRun,
  isSeqRun,
  isRefRun,
  isCiteRun,
  crossTargets,
  anchorSpan,
  SEQ_NAMES,
  SEQ_KINDS,
  splitParagraphs,
  tocEntries,
  cleanPageSetup,
  zoneParts,
  formatPageNumber,
  nestLists,
  splitListSegments,
  type Block,
  type ListNode,
  type Paragraph,
  type ParagraphLayout,
  type DocComment,
  type RichDocument,
  type Run,
  type Table,
  type TextRun,
  type WriteOptions,
  tableGrid,
} from './model';
import { MATHML_NS } from '../math/convert';
import { cellsAsBlocks } from './code-cells';
import { diagramsAsPictures } from './diagram';
import { citations, formatEntry, writeNames, parseNames, type BibEntry, type Citations } from './bibliography';
import { anchoredComments, CommentRanges } from './comments';
import { ODF_BIB_FIELDS, ODF_NUMBER_FORMAT, manifestXml, metaXml, ODF_XMLNS, odfText, pxToIn } from './odf';

const PARA_STYLE: Record<string, string> = {
  normal: 'Standard',
  quote: 'Quotations',
  code: 'Preformatted_20_Text',
  caption: 'Caption',
};

class OdtWriter {
  private autoStyles = new Map<string, string>();
  private readonly paraNames = new Map<string, string>();
  private readonly textNames = new Map<string, string>();
  private noteCount = 0;
  private tocCount = 0;
  private includeCount = 0;
  private listStyles: string[] = [];
  private pictures = new Map<string, string>();
  private tableCount = 0;
  private frameCount = 0;
  private formulas: { dir: string; xml: string }[] = [];

  constructor(
    private readonly doc: RichDocument,
    private readonly opts: WriteOptions = {},
  ) {}

  /** Cross-reference targets and numbers (DOC-026). */
  private xref: ReturnType<typeof crossTargets> = { targets: new Map(), numbers: new Map() };
  /** Anchor of the paragraph being written, named on its sequence. */
  private anchor: string | undefined;
  /** Comments written (REV-003), named `__Annotation__n` by their position here. */
  private comments: DocComment[] = [];
  private ranges = new CommentRanges(new Set());
  /** The runs written are those of a paragraph (not of a note inside it). */
  private inParagraph = false;

  /** Citation numbers and texts, and the sources (DOC-027). */
  private cites: Citations = citations([], undefined);
  private entries = new Map<string, BibEntry>();

  write(): Uint8Array {
    this.xref = crossTargets(this.doc.blocks);
    this.cites = citations(this.doc.blocks, this.doc.references);
    this.entries = new Map((this.doc.references?.entries ?? []).map((e) => [e.key, e]));
    const decls = `<text:sequence-decls>${SEQ_KINDS.map((k) => `<text:sequence-decl text:display-outline-level="0" text:name="${SEQ_NAMES[k]}"/>`).join('')}</text:sequence-decls>`;
    const anchored = anchoredComments(this.doc);
    this.comments = (this.doc.comments ?? []).filter((c) => anchored.has(c.parent ?? c.id));
    this.ranges = new CommentRanges(new Set(this.comments.filter((c) => !c.parent).map((c) => c.id)));
    let text = this.blocks(this.doc.blocks);
    const open = this.ranges.close();
    if (open.length) {
      // REV-003: ranges still open end with the last paragraph.
      const at = Math.max(text.lastIndexOf('</text:p>'), text.lastIndexOf('</text:h>'));
      if (at >= 0) text = text.slice(0, at) + this.annotationEnds(open) + text.slice(at);
    }
    const body = decls + this.firstPageStyle(text);
    const content =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      `<office:document-content ${ODF_XMLNS} office:version="1.3">` +
      `<office:automatic-styles>${[...this.autoStyles.values()].join('')}${this.listStyles.join('')}` +
      '<style:style style:name="fr1" style:family="graphic" style:parent-style-name="Graphics"/>' +
      '<style:style style:name="frMath" style:family="graphic"><style:graphic-properties style:vertical-pos="middle" style:vertical-rel="text" draw:ole-draw-aspect="1"/></style:style>' +
      TABLE_STYLES +
      '</office:automatic-styles>' +
      `<office:body><office:text>${body}</office:text></office:body></office:document-content>`;

    const files: ZipEntryInput[] = [];
    const manifest: { path: string; mediaType: string }[] = [
      { path: 'content.xml', mediaType: 'text/xml' },
      { path: 'styles.xml', mediaType: 'text/xml' },
      { path: 'meta.xml', mediaType: 'text/xml' },
    ];
    for (const f of this.formulas) {
      files.push({ path: `${f.dir}/content.xml`, data: f.xml });
      manifest.push({ path: `${f.dir}/`, mediaType: 'application/vnd.oasis.opendocument.formula' }, { path: `${f.dir}/content.xml`, mediaType: 'text/xml' });
    }
    for (const [key, path] of this.pictures) {
      const res = this.doc.resources.get(key)!;
      files.push({ path, data: res.data, store: true });
      manifest.push({ path, mediaType: res.mediaType });
    }
    return writeZip([
      { path: 'mimetype', data: MIME_TYPES.odt, store: true },
      { path: 'META-INF/manifest.xml', data: manifestXml(MIME_TYPES.odt, manifest) },
      { path: 'content.xml', data: content },
      { path: 'styles.xml', data: stylesXml(this.doc) },
      { path: 'meta.xml', data: metaXml(this.doc.meta) },
      ...files,
    ]);
  }

  /** DOC-029: the first paragraph starts on the "First Page" master page (no header and footer). */
  private firstPageStyle(body: string): string {
    if (!cleanPageSetup(this.doc.page)?.hideOnFirstPage) return body;
    const m = /^<text:(?:p|h) text:style-name="([^"]+)"/.exec(body);
    if (!m) return body;
    const used = m[1]!;
    const auto = this.autoStyles.get(used);
    const xml = auto
      ? auto.replace(`style:name="${used}"`, 'style:name="PFirst" style:master-page-name="First_20_Page"')
      : `<style:style style:name="PFirst" style:family="paragraph" style:parent-style-name="${used}" style:master-page-name="First_20_Page"/>`;
    this.autoStyles.set('PFirst', xml);
    return body.replace(m[0], m[0].replace(`"${used}"`, '"PFirst"'));
  }

  /** Automatic paragraph style for alignment and spacing on top of a common style (DOC-020). */
  private paraStyle(common: string, p: ParagraphLayout & Pick<Paragraph, 'align'>): string {
    const props: string[] = [];
    if (p.align && p.align !== 'left') props.push(`fo:text-align="${p.align === 'right' ? 'end' : p.align}"`);
    if (p.indent) props.push(`fo:margin-left="${p.indent}pt"`);
    if (p.firstLine) props.push(`fo:text-indent="${p.firstLine}pt"`);
    if (p.spaceBefore !== undefined) props.push(`fo:margin-top="${p.spaceBefore}pt"`);
    if (p.spaceAfter !== undefined) props.push(`fo:margin-bottom="${p.spaceAfter}pt"`);
    if (p.lineHeight) props.push(`fo:line-height="${Math.round(p.lineHeight * 100)}%"`);
    if (!props.length) return common;
    const key = `${common}|${props.join(' ')}`;
    let name = this.paraNames.get(key);
    if (!name) {
      name = `P${this.paraNames.size + 1}_${common}`;
      this.paraNames.set(key, name);
      this.autoStyles.set(name, `<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="${common}"><style:paragraph-properties ${props.join(' ')}/></style:style>`);
    }
    return name;
  }

  private textStyle(run: TextRun): string | undefined {
    const props =
      (run.bold ? ' fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"' : '') +
      (run.italic ? ' fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"' : '') +
      (run.underline ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : '') +
      (run.strike ? ' style:text-line-through-style="solid" style:text-line-through-type="single"' : '') +
      (run.font && !run.code ? ` fo:font-family="${escAttr(run.font)}" style:font-family-asian="${escAttr(run.font)}" style:font-family-complex="${escAttr(run.font)}"` : '') +
      (run.size ? ` fo:font-size="${run.size}pt" style:font-size-asian="${run.size}pt" style:font-size-complex="${run.size}pt"` : '') +
      (run.color ? ` fo:color="${run.color}"` : '') +
      (run.highlight ? ` fo:background-color="${run.highlight}"` : '');
    if (!props) return undefined;
    let name = this.textNames.get(props);
    if (!name) {
      name = `T${this.textNames.size + 1}`;
      this.textNames.set(props, name);
      this.autoStyles.set(name, `<style:style style:name="${name}" style:family="text"><style:text-properties${props}/></style:style>`);
    }
    return name;
  }

  private blocks(blocks: Block[]): string {
    let out = '';
    for (const group of groupBlocks(blocks)) {
      if (group.type === 'list') {
        for (const segment of splitListSegments(group.items)) {
          for (const list of nestLists(segment)) out += this.list(list, this.listStyle(segment), true);
        }
      } else if (group.type === 'paragraph') {
        out += this.paragraph(group);
      } else if (group.type === 'table') {
        out += this.table(group);
      } else if (group.type === 'toc') {
        out += this.toc(group.levels ?? 3);
      } else if (group.type === 'bibliography') {
        out += this.bibliography();
      } else if (group.type === 'include') {
        // DOC-028: a linked section, as in LibreOffice master documents (paths are relative to the package).
        const n = ++this.includeCount;
        const filter = /\.odt$/i.test(group.src) ? ' text:filter-name="writer8"' : '';
        out += `<text:section text:name="Include${n}" text:protected="true"><text:section-source xlink:href="../${esc(encodeURI(group.src))}" xlink:type="simple"${filter}/><text:p text:style-name="Standard">${esc(group.src)}</text:p></text:section>`;
      } else {
        if (group.page) {
          this.autoStyles.set('PageBreak', '<style:style style:name="PageBreak" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:break-after="page"/></style:style>');
          out += '<text:p text:style-name="PageBreak"/>';
        } else {
          out += '<text:p text:style-name="Horizontal_20_Line"/>';
        }
      }
    }
    return out;
  }

  /** A table of contents that LibreOffice updates (Tools > Update) (DOC-023). */
  /** The list of references (DOC-027), regenerated by LibreOffice from the marks. */
  private bibliography(): string {
    const numeric = this.doc.references?.style !== 'author-year';
    const items = this.cites.cited
      .map((e) => `<text:p text:style-name="Bibliography_20_1">${numeric ? `[${this.cites.numbers.get(e.key)}] ` : ''}${this.runs(formatEntry(e))}</text:p>`)
      .join('');
    return (
      `<text:bibliography text:name="Bibliography1"><text:bibliography-source><text:index-title-template text:style-name="Bibliography_20_Heading">${esc(t('bib.title'))}</text:index-title-template></text:bibliography-source>` +
      `<text:index-body><text:index-title text:name="Bibliography1_Head"><text:p text:style-name="Bibliography_20_Heading">${esc(t('bib.title'))}</text:p></text:index-title>${items}</text:index-body></text:bibliography>`
    );
  }

  private toc(levels: number): string {
    const n = ++this.tocCount;
    const entries = tocEntries(this.doc.blocks, levels)
      .map((e) => `<text:p text:style-name="Contents_20_${e.level}">${esc(e.text)}</text:p>`)
      .join('');
    const templates = Array.from({ length: levels }, (_, i) => `<text:table-of-content-entry-template text:outline-level="${i + 1}" text:style-name="Contents_20_${i + 1}"><text:index-entry-link-start/><text:index-entry-chapter/><text:index-entry-text/><text:index-entry-tab-stop style:type="right" style:leader-char="."/><text:index-entry-page-number/><text:index-entry-link-end/></text:table-of-content-entry-template>`).join('');
    return (
      `<text:table-of-content text:protected="true" text:name="Table of Contents${n}">` +
      `<text:table-of-content-source text:outline-level="${levels}" text:use-index-marks="false"><text:index-title-template text:style-name="Contents_20_Heading">${esc(t('toc.title'))}</text:index-title-template>${templates}</text:table-of-content-source>` +
      `<text:index-body><text:index-title text:name="Table of Contents${n}_Head"><text:p text:style-name="Contents_20_Heading">${esc(t('toc.title'))}</text:p></text:index-title>${entries}</text:index-body>` +
      '</text:table-of-content>'
    );
  }

  private listStyle(items: Paragraph[]): string {
    const ordered: boolean[] = [];
    for (const p of items) {
      const lvl = Math.min(9, p.list?.level ?? 0);
      if (ordered[lvl] === undefined) ordered[lvl] = !!p.list?.ordered;
    }
    const name = `L${this.listStyles.length + 1}`;
    let levels = '';
    for (let i = 0; i < 10; i++) {
      const isOrdered = ordered[i] ?? false;
      const props =
        '<style:list-level-properties text:list-level-position-and-space-mode="label-alignment">' +
        `<style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.25in" fo:margin-left="${((i + 1) * 0.5).toFixed(2)}in"/>` +
        '</style:list-level-properties>';
      levels += isOrdered
        ? `<text:list-level-style-number text:level="${i + 1}" style:num-suffix="." style:num-format="1">${props}</text:list-level-style-number>`
        : `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="${['•', '◦', '▪'][i % 3]}">${props}</text:list-level-style-bullet>`;
    }
    this.listStyles.push(`<text:list-style style:name="${name}">${levels}</text:list-style>`);
    return name;
  }

  private list(list: ListNode, styleName: string, top: boolean): string {
    let out = top ? `<text:list text:style-name="${styleName}">` : '<text:list>';
    for (const item of list.items) {
      out += '<text:list-item>';
      if (item.paragraph) out += this.paragraph(item.paragraph);
      for (const c of item.children) out += this.list(c, styleName, false);
      out += '</text:list-item>';
    }
    return `${out}</text:list>`;
  }

  private paragraph(p: Paragraph): string {
    this.inParagraph = true;
    try {
      return this.paragraphXml(p);
    } finally {
      this.inParagraph = false;
    }
  }

  private annotationName(id: string): string {
    return `__Annotation__${this.comments.findIndex((c) => c.id === id) + 1}`;
  }

  /** A comment and its replies, each an annotation (REV-003). */
  private annotationStarts(ids: string[]): string {
    return ids
      .flatMap((id) => this.comments.filter((c) => c.id === id || c.parent === id))
      .map((c) => {
        const attrs = `office:name="${this.annotationName(c.id)}"${c.parent ? ` loext:parent-name="${this.annotationName(c.parent)}"` : ''}${c.resolved ? ' loext:resolved="true"' : ''}`;
        return (
          `<office:annotation ${attrs}>` +
          (c.author ? `<dc:creator>${esc(c.author)}</dc:creator>` : '') +
          (c.date ? `<dc:date>${esc(c.date)}</dc:date>` : '') +
          (c.initials ? `<meta:creator-initials>${esc(c.initials)}</meta:creator-initials>` : '') +
          c.text
            .split('\n')
            .map((line) => `<text:p>${odfText(line, true)}</text:p>`)
            .join('') +
          '</office:annotation>'
        );
      })
      .join('');
  }

  private annotationEnds(ids: string[]): string {
    return ids
      .flatMap((id) => this.comments.filter((c) => c.id === id || c.parent === id))
      .map((c) => `<office:annotation-end office:name="${this.annotationName(c.id)}"/>`)
      .join('');
  }

  private paragraphXml(p: Paragraph): string {
    let runs: string;
    if (p.id && this.xref.targets.get(p.id)) {
      // DOC-026: a bookmark around the label and number, or the heading text.
      const [start, end] = anchorSpan(p.runs);
      const name = esc(p.id);
      this.anchor = p.id;
      runs = `${this.runs(p.runs.slice(0, start))}<text:bookmark-start text:name="${name}"/>${this.runs(p.runs.slice(start, end))}<text:bookmark-end text:name="${name}"/>${this.runs(p.runs.slice(end))}`;
      this.anchor = undefined;
    } else {
      runs = this.runs(p.runs);
    }
    const heading = /^h(\d)$/.exec(p.style);
    if (heading) {
      const style = this.paraStyle(`Heading_20_${heading[1]}`, p);
      return `<text:h text:style-name="${style}" text:outline-level="${heading[1]}">${runs}</text:h>`;
    }
    const style = this.paraStyle(PARA_STYLE[p.style] ?? 'Standard', p);
    return `<text:p text:style-name="${style}">${runs}</text:p>`;
  }

  private runs(runs: Run[]): string {
    // Notes inside the paragraph are written by a nested call: no comment there.
    const track = this.inParagraph;
    this.inParagraph = false;
    try {
      return this.runsXml(runs, track);
    } finally {
      this.inParagraph = track;
    }
  }

  private runsXml(runs: Run[], track: boolean): string {
    let out = '';
    let atStart = true;
    for (const run of runs) {
      if (track) {
        const { end, start } = this.ranges.step(run);
        out += this.annotationEnds(end) + this.annotationStarts(start);
      }
      if (isImageRun(run)) {
        out += this.image(run.image, run.alt, run.width, run.height, run.title);
        atStart = false;
        continue;
      }
      if (isDiagramRun(run) || isCodeCellRun(run)) continue; // replaced by diagramsAsPictures / cellsAsBlocks
      if (isMathRun(run)) {
        out += this.formula(run.math, !!run.display);
        atStart = false;
        continue;
      }
      if (isSeqRun(run)) {
        const n = this.xref.numbers.get(run) ?? 1;
        const name = SEQ_NAMES[run.seq];
        const seq = `<text:sequence${this.anchor ? ` text:ref-name="${esc(this.anchor)}"` : ''} text:name="${name}" text:formula="ooow:${name}+1" style:num-format="1">${n}</text:sequence>`;
        out += run.seq === 'equation' ? `(${seq})` : seq;
        atStart = false;
        continue;
      }
      if (isCiteRun(run)) {
        // DOC-027: one bibliography mark per source, carrying its data.
        out += run.cite.map((key, i) => bibliographyMark(this.entries.get(key) ?? { key, type: 'misc', fields: {} }, i === 0 ? this.cites.text(run) : '')).join('');
        atStart = false;
        continue;
      }
      if (isRefRun(run)) {
        const target = this.xref.targets.get(run.ref);
        out += target ? `<text:bookmark-ref text:reference-format="text" text:ref-name="${esc(run.ref)}">${esc(target.label)}</text:bookmark-ref>` : '??';
        atStart = false;
        continue;
      }
      if (isFootnoteRun(run)) {
        // DOC-022: LibreOffice numbers the notes; the citation is a fallback.
        const n = ++this.noteCount;
        const body = splitParagraphs(run.footnote.filter((r) => !isFootnoteRun(r)))
          .map((part) => `<text:p text:style-name="Footnote">${this.runs(part)}</text:p>`)
          .join('');
        out += `<text:note text:id="ftn${n}" text:note-class="footnote"><text:note-citation>${n}</text:note-citation><text:note-body>${body}</text:note-body></text:note>`;
        atStart = false;
        continue;
      }
      let xml = odfText(run.text, atStart);
      atStart = run.text.endsWith('\n');
      const style = this.textStyle(run);
      if (style) xml = `<text:span text:style-name="${style}">${xml}</text:span>`;
      if (run.code) xml = `<text:span text:style-name="Source_20_Text">${xml}</text:span>`;
      if (run.link) xml = `<text:a xlink:type="simple" xlink:href="${esc(run.link)}">${xml}</text:a>`;
      out += xml;
    }
    return out;
  }

  private image(key: string, alt: string | undefined, width?: number, height?: number, title?: string): string {
    const res = this.doc.resources.get(key);
    if (!res) return '';
    let path = this.pictures.get(key);
    if (!path) {
      path = `Pictures/${key}.${extensionForType(res.mediaType)}`;
      this.pictures.set(key, path);
    }
    const natural = imageSize(res.data) ?? { width: 300, height: 200 };
    const w = width ?? natural.width;
    const h = height ?? (width ? (natural.height * width) / natural.width : natural.height);
    const n = ++this.frameCount;
    return (
      `<draw:frame draw:style-name="fr1" draw:name="Image${n}" text:anchor-type="as-char" svg:width="${pxToIn(w)}" svg:height="${pxToIn(h)}" draw:z-index="0">` +
      `<draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="${esc(res.mediaType)}"/>` +
      (title ? `<svg:title>${esc(title)}</svg:title>` : '') +
      (alt ? `<svg:desc>${esc(alt)}</svg:desc>` : '') +
      '</draw:frame>'
    );
  }

  /** Embed an equation as a MathML formula object (MATH-004). */
  private formula(latex: string, display: boolean): string {
    const mathml = this.opts.mathml?.get(latex);
    if (!mathml) return odfText(display ? `$$${latex}$$` : `$${latex}$`, false);
    const dir = `Formula${this.formulas.length + 1}`;
    this.formulas.push({
      dir,
      xml:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        `<math xmlns="${MATHML_NS}" display="${display ? 'block' : 'inline'}"><semantics><mrow>${mathml}</mrow>` +
        `<annotation encoding="application/x-tex">${esc(latex)}</annotation></semantics></math>`,
    });
    return (
      `<draw:frame draw:style-name="frMath" draw:name="${dir}" text:anchor-type="as-char" draw:z-index="0">` +
      `<draw:object xlink:href="./${dir}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
      `<svg:desc>${esc(latex)}</svg:desc></draw:frame>`
    );
  }

  /** Merged cells span with covered cells under them; the header row repeats (DOC-025). */
  private table(t: Table): string {
    const { cols, slots } = tableGrid(t.rows);
    const name = `Table${++this.tableCount}`;
    let out = `<table:table table:name="${name}" table:style-name="Table"><table:table-column table:style-name="TableColumn" table:number-columns-repeated="${cols}"/>`;
    slots.forEach((row, r) => {
      let tr = '<table:table-row>';
      for (let c = 0; c < cols; c++) {
        const slot = row[c];
        if (slot && (slot.row !== r || slot.col !== c)) {
          tr += '<table:covered-table-cell/>';
          continue;
        }
        const cell = slot?.cell;
        const spans =
          ((cell?.colSpan ?? 1) > 1 ? ` table:number-columns-spanned="${cell!.colSpan}"` : '') +
          ((cell?.rowSpan ?? 1) > 1 ? ` table:number-rows-spanned="${cell!.rowSpan}"` : '');
        const inner = (cell?.blocks ?? []).map((p) => this.paragraph(p)).join('') || '<text:p text:style-name="Standard"/>';
        tr += `<table:table-cell table:style-name="TableCell" office:value-type="string"${spans}>${inner}</table:table-cell>`;
      }
      tr += '</table:table-row>';
      out += r === 0 && t.header ? `<table:table-header-rows>${tr}</table:table-header-rows>` : tr;
    });
    return `${out}</table:table>`;
  }

}

const TABLE_STYLES =
  '<style:style style:name="Table" style:family="table"><style:table-properties style:width="6.5in" table:align="margins"/></style:style>' +
  '<style:style style:name="TableColumn" style:family="table-column"/>' +
  '<style:style style:name="TableCell" style:family="table-cell"><style:table-cell-properties fo:padding="0.04in" fo:border="0.5pt solid #000000"/></style:style>';

const heading = (n: number, size: string): string =>
  `<style:style style:name="Heading_20_${n}" style:display-name="Heading ${n}" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Standard" style:default-outline-level="${n}" style:class="text">` +
  `<style:text-properties fo:font-size="${size}" fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style>`;

/** styles.xml, with the header and footer on the master page (DOC-024). */
function stylesXml(doc: RichDocument): string {
  const page = cleanPageSetup(doc.page);
  // DOC-029: number format on the fields and the page layout, first number as an offset.
  const format = page?.numberFormat ? ODF_NUMBER_FORMAT[page.numberFormat] : undefined;
  const numFormat = format ? ` style:num-format="${format}"` : '';
  const adjust = page?.startAt !== undefined ? ` text:page-adjust="${page.startAt - 1}"` : '';
  const zoneXml = (text: string | undefined): string =>
    zoneParts(text ?? '')
      .map((p) =>
        typeof p === 'string'
          ? odfText(p, false)
          : p.field === 'page'
            ? `<text:page-number text:select-page="current"${numFormat}${adjust}>${formatPageNumber(page?.startAt ?? 1, page?.numberFormat)}</text:page-number>`
            : p.field === 'pages'
              ? '<text:page-count>1</text:page-count>'
              : p.field === 'title'
                ? `<text:title>${esc(doc.meta.title ?? '')}</text:title>`
                : `<text:date>${new Date().toISOString().slice(0, 10)}</text:date>`,
      )
      .join('');
  const part = (kind: 'header' | 'footer'): string => {
    const z = page?.[kind];
    if (!z) return '';
    const style = kind === 'header' ? 'Header' : 'Footer';
    return `<style:${kind}><text:p text:style-name="${style}">${zoneXml(z.left)}<text:tab/>${zoneXml(z.center)}<text:tab/>${zoneXml(z.right)}</text:p></style:${kind}>`;
  };
  const master =
    `<style:master-page style:name="Standard" style:page-layout-name="pm1">${part('header')}${part('footer')}</style:master-page>` +
    // A title page without header and footer, used by the first paragraph (see firstPageStyle).
    (page?.hideOnFirstPage ? '<style:master-page style:name="First_20_Page" style:display-name="First Page" style:page-layout-name="pm1" style:next-style-name="Standard"/>' : '');
  return STYLES_XML.replace('@MASTER@', master).replace('<style:page-layout-properties ', `<style:page-layout-properties${numFormat} `);
}


const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  `<office:document-styles ${ODF_XMLNS} office:version="1.3">` +
  '<office:font-face-decls><style:font-face style:name="Liberation Mono" svg:font-family="\'Liberation Mono\'" style:font-family-generic="modern" style:font-pitch="fixed"/></office:font-face-decls>' +
  '<office:styles>' +
  '<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.0835in"/><style:text-properties fo:font-size="11pt"/></style:default-style>' +
  '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>' +
  '<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-top="0.1665in" fo:margin-bottom="0.0835in" fo:keep-with-next="always"/></style:style>' +
  heading(1, '20pt') +
  heading(2, '16pt') +
  heading(3, '14pt') +
  heading(4, '12pt') +
  heading(5, '11pt') +
  heading(6, '11pt') +
  '<style:style style:name="Bibliography_20_Heading" style:display-name="Bibliography Heading" style:family="paragraph" style:parent-style-name="Heading" style:class="index"><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>' +
  '<style:style style:name="Bibliography_20_1" style:display-name="Bibliography 1" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-left="0.5in" fo:text-indent="-0.5in"/></style:style>' +
  '<style:style style:name="Caption" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-top="0.0835in" fo:margin-bottom="0.0835in"/><style:text-properties fo:font-size="10pt" fo:font-style="italic"/></style:style>' +
  '<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-left="0.3937in" fo:margin-right="0.3937in"/><style:text-properties fo:font-style="italic"/></style:style>' +
  '<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-bottom="0in"/><style:text-properties style:font-name="Liberation Mono" fo:font-size="10pt"/></style:style>' +
  '<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:border-bottom="0.0138in double #808080" fo:padding="0in"/><style:text-properties fo:font-size="6pt"/></style:style>' +
  '<style:style style:name="Contents_20_Heading" style:display-name="Contents Heading" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-top="0.17in" fo:margin-bottom="0.08in"/><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>' +
  '<style:style style:name="Contents_20_1" style:display-name="Contents 1" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-left="0.0in" fo:margin-bottom="0.04in"/></style:style>' +
  '<style:style style:name="Contents_20_2" style:display-name="Contents 2" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-left="0.2in" fo:margin-bottom="0.04in"/></style:style>' +
  '<style:style style:name="Contents_20_3" style:display-name="Contents 3" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-left="0.4in" fo:margin-bottom="0.04in"/></style:style>' +
  '<style:style style:name="Contents_20_4" style:display-name="Contents 4" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-left="0.6in" fo:margin-bottom="0.04in"/></style:style>' +
  '<style:style style:name="Contents_20_5" style:display-name="Contents 5" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-left="0.8in" fo:margin-bottom="0.04in"/></style:style>' +
  '<style:style style:name="Contents_20_6" style:display-name="Contents 6" style:family="paragraph" style:parent-style-name="Standard" style:class="index"><style:paragraph-properties fo:margin-left="1.0in" fo:margin-bottom="0.04in"/></style:style>' +
  '<style:style style:name="Header" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-bottom="0in"><style:tab-stops><style:tab-stop style:position="3.3465in" style:type="center"/><style:tab-stop style:position="6.6929in" style:type="right"/></style:tab-stops></style:paragraph-properties><style:text-properties fo:font-size="9pt"/></style:style>' +
  '<style:style style:name="Footer" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-bottom="0in"><style:tab-stops><style:tab-stop style:position="3.3465in" style:type="center"/><style:tab-stop style:position="6.6929in" style:type="right"/></style:tab-stops></style:paragraph-properties><style:text-properties fo:font-size="9pt"/></style:style>' +
  '<style:style style:name="Footnote" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-left="0.2in" fo:text-indent="-0.2in" fo:margin-bottom="0in"/><style:text-properties fo:font-size="9pt"/></style:style>' +
  '<style:style style:name="Source_20_Text" style:display-name="Source Text" style:family="text"><style:text-properties style:font-name="Liberation Mono"/></style:style>' +
  '<style:style style:name="Graphics" style:family="graphic"><style:graphic-properties text:anchor-type="as-char" style:vertical-pos="top" style:vertical-rel="baseline"/></style:style>' +
  '</office:styles>' +
  '<office:automatic-styles>' +
  '<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="8.2681in" fo:page-height="11.6929in" fo:margin-top="0.7874in" fo:margin-bottom="0.7874in" fo:margin-left="0.7874in" fo:margin-right="0.7874in"/>' +
  '<style:header-style><style:header-footer-properties fo:min-height="0in" fo:margin-bottom="0.1in"/></style:header-style>' +
  '<style:footer-style><style:header-footer-properties fo:min-height="0in" fo:margin-top="0.1in"/></style:footer-style></style:page-layout>' +
  '</office:automatic-styles>' +
  '<office:master-styles>@MASTER@</office:master-styles>' +
  '</office:document-styles>';

export function writeOdt(doc: RichDocument, opts: WriteOptions = {}): Uint8Array {
  return new OdtWriter(cellsAsBlocks(diagramsAsPictures(doc, opts.diagrams)), opts).write();
}

/** ODF bibliography types (BibTeX's, `www` for web pages). */
const ODF_BIB_TYPES = new Set(['article', 'book', 'booklet', 'conference', 'email', 'inbook', 'incollection', 'inproceedings', 'journal', 'manual', 'mastersthesis', 'misc', 'phdthesis', 'proceedings', 'techreport', 'unpublished', 'www']);

function bibliographyMark(e: BibEntry, shown: string): string {
  const type = e.type === 'online' ? 'www' : ODF_BIB_TYPES.has(e.type) ? e.type : 'misc';
  let attrs = ` text:identifier="${esc(e.key)}" text:bibliography-type="${type}"`;
  for (const f of ODF_BIB_FIELDS) {
    const v = f === 'author' || f === 'editor' ? (e.fields[f] ? writeNames(parseNames(e.fields[f])) : undefined) : e.fields[f];
    if (v) attrs += ` text:${f}="${esc(v)}"`;
  }
  if (e.fields.doi) attrs += ` text:custom1="${esc(e.fields.doi)}"`;
  return `<text:bibliography-mark${attrs}>${esc(shown)}</text:bibliography-mark>`;
}
