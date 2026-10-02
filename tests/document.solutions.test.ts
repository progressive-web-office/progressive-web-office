import { describe, expect, it } from 'vitest';
import { readDocx } from '../src/document/docx-reader';
import { writeDocx } from '../src/document/docx-writer';
import { readOdt } from '../src/document/odt-reader';
import { writeOdt } from '../src/document/odt-writer';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { withoutSolutions } from '../src/document/solutions';
import type { Block, RichDocument } from '../src/document/model';
import { readZip, readZipText } from '../src/core/zip';

const sheet = (): RichDocument => ({
  blocks: [
    { type: 'paragraph', style: 'h2', runs: [{ text: 'Exercise 1' }] },
    { type: 'paragraph', style: 'normal', runs: [{ text: 'Compute 2 + 3.' }] },
    { type: 'paragraph', style: 'normal', runs: [{ text: '2 + 3 = 5' }], solution: true },
    { type: 'paragraph', style: 'normal', list: { ordered: true, level: 0 }, runs: [{ text: 'Add the units.' }], solution: true },
    { type: 'paragraph', style: 'normal', runs: [{ text: 'Next exercise.' }] },
  ],
  resources: new Map(),
  meta: {},
});
const shape = (blocks: Block[]): unknown => blocks.map((b) => (b.type === 'paragraph' ? [b.runs.map((r) => ('text' in r ? r.text : '')).join(''), !!b.solution] : b.type));

describe('TEACH-001 exercise sheets and answer keys', () => {
  it('leaves the solutions out of the sheet', () => {
    expect(shape(withoutSolutions(sheet()).blocks)).toEqual([['Exercise 1', false], ['Compute 2 + 3.', false], ['Next exercise.', false]]);
  });

  it('keeps solutions through the editor', () => {
    expect(shape(pmToBlocks(blocksToPm(sheet().blocks)))).toEqual(shape(sheet().blocks));
  });

  it('writes Word content controls and reads them back', () => {
    const bytes = writeDocx(sheet());
    const xml = readZipText(readZip(bytes), 'word/document.xml')!;
    expect(xml).toMatch(/<w:sdt><w:sdtPr><w:alias w:val="Solution"\/><w:tag w:val="pwo:solution"\/><\/w:sdtPr><w:sdtContent><w:p>.*2 \+ 3 = 5.*Add the units\..*<\/w:sdtContent><\/w:sdt>/);
    expect(shape(readDocx(bytes).blocks)).toEqual(shape(sheet().blocks));
  });

  it('writes OpenDocument sections and reads them back', () => {
    const bytes = writeOdt(sheet());
    const xml = readZipText(readZip(bytes), 'content.xml')!;
    expect(xml).toMatch(/<text:section text:style-name="Solution" text:name="Solution1">.*2 \+ 3 = 5.*<\/text:section>/);
    expect(shape(readOdt(bytes).blocks)).toEqual(shape(sheet().blocks));
  });

  it('writes Markdown fenced divs and reads them back', () => {
    const md = writeMarkdown(sheet());
    expect(md).toContain('Compute 2 + 3.\n\n::: solution\n\n2 + 3 = 5\n\n1. Add the units.\n\n:::\n\nNext exercise.');
    expect(shape(readMarkdown(md).blocks)).toEqual(shape(sheet().blocks));
    expect(shape(readMarkdown('Question?\n\n::: {.solution}\nAnswer.\n:::\n').blocks)).toEqual([['Question?', false], ['Answer.', true]]);
  });
});
