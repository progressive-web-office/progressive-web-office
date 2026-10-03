import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { readDocument, writeDocument } from '../src/document/io';
import { allParagraphs, isFillRun, type Block, type RichDocument } from '../src/document/model';
import { fillTabs, lengthPt, parseSpaceLine } from '../src/document/springs';
import { readZip, readZipText } from '../src/core/zip';

const SOURCE = 'Jeanne Martin \\hfill Paris, le 3 octobre\n\n\\vfill\n\nLeft \\hfill Centre \\hspace{\\stretch{2}} Right\n\n\\vspace{2cm}\n\nEnd\n\n\\vspace{\\stretch{3}}\n';
const shape = (d: RichDocument) =>
  d.blocks.map((b: Block) => (b.type === 'space' ? `space:${b.stretch ?? ''}:${b.stretch ? '' : Math.round((b.size ?? 0) * 10) / 10}` : b.type === 'paragraph' ? b.runs.map((r) => (isFillRun(r) ? `<${r.hfill}>` : 'text' in r ? r.text.trim() : '?')).join('') : b.type));

describe('DOC-042 springs and spaces', () => {
  it('reads LaTeX lengths and space commands', () => {
    expect(lengthPt('2cm')).toBeCloseTo(56.69, 1);
    expect(lengthPt('12pt')).toBe(12);
    expect(lengthPt('1in')).toBe(72);
    expect(lengthPt('two')).toBeUndefined();
    expect(parseSpaceLine('\\vfill')).toEqual({ type: 'space', stretch: 1 });
    expect(parseSpaceLine('\\vspace*{\\fill}')).toEqual({ type: 'space', stretch: 1 });
    expect(parseSpaceLine('\\vspace{\\stretch{2}}')).toEqual({ type: 'space', stretch: 2 });
    expect(parseSpaceLine('\\bigskip')).toEqual({ type: 'space', size: 12 });
    expect(parseSpaceLine('\\vfill and text')).toBeUndefined();
  });

  it('reads springs in Markdown', () => {
    expect(shape(readMarkdown(SOURCE))).toEqual(['Jeanne Martin<1>Paris, le 3 octobre', 'space:1:', 'Left<1>Centre<2>Right', 'space::56.7', 'End', 'space:3:']);
  });

  it.each(['md', 'tex', 'odt', 'docx'] as const)('keeps them in %s', async (format) => {
    const doc = readMarkdown(SOURCE);
    const back = await readDocument(format, writeDocument(doc, format));
    expect(shape(back).filter((s) => s !== 'toc')).toEqual(['Jeanne Martin<1>Paris, le 3 octobre', 'space:1:', 'Left<1>Centre<2>Right', 'space::56.7', 'End', 'space:3:']);
  });

  it('keeps the height a spring was last shown with in OpenDocument and Word', async () => {
    const doc = readMarkdown('\\vfill\n\nEnd\n');
    (doc.blocks[0] as { size?: number }).size = 300;
    for (const format of ['odt', 'docx'] as const) {
      const back = await readDocument(format, writeDocument(doc, format));
      expect(back.blocks[0]).toEqual({ type: 'space', stretch: 1, size: 300 });
    }
  });

  it('stands for horizontal springs with tab stops: the last one on the right', () => {
    const runs = readMarkdown('A \\hfill B\n').blocks.flatMap((b) => (b.type === 'paragraph' ? b.runs : []));
    expect(fillTabs(runs, 400)).toEqual([{ type: 'right', pos: 400 }]);
    const two = allParagraphs(readMarkdown('A \\hfill B \\hfill C\n').blocks)[0]!.runs;
    expect(fillTabs(two, 400)).toEqual([{ type: 'center', pos: 200 }, { type: 'right', pos: 400 }]);
    // Where the text after it was shown.
    (two.find(isFillRun) as { at?: number }).at = 120;
    expect(fillTabs(two, 400)[0]).toEqual({ type: 'left', pos: 120 });
    const odt = readZipText(readZip(writeDocument(readMarkdown('A \\hfill B\n'), 'odt')), 'content.xml')!;
    expect(odt).toMatch(/<style:tab-stop style:position="481\.\dpt" style:type="right"\/>/);
    expect(odt).toContain('<text:span text:style-name="PWO_20_Fill"><text:tab/></text:span>');
    const docx = readZipText(readZip(writeDocument(readMarkdown('A \\hfill B\n'), 'docx')), 'word/document.xml')!;
    expect(docx).toContain('<w:tabs><w:tab w:val="right" w:pos="9026"/></w:tabs>');
    expect(docx).toContain('<w:rStyle w:val="PWOFill"/></w:rPr><w:tab/>');
  });

  it('writes LaTeX springs', () => {
    const tex = new TextDecoder().decode(writeDocument(readMarkdown(SOURCE), 'tex'));
    expect(tex).toContain('Jeanne Martin \\hfill{} Paris');
    expect(tex).toContain('\n\\vfill\n');
    expect(tex).toContain('\\hspace{\\stretch{2}}{}');
    expect(tex).toContain('\\vspace{56.69pt}');
    expect(tex).toContain('\\vspace{\\stretch{3}}');
  });
});

describe('DOC-042 shares of the page and of the free space', () => {
  it('reads and writes a space of a share of the page height in every format', async () => {
    const { readMarkdown } = await import('../src/document/markdown-reader');
    const { readDocument, writeDocument } = await import('../src/document/io');
    const doc = readMarkdown('Top\n\n\\vspace{0.3\\textheight}\n\nBottom\n');
    expect(doc.blocks[1]).toEqual({ type: 'space', fraction: 0.3 });
    for (const format of ['md', 'odt', 'docx', 'tex'] as const) {
      const back = await readDocument(format, writeDocument(doc, format));
      expect(back.blocks.find((b) => b.type === 'space')).toMatchObject({ type: 'space', fraction: 0.3 });
    }
  });

  it('turns a share of the free space into a weight, and back', async () => {
    const { shareOf, weightFor } = await import('../src/document/space-dialog');
    // Another spring of weight 1: 30 % for this one is a weight of 3/7.
    expect(weightFor(30, 1)).toBeCloseTo(0.429, 3);
    expect(shareOf(0.429, 1)).toBeCloseTo(30, 0);
    expect(shareOf(2, 2)).toBe(50);
    // Alone, a spring takes everything.
    expect(shareOf(5, 0)).toBe(100);
    expect(weightFor(30, 0)).toBeUndefined();
  });
});
