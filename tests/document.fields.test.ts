import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { readDocument, writeDocument } from '../src/document/io';
import { allParagraphs, fieldValue, isFieldRun, type RichDocument } from '../src/document/model';
import { blocksToDom, domToBlocks } from '../src/document/html';
import { readZip, readZipText } from '../src/core/zip';

const fields = (d: RichDocument) => allParagraphs(d.blocks).flatMap((p) => p.runs.filter(isFieldRun).map((r) => r.field));
const SOURCE = '# {title}\n\nParis, le {date} à {time}.\n\nPage {page} sur {pages}, par {author}, dans {filename}.\n\nNot fields: \\{date}, {{date}}, {other}.\n';

describe('DOC-041 fields', () => {
  it('reads `{date}`… in Markdown, but not escaped ones, mail merge names or unknown names', () => {
    const doc = readMarkdown(SOURCE);
    expect(fields(doc)).toEqual(['title', 'date', 'time', 'page', 'pages', 'author', 'filename']);
    const last = allParagraphs(doc.blocks).at(-1)!;
    expect(last.runs.map((r) => ('text' in r ? r.text : '')).join('')).toBe('Not fields: {date}, {{date}}, {other}.');
  });

  it.each(['md', 'odt', 'docx'] as const)('keeps its fields in %s', async (format) => {
    const doc = readMarkdown(SOURCE);
    doc.meta = { ...doc.meta, title: 'Report', author: 'Ada' };
    const back = await readDocument(format, writeDocument(doc, format));
    expect(fields(back)).toEqual(['title', 'date', 'time', 'page', 'pages', 'author', 'filename']);
    // The literal text stays text.
    expect(JSON.stringify(back.blocks)).toContain('{{date}}');
  });

  it('writes real fields: OpenDocument text fields and Word field codes', async () => {
    const doc = readMarkdown('Le {date}, page {page}/{pages}.\n');
    const odt = readZipText(readZip(writeDocument(doc, 'odt')), 'content.xml')!;
    expect(odt).toMatch(/<text:date style:data-style-name="NDate" text:date-value="\d{4}-\d\d-\d\dT[\d:]+">/);
    expect(odt).not.toContain('text:fixed');
    expect(odt).toContain('<text:page-number text:select-page="current">');
    expect(odt).toContain('<text:page-count>');
    expect(odt).toContain('<number:date-style style:name="NDate"');
    const docx = readZipText(readZip(writeDocument(doc, 'docx')), 'word/document.xml')!;
    expect(docx).toContain('w:instr=" DATE \\@ &quot;d MMMM yyyy&quot; "');
    expect(docx).toContain('w:instr=" PAGE "');
    expect(docx).toContain('w:instr=" NUMPAGES "');
  });

  it('writes LaTeX commands, with the packages they need', () => {
    const tex = new TextDecoder().decode(writeDocument(readMarkdown('{date}, {page}/{pages}, {title}\n'), 'tex'));
    expect(tex).toContain('\\today{}, \\thepage{}/\\pageref*{LastPage}, \\thetitle{}');
    expect(tex).toContain('\\usepackage{lastpage}');
    expect(tex).toContain('\\usepackage{titling}');
  });

  it('shows its value, in the language of the document', () => {
    const now = new Date(2026, 9, 3, 14, 5);
    expect(fieldValue('date', { lang: 'fr', now })).toBe('3 octobre 2026');
    expect(fieldValue('date', { lang: 'en-GB', now })).toBe('3 October 2026');
    expect(fieldValue('time', { lang: 'fr', now })).toBe('14:05');
    expect(fieldValue('title', { meta: { title: 'T' } })).toBe('T');
    expect(fieldValue('page', { page: 3 })).toBe('3');
  });

  it('goes through HTML (copy and paste)', () => {
    const doc = readMarkdown('Le {date}.\n');
    const host = document.createElement('div');
    host.append(blocksToDom(doc.blocks, document, () => undefined, undefined, { lang: 'fr', now: new Date(2026, 9, 3) }));
    expect(host.querySelector('span.field[data-field="date"]')?.textContent).toBe('3 octobre 2026');
    expect(fields({ ...doc, blocks: domToBlocks(host, () => undefined) })).toEqual(['date']);
  });
});

describe('DOC-041 fields from LaTeX', () => {
  it('reads \\today, \\thepage and \\pageref{LastPage} as fields', async () => {
    const tex = '\\documentclass{article}\n\\begin{document}\nLe \\today{}, page \\thepage{} sur \\pageref*{LastPage}.\n\\end{document}\n';
    expect(fields(await readDocument('tex', new TextEncoder().encode(tex)))).toEqual(['date', 'page', 'pages']);
  });
});
