import { describe, expect, it } from 'vitest';
import { readDocument, writeDocument } from '../src/document/io';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { emptyDocument, paragraph, type Block, type RichDocument } from '../src/document/model';
import { readZip, readZipText } from '../src/core/zip';

const formatted: Block[] = [
  {
    type: 'paragraph',
    style: 'normal',
    indent: 36,
    firstLine: -18,
    spaceBefore: 12,
    spaceAfter: 6,
    lineHeight: 1.5,
    runs: [
      { text: 'Serif ', font: 'Liberation Serif' },
      { text: 'big red', size: 16, color: '#c00000', bold: true },
      { text: ' highlighted', highlight: '#ffff00' },
      { text: ' plain' },
    ],
  },
  { type: 'paragraph', style: 'h2', runs: [{ text: 'Heading without direct formatting' }] },
  { type: 'paragraph', style: 'normal', align: 'center', firstLine: 24, runs: [{ text: 'Indented first line', size: 9 }] },
  paragraph('item', { list: { ordered: false, level: 0 } }),
];

const doc = (): RichDocument => ({ ...emptyDocument(), blocks: structuredClone(formatted) });

describe('DOC-020 character and paragraph formatting', () => {
  it('keeps fonts, sizes, colours, highlight and spacing in the editor model', () => {
    expect(pmToBlocks(blocksToPm(formatted))).toEqual(formatted);
  });

  it.each(['docx', 'odt'] as const)('round-trips through %s', async (format) => {
    const back = await readDocument(format, writeDocument(doc(), format));
    expect(back.blocks).toEqual(formatted);
  });

  it('writes standard DOCX properties in schema order', () => {
    const xml = readZipText(readZip(writeDocument(doc(), 'docx')), 'word/document.xml')!;
    expect(xml).toContain('<w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:left="720" w:hanging="360"/>');
    expect(xml).toContain('<w:rPr><w:b/><w:bCs/><w:color w:val="C00000"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>');
    expect(xml).toContain('<w:rFonts w:ascii="Liberation Serif"');
    expect(xml).toContain('<w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/>');
  });

  it('reads Word highlight names and ignores heading style sizes', async () => {
    const back = await readDocument('docx', writeDocument(doc(), 'docx'));
    // The heading's size comes from its style: no direct size on the run.
    expect(back.blocks[1]).toEqual({ type: 'paragraph', style: 'h2', runs: [{ text: 'Heading without direct formatting' }] });
  });
});
