import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { readDocument, writeDocument } from '../src/document/io';
import { allParagraphs, isTextRun, type RichDocument } from '../src/document/model';

const caps = (d: RichDocument) => allParagraphs(d.blocks).flatMap((p) => p.runs.filter(isTextRun).filter((r) => r.smallCaps).map((r) => r.text + (r.bold ? '*' : '')));

describe('DOC-048 small capitals', () => {
  const SOURCE = 'Le [xix]{.smallcaps}e siècle, par [Victor **Hugo**]{.smallcaps}. Not [this](https://example.org).\n';
  it('reads and writes Pandoc bracketed spans', () => {
    const doc = readMarkdown(SOURCE);
    expect(caps(doc)).toEqual(['xix', 'Victor ', 'Hugo*']);
    expect(writeMarkdown(doc)).toContain('[xix]{.smallcaps}e siècle, par [Victor **Hugo**]{.smallcaps}');
  });

  it.each(['odt', 'docx', 'tex'] as const)('keeps them in %s', async (format) => {
    const back = await readDocument(format, writeDocument(readMarkdown(SOURCE), format));
    expect(caps(back)).toEqual(['xix', 'Victor ', 'Hugo*']);
  });

  it('writes \\textsc in LaTeX', () => {
    const tex = new TextDecoder().decode(writeDocument(readMarkdown(SOURCE), 'tex'));
    expect(tex).toContain('\\textsc{xix}e siècle');
  });
});
