import { describe, expect, it } from 'vitest';
import { readDocument, writeDocument, writeDocumentAsync } from '../src/document/io';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { emptyDocument, type Block } from '../src/document/model';
import { readZip, readZipText } from '../src/core/zip';
import { markdownToNote, noteToMarkdown } from '../src/document/footnote-dialog';

const blocks: Block[] = [
  {
    type: 'paragraph',
    style: 'normal',
    runs: [
      { text: 'Energy' },
      { footnote: [{ text: 'Einstein, 1905: ' }, { math: 'E=mc^{2}' }] },
      { text: ' is conserved' },
      { footnote: [{ text: 'See ' }, { text: 'chapter 2', italic: true }, { text: '.\n\nSecond paragraph.' }] },
      { text: '.' },
    ],
  },
];
const doc = () => ({ ...emptyDocument(), blocks: structuredClone(blocks) });

describe('DOC-022 footnotes', () => {
  it('survive the editor model', () => {
    expect(pmToBlocks(blocksToPm(blocks))).toEqual(blocks);
  });

  it.each(['docx', 'odt', 'md', 'tex'] as const)('round-trip through %s', async (format) => {
    const back = await readDocument(format, await writeDocumentAsync(doc(), format));
    expect(back.blocks).toEqual(blocks);
  });

  it('write standard footnotes', () => {
    const zip = readZip(writeDocument(doc(), 'docx'));
    expect(readZipText(zip, 'word/document.xml')).toContain('<w:footnoteReference w:id="2"/>');
    expect(readZipText(zip, 'word/footnotes.xml')).toContain('<w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>');
    expect(readZipText(zip, '[Content_Types].xml')).toContain('/word/footnotes.xml');
    expect(readZipText(readZip(writeDocument(doc(), 'odt')), 'content.xml')).toContain('<text:note text:id="ftn1" text:note-class="footnote">');
    const md = new TextDecoder().decode(writeDocument(doc(), 'md'));
    expect(md).toBe('Energy[^1] is conserved[^2].\n\n[^1]: Einstein, 1905: $E=mc^{2}$\n\n[^2]: See *chapter 2*.\n\n    Second paragraph.\n');
  });

  it('reads inline Markdown notes and edits notes as Markdown', async () => {
    const back = await readDocument('md', new TextEncoder().encode('Text^[An *inline* note].'));
    expect(back.blocks[0]).toMatchObject({ runs: [{ text: 'Text' }, { footnote: [{ text: 'An ' }, { text: 'inline', italic: true }, { text: ' note' }] }, { text: '.' }] });
    const first = blocks[0]!;
    const note = first.type === 'paragraph' ? (first.runs[3] as { footnote: never[] }).footnote : [];
    expect(noteToMarkdown(note)).toBe('See *chapter 2*.\n\nSecond paragraph.');
    expect(markdownToNote(noteToMarkdown(note))).toEqual(note);
  });
});
