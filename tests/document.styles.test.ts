import { describe, expect, it } from 'vitest';
import { readDocument, writeDocumentAsync } from '../src/document/io';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { cleanNamedStyles, namedStylesCss, styleId, type NamedStyle } from '../src/document/styles';
import type { Paragraph, RichDocument } from '../src/document/model';

const abstract: NamedStyle = { id: 'Abstract', name: 'Résumé de l’article', font: 'Liberation Serif', size: 10, color: '#334455', italic: true, align: 'justify', spaceBefore: 6, spaceAfter: 12, indent: 18, lineHeight: 1.15 };
const doc = (): RichDocument =>
  ({
    blocks: [
      { type: 'paragraph', style: 'h1', runs: [{ text: 'Title' }] },
      { type: 'paragraph', style: 'normal', named: 'Abstract', runs: [{ text: 'An abstract.' }] },
      { type: 'paragraph', style: 'normal', runs: [{ text: 'Body.' }] },
    ],
    styles: [abstract],
    meta: {},
    resources: new Map(),
  }) as unknown as RichDocument;

describe('DOC-053 named paragraph styles', () => {
  it('gives ids safe in files, and drops malformed styles', () => {
    expect(styleId('Résumé de l’article')).toBe('Resume_de_l_article');
    expect(styleId('Note', ['Note'])).toBe('Note_2');
    expect(styleId('2 columns')).toBe('S_2_columns');
    expect(cleanNamedStyles([{ id: '1bad', name: 'x' }, { id: 'Ok', name: ' Ok ', size: 5000, color: 'red', bold: true }])).toEqual([{ id: 'Ok', name: 'Ok', bold: true }]);
  });

  it('shows the styles in the editor and keeps them through it', () => {
    expect(namedStylesCss([abstract], '.ProseMirror')).toContain('.ProseMirror [data-named="Abstract"] { font-family: "Liberation Serif", sans-serif; font-size: 10pt; color: #334455; font-style: italic; text-align: justify;');
    const back = pmToBlocks(blocksToPm(doc().blocks));
    expect((back[1] as Paragraph).named).toBe('Abstract');
    expect((back[2] as Paragraph).named).toBeUndefined();
  });

  it.each(['odt', 'docx'] as const)('keeps them in %s', async (format) => {
    const bytes = await writeDocumentAsync(doc(), format);
    const back = await readDocument(format, bytes);
    const p = back.blocks.find((b) => b.type === 'paragraph' && b.runs.some((r) => 'text' in r && r.text === 'An abstract.')) as Paragraph;
    expect(p.named).toBe('Abstract');
    expect(back.styles).toEqual([abstract]);
    const body = back.blocks.find((b) => b.type === 'paragraph' && b.runs.some((r) => 'text' in r && r.text === 'Body.')) as Paragraph;
    expect(body.named).toBeUndefined();
  });
});
