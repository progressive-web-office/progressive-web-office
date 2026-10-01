/** LaTeX export (TEX-001, TEX-002): a compilable `article`. */
import {
  cleanMeta,
  extensionForType,
  groupBlocks,
  isImageRun,
  isMathRun,
  nestLists,
  splitListSegments,
  type Block,
  type ListNode,
  type Paragraph,
  type DocumentMeta,
  type RichDocument,
  type Run,
  type TableCell,
} from './model';

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

  constructor(private readonly doc: RichDocument) {}

  write(): string {
    const body = this.blocks(this.doc.blocks);
    const cjk = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(body);
    const meta = this.doc.meta;
    return [
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
      '\\usepackage{amsmath,amssymb}',
      '\\usepackage{graphicx}',
      '\\usepackage[normalem]{ulem}',
      '\\usepackage{hyperref}',
      ...(meta.title ? [`\\title{${escapeLatex(meta.title)}}`] : []),
      ...(meta.author ? [`\\author{${escapeLatex(meta.author)}}`] : []),
      ...(meta.title || meta.date ? [`\\date{${meta.date ? escapeLatex(meta.date) : ''}}`] : []),
      ...pdfMetadata(meta),
      '',
      '\\begin{document}',
      ...(meta.title ? ['\\maketitle', ''] : []),
      body.trimEnd(),
      '',
      '\\end{document}',
      '',
    ].join('\n');
  }

  private blocks(blocks: Block[]): string {
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
        out.push(this.table(group.rows));
      } else if (group.type === 'rule') {
        out.push('\\noindent\\rule{\\linewidth}{0.4pt}');
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
    const heading = HEADINGS[p.style];
    if (heading) return `\\${heading}{${this.inline(p.runs).replace(/\\\\\n?/g, ' ')}}`;
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

  private table(rows: TableCell[][]): string {
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const cell = (c: TableCell | undefined): string => (c?.blocks ?? []).map((p) => this.inline(p.runs).replace(/\\\\\n?/g, ' ')).join(' ');
    const body = rows.map((r) => `  ${Array.from({ length: cols }, (_, i) => cell(r[i])).join(' & ')} \\\\ \\hline`).join('\n');
    return `\\begin{tabular}{|${'l|'.repeat(cols)}}\n  \\hline\n${body}\n\\end{tabular}`;
  }

  private inline(runs: Run[]): string {
    let out = '';
    for (const run of runs) {
      if (isMathRun(run)) {
        out += run.display ? `\\[${run.math}\\]` : `$${run.math}$`;
        continue;
      }
      if (isImageRun(run)) {
        out += this.image(run.image, run.width, run.src);
        continue;
      }
      let text = run.text
        .split('\n')
        .map((part) => escapeLatex(part).replace(/\t/g, '\\quad '))
        .join('\\\\\n');
      if (!text) continue;
      if (run.code) text = `\\texttt{${text}}`;
      if (run.strike) text = `\\sout{${text}}`;
      if (run.underline) text = `\\uline{${text}}`;
      if (run.italic) text = `\\textit{${text}}`;
      if (run.bold) text = `\\textbf{${text}}`;
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

export function writeLatex(doc: RichDocument): LatexOutput {
  const writer = new LatexWriter(doc);
  const tex = writer.write();
  return { tex, images: writer.images };
}
