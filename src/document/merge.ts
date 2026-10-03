/**
 * Mail merge (DOC-036): a document with `{{Field}}` placeholders combined with
 * a table (CSV, TSV, a workbook's first sheet) whose first row names the
 * fields gives one document per row, or one document with a page per row.
 */
import { parseKey } from '../sheet/address';
import { formatValue, isDateFormat } from '../sheet/number-format';
import { formatGeneral } from '../sheet/engine';
import type { Workbook } from '../sheet/model';
import { substitute } from '../teach/variants';
import { allParagraphs, isTextRun, PAGE_BREAK, type Block, type RichDocument } from './model';

const TOKEN = /\{\{\s*([^{}=]+?)\s*\}\}/g;

/** The fields a document uses (`{{Name}}`), in order, each once. */
export function mergeFields(doc: RichDocument): string[] {
  const out: string[] = [];
  for (const p of allParagraphs(doc.blocks)) {
    const text = p.runs.map((r) => (isTextRun(r) ? r.text : '')).join('');
    for (const m of text.matchAll(TOKEN)) if (!out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

export interface MergeTable {
  fields: string[];
  rows: Record<string, string>[];
}

/** The rows of the first sheet, named by its first row; empty rows left out. */
export function mergeTable(wb: Workbook): MergeTable {
  const sheet = wb.sheets[0];
  if (!sheet) return { fields: [], rows: [] };
  const grid: string[][] = [];
  for (const [key, cell] of sheet.cells) {
    const [r, c] = parseKey(key);
    const v = cell.value;
    const text = v === null || v === undefined ? '' : typeof v === 'number' ? (isDateFormat(cell.numFmt) ? formatValue(v, cell.numFmt) : formatGeneral(v)) : String(v);
    (grid[r] ??= [])[c] = text;
  }
  const head = grid[0] ?? [];
  const fields = Array.from(head, (h) => (h ?? '').trim());
  const rows: Record<string, string>[] = [];
  for (const row of grid.slice(1)) {
    if (!row || !row.some((x) => x?.trim())) continue;
    rows.push(Object.fromEntries(fields.flatMap((f, i) => (f ? [[f, row[i] ?? '']] : []))));
  }
  return { fields: fields.filter(Boolean), rows };
}

/**
 * The document filled with a row. A field split across differently formatted
 * pieces of text is first joined into the first piece.
 */
export function mergeOne(doc: RichDocument, row: Record<string, string>): RichDocument {
  const copy: RichDocument = { ...doc, blocks: structuredClone(doc.blocks) };
  for (const p of allParagraphs(copy.blocks)) {
    for (let i = 0; i < p.runs.length; i++) {
      const run = p.runs[i]!;
      if (!isTextRun(run)) continue;
      // An opening `{{` without its `}}` in this piece: take the next pieces in.
      for (let next = p.runs[i + 1]; /\{\{[^}]*$/.test(run.text) && next && isTextRun(next); next = p.runs[i + 1]) {
        run.text += next.text;
        p.runs.splice(i + 1, 1);
      }
    }
  }
  return substitute(copy, row);
}

/** One document with every row, a page each. */
export function mergeAll(doc: RichDocument, rows: Record<string, string>[]): RichDocument {
  const blocks: Block[] = [];
  rows.forEach((row, i) => {
    if (i) blocks.push({ ...PAGE_BREAK });
    blocks.push(...mergeOne(doc, row).blocks);
  });
  return { ...doc, blocks };
}

/** File names for the rows: the value of `field` (or the row number), safe and unique. */
export function mergeNames(rows: Record<string, string>[], field: string | undefined, stem: string): string[] {
  const seen = new Map<string, number>();
  const width = String(rows.length).length;
  return rows.map((row, i) => {
    const base = ((field && row[field]?.trim()) || `${stem}-${String(i + 1).padStart(width, '0')}`).replace(/[\\/:*?"<>|]+/g, '-').trim();
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), n);
    return n > 1 ? `${base} (${n})` : base;
  });
}
