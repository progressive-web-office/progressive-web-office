import { describe, expect, it } from 'vitest';
import { emptyDocument, paragraph, tableGrid, type Block, type RichDocument, type Table, type TableCell } from '../src/document/model';
import { readDocx } from '../src/document/docx-reader';
import { writeDocx } from '../src/document/docx-writer';
import { readOdt } from '../src/document/odt-reader';
import { writeOdt } from '../src/document/odt-writer';
import { readLatex } from '../src/document/latex-reader';
import { writeLatex } from '../src/document/latex-writer';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { blocksToDom, domToBlocks } from '../src/document/html';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';

const cell = (text: string, spans: Partial<Pick<TableCell, 'colSpan' | 'rowSpan'>> = {}): TableCell => ({ blocks: [paragraph(text)], ...spans });

/**
 * | Name (2 cols) |  Total  |
 * | A    | B      | 3 (2 rows) |
 * | C    | D      |
 */
const merged = (): Table => ({
  type: 'table',
  header: true,
  rows: [[cell('Name', { colSpan: 2 }), cell('Total')], [cell('A'), cell('B'), cell('3', { rowSpan: 2 })], [cell('C'), cell('D')]],
});

const docWith = (...blocks: Block[]): RichDocument => {
  const doc = emptyDocument();
  doc.blocks = blocks;
  return doc;
};

describe('DOC-025 tables: merged cells and header row', () => {
  it('places cells on the grid like HTML', () => {
    const { cols, slots } = tableGrid(merged().rows);
    expect(cols).toBe(3);
    expect(slots.map((r) => r.map((s) => (s ? `${s.row},${s.col}` : '-')))).toEqual([
      ['0,0', '0,0', '0,2'],
      ['1,0', '1,1', '1,2'],
      ['2,0', '2,1', '1,2'],
    ]);
  });

  it('round-trips through DOCX (gridSpan, vMerge, tblHeader)', () => {
    const bytes = writeDocx(docWith(merged()));
    expect(readDocx(bytes).blocks).toEqual([merged()]);
  });

  it('round-trips through ODT (spanned and covered cells, header rows)', () => {
    expect(readOdt(writeOdt(docWith(merged()))).blocks).toEqual([merged()]);
  });

  it('round-trips through HTML (colspan, rowspan, th)', () => {
    const div = document.createElement('div');
    div.append(blocksToDom([merged()], document, () => undefined));
    expect(div.querySelectorAll('th')).toHaveLength(2);
    expect(div.querySelector('th')!.colSpan).toBe(2);
    expect(domToBlocks(div, () => undefined)).toEqual([merged()]);
  });

  it('round-trips through the ProseMirror model', () => {
    expect(pmToBlocks(blocksToPm([merged()]))).toEqual([merged()]);
  });

  it('round-trips through LaTeX (\\multicolumn, \\multirow, double rule)', () => {
    const { tex } = writeLatex(docWith(merged()));
    expect(tex).toContain('\\usepackage{multirow}');
    expect(tex).toContain('\\multicolumn{2}{|l|}{Name}');
    expect(tex).toContain('\\multirow{2}{*}{3}');
    expect(tex).toContain('\\cline{1-2}');
    expect(readLatex(tex).blocks).toEqual([merged()]);
  });

  it('flattens merged cells in Markdown, which has none', () => {
    const md = writeMarkdown(docWith(merged()));
    expect(md).toContain('| Name |   | Total |');
    expect(md).toContain('| C | D |   |');
    const back = readMarkdown(md).blocks[0] as Table;
    expect(back.header).toBe(true);
    expect(back.rows.map((r) => r.length)).toEqual([3, 3, 3]);
  });

  it('reads a booktabs table header', () => {
    const tex = '\\begin{tabular}{ll}\n\\toprule\na & b \\\\\n\\midrule\n1 & 2 \\\\\n\\bottomrule\n\\end{tabular}';
    const t = readLatex(tex).blocks.find((b) => b.type === 'table') as Table;
    expect(t.header).toBe(true);
    expect(t.rows).toHaveLength(2);
  });
});
