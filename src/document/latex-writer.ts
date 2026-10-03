/** LaTeX export (TEX-001, TEX-002): a compilable `article`. */
import { geometryOptions } from './geometry';
import { inputLatex } from './inputs';
import { fillText, spaceText } from './springs';
import { multicols } from './columns';
import { latexHtmlColor } from '../color/convert';
import {
  columnSegments,
  cleanMeta,
  extensionForType,
  groupBlocks,
  isCodeCellRun,
  isDiagramRun,
  isImageRun,
  isMathRun,
  isFootnoteRun,
  cleanPageSetup,
  zoneParts,
  nestLists,
  splitListSegments,
  type Block,
  type ListNode,
  type Paragraph,
  type DocumentMeta,
  type RichDocument,
  type Run,
  type Table,
  type TableCell,
  type SeqRun,
  type MathRun,
  type WriteOptions,
  tableGrid,
  crossTargets,
  isSeqRun,
  isFieldRun,
  isInputRun,
  isFillRun,
  fieldValue,
  isRefRun,
  isCiteRun,
  seqText,
} from './model';
import { writeBibtex } from './bibliography';
import { cellsAsBlocks } from './code-cells';
import { diagramLangOf, diagramsAsPictures } from './diagram';

const SPECIAL: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

export function escapeLatex(text: string): string {
  return text.replace(/[\\&%$#_{}~^]/g, (c) => SPECIAL[c]!);
}

/** URLs in \href/\url: only %, # and \ need escaping. */
const escapeUrl = (url: string): string => url.replace(/[\\%#]/g, (c) => `\\${c}`);

const HEADINGS: Record<string, string> = { h1: 'section', h2: 'subsection', h3: 'subsubsection', h4: 'paragraph', h5: 'subparagraph', h6: 'subparagraph' };

export interface LatexOutput {
  tex: string;
  /** Image files referenced by the document (path -> bytes). */
  images: Map<string, Uint8Array>;
}

class LatexWriter {
  readonly images = new Map<string, Uint8Array>();
  private imagePaths = new Map<string, string>();
  private multirow = false;
  private captions = false;
  /** Citations by author and year use natbib (DOC-027). */
  private readonly authorYear: boolean;
  /** Cross-reference targets and numbers (DOC-026). */
  private xref: ReturnType<typeof crossTargets> = { targets: new Map(), numbers: new Map() };

  constructor(private readonly doc: RichDocument) {
    this.authorYear = doc.references?.style === 'author-year';
  }

  /** Header and footer with fancyhdr (DOC-024). */
  /** Packages the fields of the body need (DOC-041). */
  private readonly fieldPackages = new Set<string>();

  private furniture(): string[] {
    const page = cleanPageSetup(this.doc.page);
    if (!page) return [];
    const zone = (text: string): string =>
      zoneParts(text)
        // `{}` keeps the space after a command word.
        .map((p) => (typeof p === 'string' ? escapeLatex(p) : p.field === 'page' ? '\\thepage{}' : p.field === 'pages' ? '\\pageref*{LastPage}' : p.field === 'title' ? '\\thetitle{}' : '\\today{}'))
        .join('');
    const all = JSON.stringify(page);
    const lines = ['\\usepackage{fancyhdr}', ...(all.includes('{pages}') ? ['\\usepackage{lastpage}'] : []), ...(all.includes('{title}') ? ['\\usepackage{titling}'] : []), '\\pagestyle{fancy}', '\\fancyhf{}', '\\renewcommand{\\headrulewidth}{0pt}'];
    const pos = { left: 'L', center: 'C', right: 'R' } as const;
    for (const kind of ['header', 'footer'] as const) {
      for (const k of ['left', 'center', 'right'] as const) {
        const text = page[kind]?.[k];
        if (text) lines.push(`\\fancy${kind === 'header' ? 'head' : 'foot'}[${pos[k]}]{${zone(text)}}`);
      }
    }
    return lines;
  }

  /** DOC-029: page number style, first number and title page, at the start of the body. */
  private numbering(): string[] {
    const page = cleanPageSetup(this.doc.page);
    if (!page) return [];
    const style = { decimal: '', 'lower-roman': 'roman', 'upper-roman': 'Roman', 'lower-alpha': 'alph', 'upper-alpha': 'Alph' }[page.numberFormat ?? 'decimal'];
    return [
      ...(page.hideOnFirstPage ? ['\\thispagestyle{empty}'] : []),
      ...(style ? [`\\pagenumbering{${style}}`] : []),
      ...(page.startAt !== undefined ? [`\\setcounter{page}{${page.startAt}}`] : []),
    ];
  }

  write(): string {
    this.xref = crossTargets(this.doc.blocks);
    const body = this.blocks(this.doc.blocks);
    const cjk = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(body);
    const meta = this.doc.meta;
    // DOC-027: the sources travel inside the .tex file, so that it compiles on its own.
    const entries = this.doc.references?.entries ?? [];
    const bib = entries.length ? [`\\begin{filecontents*}[overwrite]{references.bib}\n${writeBibtex(entries).trimEnd()}\n\\end{filecontents*}`] : [];
    return [
      ...bib,
      '\\documentclass{article}',
      '\\usepackage{iftex}',
      '\\ifPDFTeX',
      '  \\usepackage[utf8]{inputenc}',
      '  \\usepackage[T1]{fontenc}',
      '  \\usepackage{lmodern}',
      '\\else',
      '  \\usepackage{fontspec}',
      ...(cjk ? ['  \\usepackage{xeCJK} % Chinese/Japanese/Korean text: compile with XeLaTeX'] : []),
      '\\fi',
      // DOC-046: the paper and its margins.
      ...(this.doc.page?.geometry ? [`\\usepackage[${geometryOptions(this.doc.page.geometry)}]{geometry}`] : []),
      '\\usepackage{amsmath,amssymb}',
      ...(this.xcolor ? ['\\usepackage{xcolor}'] : []),
      '\\usepackage{graphicx}',
      '\\usepackage[normalem]{ulem}',
      '\\usepackage{hyperref}',
      ...(this.multirow ? ['\\usepackage{multirow}'] : []),
      ...(this.multicol ? ['\\usepackage{multicol}'] : []),
      ...(this.captions ? ['\\usepackage{caption}'] : []),
      ...[...this.fieldPackages].filter((p) => !this.furniture().some((l) => l.includes(`{${p}}`))).map((p) => `\\usepackage{${p}}`),
      ...(this.authorYear && JSON.stringify(this.doc.blocks).includes('"cite"') ? ['\\usepackage{natbib}'] : []),
      ...this.furniture(),
      ...(meta.title ? [`\\title{${escapeLatex(meta.title)}}`] : []),
      ...(meta.author ? [`\\author{${escapeLatex(meta.author)}}`] : []),
      ...(meta.title || meta.date ? [`\\date{${meta.date ? escapeLatex(meta.date) : ''}}`] : []),
      ...pdfMetadata(meta),
      '',
      '\\begin{document}',
      ...(meta.title ? ['\\maketitle'] : []),
      ...this.numbering(),
      ...(meta.title ? [''] : []),
      body.trimEnd(),
      '',
      '\\end{document}',
      '',
    ].join('\n');
  }

  private multicol = false;
  private xcolor = false;

  /** DOC-049: text in columns in multicols environments. */
  private blocks(blocks: Block[]): string {
    return columnSegments(blocks)
      .map((s) => {
        if (!s.columns) return this.plainBlocks(s.blocks);
        this.multicol = true;
        const env = multicols(s.columns);
        return `${env.open}\n${this.plainBlocks(s.blocks).trimEnd()}\n${env.close}\n`;
      })
      .join('\n');
  }

  private plainBlocks(blocks: Block[]): string {
    const out: string[] = [];
    let quote: string[] = [];
    const flushQuote = (): void => {
      if (quote.length) out.push(`\\begin{quote}\n${quote.join('\n\n')}\n\\end{quote}`);
      quote = [];
    };
    for (const group of groupBlocks(blocks)) {
      if (!(group.type === 'paragraph' && group.style === 'quote')) flushQuote();
      if (group.type === 'list') {
        for (const seg of splitListSegments(group.items)) for (const list of nestLists(seg)) out.push(this.list(list, ''));
      } else if (group.type === 'table') {
        out.push(this.table(group));
      } else if (group.type === 'toc') {
        out.push('\\tableofcontents');
      } else if (group.type === 'bibliography') {
        // DOC-027: BibTeX builds the list from references.bib.
        if (this.doc.references?.entries.length) out.push(`\\bibliographystyle{${this.authorYear ? 'plainnat' : 'plain'}}\n\\bibliography{references}`);
      } else if (group.type === 'space') {
        // DOC-042: LaTeX's own springs and spaces.
        out.push(spaceText(group));
      } else if (group.type === 'include') {
        // DOC-028: a .tex chapter is included; other sub-documents are assembled on export.
        const name = group.src.replace(/\.tex$/i, '');
        out.push(/\.tex$/i.test(group.src) ? `\\include{${name}}` : `% ${escapeLatex(group.src)}\n\\input{${name.replace(/\.[^./]+$/, '')}}`);
      } else if (group.type === 'rule') {
        out.push(group.page ? '\\newpage' : group.column ? '\\columnbreak' : '\\noindent\\rule{\\linewidth}{0.4pt}');
      } else if (group.style === 'quote') {
        quote.push(this.inline(group.runs));
      } else {
        out.push(this.paragraph(group));
      }
    }
    flushQuote();
    return out.filter(Boolean).join('\n\n') + '\n';
  }

  private paragraph(p: Paragraph): string {
    if (p.style === 'code') {
      const text = p.runs.map((r) => ('text' in r ? r.text : '')).join('');
      return `\\begin{verbatim}\n${text}\n\\end{verbatim}`;
    }
    // DOC-026: anchors become \label, numbered paragraphs captions and equations.
    const label = p.id && this.xref.targets.has(p.id) ? `\\label{${p.id}}` : '';
    const heading = HEADINGS[p.style];
    if (heading) return `\\${heading}{${this.inline(p.runs).replace(/\\\\\n?/g, ' ')}}${label}`;
    const seqAt = p.runs.findIndex(isSeqRun);
    const seq = seqAt >= 0 ? (p.runs[seqAt] as SeqRun) : undefined;
    const maths = p.runs.filter((r) => isMathRun(r) && r.display);
    if (seq?.seq === 'equation' && maths.length === 1 && p.runs.every((r) => r === seq || r === maths[0] || ('text' in r && !r.text.trim()))) {
      return `\\begin{equation}\n${(maths[0] as MathRun).math}${label ? `\n${label}` : ''}\n\\end{equation}`;
    }
    if (seq && seq.seq !== 'equation') {
      this.captions = true;
      const rest = p.runs.slice(seqAt + 1);
      const first = rest[0];
      if (first && 'text' in first) rest[0] = { ...first, text: first.text.replace(/^\s*[:.\u2013\u2014-]\s*/, '') };
      return `\\captionof{${seq.seq}}{${this.inline(rest).replace(/\\\\\n?/g, ' ')}}${label}`;
    }
    const only = p.runs.length === 1 ? p.runs[0] : undefined;
    if (only && isMathRun(only) && only.display) return `\\[${only.math}\\]`;
    const text = this.inline(p.runs);
    if (p.align === 'center') return `\\begin{center}\n${text}\n\\end{center}`;
    if (p.align === 'right') return `\\begin{flushright}\n${text}\n\\end{flushright}`;
    return text || '\\mbox{}';
  }

  private list(list: ListNode, indent: string): string {
    const env = list.ordered ? 'enumerate' : 'itemize';
    const lines = [`${indent}\\begin{${env}}`];
    for (const item of list.items) {
      lines.push(`${indent}  \\item ${item.paragraph ? this.inline(item.paragraph.runs) : ''}`.trimEnd());
      for (const child of item.children) lines.push(this.list(child, `${indent}  `));
    }
    lines.push(`${indent}\\end{${env}}`);
    return lines.join('\n');
  }

  /** Merged cells with \multicolumn / \multirow; a double rule under the header row (DOC-025). */
  private table(t: Table): string {
    const { cols, slots } = tableGrid(t.rows);
    const text = (c: TableCell): string => c.blocks.map((p) => this.inline(p.runs).replace(/\\\\\n?/g, ' ')).join(' ');
    const lines = slots.map((row, r) => {
      const cells: string[] = [];
      for (let c = 0; c < cols; ) {
        const slot = row[c];
        const span = slot ? Math.max(1, slot.cell.colSpan ?? 1) : 1;
        let body = slot && slot.row === r ? text(slot.cell) : '';
        if (slot && slot.row === r && (slot.cell.rowSpan ?? 1) > 1) body = `\\multirow{${slot.cell.rowSpan}}{*}{${body}}`;
        if (span > 1) body = `\\multicolumn{${span}}{${c === 0 ? '|' : ''}l|}{${body}}`;
        cells.push(body);
        c += span;
      }
      // Rules stop under cells merged with the next row.
      const open = Array.from({ length: cols }, (_, c) => {
        const s = row[c];
        return !!s && s.row + (s.cell.rowSpan ?? 1) - 1 > r;
      });
      let rule = '\\hline';
      if (open.some(Boolean)) {
        const parts: string[] = [];
        for (let c = 0; c < cols; c++) {
          if (open[c]) continue;
          let e = c;
          while (e + 1 < cols && !open[e + 1]) e++;
          parts.push(`\\cline{${c + 1}-${e + 1}}`);
          c = e;
        }
        rule = parts.join('');
      }
      if (r === 0 && t.header && !open.some(Boolean)) rule = '\\hline\\hline';
      return `  ${cells.join(' & ')} \\\\ ${rule}`;
    });
    if (slots.some((row) => row.some((s) => (s?.cell.rowSpan ?? 1) > 1))) this.multirow = true;
    return `\\begin{tabular}{|${'l|'.repeat(cols)}}\n  \\hline\n${lines.join('\n')}\n\\end{tabular}`;
  }


  private inline(runs: Run[]): string {
    let out = '';
    for (const run of runs) {
      if (isMathRun(run)) {
        out += run.display ? `\\[${run.math}\\]` : `$${run.math}$`;
        continue;
      }
      if (isImageRun(run)) {
        const lang = diagramLangOf(run.title);
        // Keep the diagram source next to its picture (DIAG-006).
        if (lang && run.alt) out += `% ${lang}\n${run.alt.split('\n').map((l) => `% ${l}`.trimEnd()).join('\n')}\n`;
        out += this.image(run.image, run.width, run.src);
        continue;
      }
      if (isDiagramRun(run) || isCodeCellRun(run)) continue; // replaced by diagramsAsPictures / cellsAsBlocks
      if (isSeqRun(run)) {
        out += seqText(run.seq, this.xref.numbers.get(run) ?? 1);
        continue;
      }
      if (isFillRun(run)) {
        out += `${fillText(run)}{}`;
        continue;
      }
      if (isInputRun(run)) {
        if (run.input === 'checkbox') this.fieldPackages.add('amssymb');
        out += inputLatex(run, escapeLatex);
        continue;
      }
      if (isFieldRun(run)) {
        // DOC-041: what LaTeX computes itself; `{}` keeps the space after a command word.
        const field = run.field;
        if (field === 'pages') this.fieldPackages.add('lastpage');
        if (field === 'title' || field === 'author') this.fieldPackages.add('titling');
        out +=
          field === 'date' ? '\\today{}' : field === 'page' ? '\\thepage{}' : field === 'pages' ? '\\pageref*{LastPage}' : field === 'title' ? '\\thetitle{}' : field === 'author' ? '\\theauthor{}' : field === 'filename' ? '\\jobname{}' : escapeLatex(fieldValue(field, { meta: this.doc.meta }));
        continue;
      }
      if (isCiteRun(run)) {
        out += `\\${this.authorYear ? 'citep' : 'cite'}${run.locator ? `[${escapeLatex(run.locator)}]` : ''}{${run.cite.join(',')}}`;
        continue;
      }
      if (isRefRun(run)) {
        const target = this.xref.targets.get(run.ref);
        if (!target) out += '??';
        else if (target.kind === 'equation') out += `\\eqref{${run.ref}}`;
        else if (target.kind === 'heading') out += `\\nameref{${run.ref}}`;
        else {
          // "Figure 3" → "Figure~\ref{…}": the label's word, then the number.
          const word = target.label.replace(/[\s\u00a0]*\d+$/, '');
          out += `${word ? `${escapeLatex(word)}~` : ''}\\ref{${run.ref}}`;
        }
        continue;
      }
      if (isFootnoteRun(run)) {
        // DOC-022; a blank line inside \footnote starts a new paragraph of the note.
        out += `\\footnote{${this.inline(run.footnote.filter((r) => !isImageRun(r) && !isFootnoteRun(r))).replace(/\\\\\n\\\\\n/g, '\n\n')}}`;
        continue;
      }
      let text = run.text
        .split('\n')
        .map((part) => escapeLatex(part).replace(/\t/g, '\\quad '))
        .join('\\\\\n');
      if (!text) continue;
      if (run.code) text = `\\texttt{${text}}`;
      if (run.strike) text = `\\sout{${text}}`;
      if (run.smallCaps) text = `\\textsc{${text}}`;
      if (run.underline) text = `\\uline{${text}}`;
      if (run.italic) text = `\\textit{${text}}`;
      if (run.bold) text = `\\textbf{${text}}`;
      // COLOR-001: colours with xcolor.
      if (run.color) {
        this.xcolor = true;
        text = `\\textcolor${latexHtmlColor(run.color)}{${text}}`;
      }
      if (run.highlight) {
        this.xcolor = true;
        text = `\\colorbox${latexHtmlColor(run.highlight)}{${text}}`;
      }
      if (run.link) text = `\\href{${escapeUrl(run.link)}}{${text}}`;
      out += text;
    }
    return out;
  }

  private image(key: string, width?: number, src?: string): string {
    const res = this.doc.resources.get(key);
    let path = this.imagePaths.get(key);
    if (res && !path) {
      path = `images/${key}.${extensionForType(res.mediaType)}`;
      this.imagePaths.set(key, path);
      this.images.set(path, res.data);
    }
    const target = path ?? src;
    if (!target) return '';
    const fraction = Math.min(1, Math.max(0.05, (width ?? 600) / 600));
    return `\\includegraphics[width=${+fraction.toFixed(3)}\\linewidth]{${target}}`;
  }
}

/** PDF document properties through hyperref (DOC-017). */
function pdfMetadata(meta: DocumentMeta): string[] {
  const m = cleanMeta(meta);
  const entries: [string, string | undefined][] = [
    ['pdftitle', m.title],
    ['pdfauthor', m.author],
    ['pdfsubject', m.subject],
    ['pdfkeywords', m.keywords?.join(', ')],
    ['pdflang', m.language],
  ];
  const set = entries.filter((e): e is [string, string] => !!e[1]).map(([k, v]) => `  ${k}={${escapeLatex(v)}}`);
  return set.length ? ['\\hypersetup{', set.join(',\n'), '}'] : [];
}

export function writeLatex(doc: RichDocument, opts: WriteOptions = {}): LatexOutput {
  const writer = new LatexWriter(cellsAsBlocks(diagramsAsPictures(doc, opts.diagrams)));
  const tex = writer.write();
  // DOC-027: the sources, next to main.tex.
  if (doc.references?.entries.length) writer.images.set('references.bib', new TextEncoder().encode(writeBibtex(doc.references.entries)));
  return { tex, images: writer.images };
}
