/**
 * KaimonSlate notebooks (DOC-038): a Julia file of cells, each starting with
 * a `#%% kind attributes` line — `md` cells hold Markdown, `code` cells Julia
 * (and `web`, `tool` cells their own source). Text cells become paragraphs,
 * code cells Julia code cells; each cell keeps its header (id, tags) and an
 * unchanged text cell its Markdown as written, so that saving gives the file
 * back. The cells run in KaimonSlate itself (`slate notebook.jl`).
 */
import { readMarkdown } from './markdown-reader';
import { writeMarkdown } from './markdown-writer';
import { emptyDocument, isCodeCellRun, paragraph, type Block, type Paragraph, type RichDocument } from './model';

const HEADER = /^#%%[ \t]*(.*)$/;

/** Whether a text is a KaimonSlate notebook: its first line that is not blank is a cell header. */
export function isKaimonSlate(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim());
  return !!first && HEADER.test(first);
}

interface Cell {
  header: string;
  body: string;
}

function cellsOf(text: string): { preamble: string; cells: Cell[] } {
  const cells: Cell[] = [];
  const pre: string[] = [];
  let cur: { header: string; lines: string[] } | undefined;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = HEADER.exec(line);
    if (m) {
      if (cur) cells.push({ header: cur.header, body: cur.lines.join('\n') });
      cur = { header: m[1]!.trim(), lines: [] };
    } else (cur ? cur.lines : pre).push(line);
  }
  if (cur) cells.push({ header: cur.header, body: cur.lines.join('\n') });
  const trim = (s: string): string => s.replace(/^\n+|\s+$/g, '');
  return { preamble: trim(pre.join('\n')), cells: cells.map((c) => ({ header: c.header, body: trim(c.body) })) };
}

const kindOf = (header: string): string => header.split(/\s+/)[0]!.toLowerCase();

/** Markdown blocks of a text cell, written back the same way, to tell whether it changed. */
const canonical = (blocks: Block[]): string => writeMarkdown({ ...emptyDocument(), blocks }, { frontMatter: false }).trim();

export function readKaimonSlate(text: string): RichDocument {
  const doc = emptyDocument();
  const { preamble, cells } = cellsOf(text);
  const blocks: Block[] = [];
  if (preamble) blocks.push({ type: 'paragraph', style: 'normal', runs: [{ cell: preamble, lang: 'julia', header: '' }] });
  for (const c of cells) {
    if (kindOf(c.header) === 'md') {
      const md = readMarkdown(c.body, { frontMatter: false } as never).blocks;
      const parts: Block[] = md.length && md[0]!.type === 'paragraph' ? md : [paragraph(''), ...md];
      const first = parts[0] as Paragraph;
      parts[0] = { ...first, cellHeader: c.header, cellSource: c.body };
      blocks.push(...parts);
    } else {
      blocks.push({ type: 'paragraph', style: 'normal', runs: [{ cell: c.body, lang: 'julia', header: c.header || 'code' }] });
    }
  }
  doc.blocks = blocks.length ? blocks : [paragraph('')];
  const title = blocks.find((b): b is Paragraph => b.type === 'paragraph' && b.style === 'h1');
  if (title) doc.meta.title = title.runs.map((r) => ('text' in r ? r.text : '')).join('');
  return doc;
}

/** A paragraph holding only a Julia code cell (or another KaimonSlate code-like cell). */
const codeCellOf = (b: Block) => (b.type === 'paragraph' && b.runs.length === 1 && isCodeCellRun(b.runs[0]!) && b.runs[0].lang === 'julia' ? b.runs[0] : undefined);

export function writeKaimonSlate(doc: RichDocument): string {
  const out: string[] = [];
  let md: Block[] = [];
  let mdHeader = 'md';
  let mdSource: string | undefined;
  const flush = (): void => {
    const text = canonical(md);
    // An unchanged text cell keeps its Markdown as written.
    const body = mdSource !== undefined && canonical(readMarkdown(mdSource).blocks) === text ? mdSource : text;
    if (md.length && (body || mdSource !== undefined)) out.push(`#%% ${mdHeader}\n${body}`);
    md = [];
    mdHeader = 'md';
    mdSource = undefined;
  };
  for (const b of doc.blocks) {
    const cell = codeCellOf(b);
    if (cell) {
      flush();
      out.push(cell.header === '' && !out.length ? cell.cell : `#%% ${cell.header ?? 'code'}\n${cell.cell}`);
      continue;
    }
    if (b.type === 'paragraph' && b.cellHeader !== undefined) {
      flush();
      mdHeader = b.cellHeader;
      mdSource = b.cellSource;
      const { cellHeader: _h, cellSource: _s, ...rest } = b;
      md.push(rest);
      continue;
    }
    md.push(b);
  }
  flush();
  return `${out.join('\n\n')}\n`;
}
