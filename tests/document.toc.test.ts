import { describe, expect, it } from 'vitest';
import { readDocument, writeDocument } from '../src/document/io';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { emptyDocument, paragraph, tocEntries, type Block } from '../src/document/model';
import { readZip, readZipText } from '../src/core/zip';

const blocks: Block[] = [
  { type: 'toc' },
  paragraph('Introduction', { style: 'h1' }),
  paragraph('Text'),
  paragraph('Method', { style: 'h2' }),
  paragraph('Details', { style: 'h4' }),
  paragraph('Results', { style: 'h1' }),
];
const doc = () => ({ ...emptyDocument(), blocks: structuredClone(blocks) });

describe('DOC-023 table of contents', () => {
  it('lists the headings down to the chosen level', () => {
    expect(tocEntries(blocks).map((e) => `${e.level}:${e.text}`)).toEqual(['1:Introduction', '2:Method', '1:Results']);
    expect(tocEntries(blocks, 4)).toHaveLength(4);
    expect(pmToBlocks(blocksToPm(blocks))).toEqual(blocks);
  });

  it.each(['docx', 'odt', 'md', 'tex'] as const)('round-trips through %s, regenerated from the headings', async (format) => {
    const back = await readDocument(format, writeDocument(doc(), format));
    expect(back.blocks[0]).toEqual({ type: 'toc' });
    expect(back.blocks.filter((b) => b.type === 'toc')).toHaveLength(1);
    expect(back.blocks.slice(1).map((b) => (b.type === 'paragraph' ? b.runs.map((r) => ('text' in r ? r.text : '')).join('') : b.type))).toEqual(['Introduction', 'Text', 'Method', 'Details', 'Results']);
  });

  it('writes fields that Word and LibreOffice update', () => {
    const xml = readZipText(readZip(writeDocument(doc(), 'docx')), 'word/document.xml')!;
    expect(xml).toContain('<w:docPartGallery w:val="Table of Contents"/>');
    expect(xml).toContain('<w:fldChar w:fldCharType="begin" w:dirty="true"/>');
    expect(xml).toContain(' TOC \\o "1-3" \\h \\z \\u ');
    expect(xml).toContain('<w:pStyle w:val="TOC2"/></w:pPr><w:r><w:t xml:space="preserve">Method</w:t>');
    const odt = readZipText(readZip(writeDocument(doc(), 'odt')), 'content.xml')!;
    expect(odt).toContain('<text:table-of-content-source text:outline-level="3"');
    expect(new TextDecoder().decode(writeDocument(doc(), 'md'))).toMatch(/^\[\[_TOC_\]\]\n/);
  });
});
