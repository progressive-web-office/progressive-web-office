import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { readDocument, writeDocument } from '../src/document/io';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { blocksToDom, domToBlocks } from '../src/document/html';
import { cleanColumns, columnSegments, paragraphText, type Block, type RichDocument } from '../src/document/model';

const SOURCE = [
  '# The Daily Planet',
  '',
  '::: {.columns count=3 gap=18 rule}',
  'First story.',
  '',
  'Second paragraph.',
  '',
  '\\columnbreak',
  '',
  'Next column.',
  ':::',
  '',
  'Back to one column.',
  '',
].join('\n');

/** The text and column count of each block; `|` for a column break. */
const shape = (blocks: Block[]) =>
  blocks.map((b) => (b.type === 'rule' && b.column ? `|${b.columns?.count ?? 1}` : b.type === 'paragraph' ? `${paragraphText(b)}:${b.columns?.count ?? 1}` : b.type));
const layout = (d: RichDocument) => columnSegments(d.blocks).map((s) => s.columns ?? null);

describe('DOC-049 text in columns', () => {
  it('cleans layouts and groups consecutive blocks', () => {
    expect(cleanColumns({ count: 1 })).toBeUndefined();
    expect(cleanColumns({ count: 9, gap: 12 })).toEqual({ count: 6 });
    const segs = columnSegments([
      { type: 'paragraph', style: 'normal', runs: [] },
      { type: 'paragraph', style: 'normal', runs: [], columns: { count: 2 } },
      { type: 'rule', columns: { count: 2, gap: 12 } },
      { type: 'paragraph', style: 'normal', runs: [], columns: { count: 3 } },
    ]);
    expect(segs.map((s) => [s.columns?.count ?? 1, s.blocks.length])).toEqual([[1, 1], [2, 2], [3, 1]]);
  });

  it('reads and writes Markdown fenced divs', () => {
    const doc = readMarkdown(SOURCE);
    expect(shape(doc.blocks)).toEqual(['The Daily Planet:1', 'First story.:3', 'Second paragraph.:3', '|3', 'Next column.:3', 'Back to one column.:1']);
    expect(layout(doc)).toEqual([null, { count: 3, gap: 18, rule: true }, null]);
    const md = writeMarkdown(doc);
    expect(md).toContain('::: {.columns count=3 gap=18 rule}\n\nFirst story.');
    expect(md).toContain('\\columnbreak');
    expect(shape(readMarkdown(md).blocks)).toEqual(shape(doc.blocks));
  });

  it('survives the editor', () => {
    const doc = readMarkdown(SOURCE);
    const pm = blocksToPm(doc.blocks);
    expect(pm.child(1).type.name).toBe('columns');
    expect(pmToBlocks(pm)).toEqual(doc.blocks);
  });

  it('renders CSS columns in HTML and reads them back', () => {
    const doc = readMarkdown(SOURCE);
    const div = document.createElement('div');
    div.append(blocksToDom(doc.blocks, document, () => undefined));
    const cols = div.querySelector<HTMLElement>('div.columns')!;
    expect(cols.style.columnCount).toBe('3');
    expect(cols.querySelector('hr.column-break')).not.toBeNull();
    expect(shape(domToBlocks(div, () => undefined))).toEqual(shape(doc.blocks));
  });

  it.each(['odt', 'docx', 'tex'] as const)('keeps them in %s', async (format) => {
    const back = await readDocument(format, writeDocument(readMarkdown(SOURCE), format));
    expect(shape(back.blocks).filter((s) => s !== 'bibliography')).toEqual(['The Daily Planet:1', 'First story.:3', 'Second paragraph.:3', '|3', 'Next column.:3', 'Back to one column.:1']);
    expect(layout(back)).toEqual([null, { count: 3, gap: 18, rule: true }, null]);
  });

  it('writes multicols in LaTeX', () => {
    const tex = new TextDecoder().decode(writeDocument(readMarkdown(SOURCE), 'tex'));
    expect(tex).toContain('\\usepackage{multicol}');
    expect(tex).toMatch(/\\begin\{multicols\}\{3\}[\s\S]*\\columnbreak[\s\S]*\\end\{multicols\}/);
  });
});
