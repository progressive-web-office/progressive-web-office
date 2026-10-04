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

describe('DOC-050 a field changed: its kind, its format, a fixed date', () => {
  const runs = (d: RichDocument) => allParagraphs(d.blocks).flatMap((p) => p.runs.filter(isFieldRun));
  const now = new Date(2026, 9, 3, 14, 5, 9);

  it('shows a date or a time in the format chosen, or the fixed one', () => {
    expect(fieldValue('date', { lang: 'fr', now }, { format: 'short' })).toBe('03/10/2026');
    expect(fieldValue('date', { lang: 'fr', now }, { format: 'full' })).toBe('samedi 3 octobre 2026');
    expect(fieldValue('date', { lang: 'fr', now }, { format: 'iso' })).toBe('2026-10-03');
    expect(fieldValue('date', { lang: 'fr', now }, { fixed: '2025-12-24' })).toBe('24 décembre 2025');
    expect(fieldValue('date', { lang: 'en-GB', now }, { format: 'medium', fixed: '2025-12-24' })).toBe('24 Dec 2025');
    expect(fieldValue('time', { lang: 'fr', now }, { format: 'medium' })).toBe('14:05:09');
    expect(fieldValue('time', { lang: 'fr', now }, { fixed: '08:30' })).toBe('08:30');
  });

  it('reads and writes `{date:full}`, `{date=2025-12-24}` in Markdown', async () => {
    const doc = readMarkdown('A {date:full}, B {date=2025-12-24}, C {time:medium=08:30}, D {date:iso}.\n');
    expect(runs(doc)).toEqual([{ field: 'date', format: 'full' }, { field: 'date', fixed: '2025-12-24' }, { field: 'time', format: 'medium', fixed: '08:30' }, { field: 'date', format: 'iso' }]);
    const md = new TextDecoder().decode(writeDocument(doc, 'md'));
    expect(md).toBe('A {date:full}, B {date=2025-12-24}, C {time:medium=08:30}, D {date:iso}.\n');
    // Unknown formats are text.
    expect(runs(readMarkdown('{date:weird}\n'))).toEqual([]);
  });

  it('keeps the format and the fixed date in OpenDocument text', async () => {
    const doc = readMarkdown('A {date:full}, B {date=2025-12-24}, C {time:medium}.\n');
    const bytes = writeDocument(doc, 'odt');
    const xml = readZipText(readZip(bytes), 'content.xml')!;
    expect(xml).toContain('<text:date style:data-style-name="NDate-full"');
    expect(xml).toContain('text:date-value="2025-12-24" text:fixed="true"');
    expect(xml).toContain('<number:date-style style:name="NDate-full"');
    expect(runs(await readDocument('odt', bytes))).toEqual([{ field: 'date', format: 'full' }, { field: 'date', fixed: '2025-12-24' }, { field: 'time', format: 'medium' }]);
  });

  it('writes the format as a Word date picture; a fixed date stays as its text', async () => {
    const doc = readMarkdown('A {date:iso}, B {date=2025-12-24}.\n');
    const bytes = writeDocument(doc, 'docx');
    const xml = readZipText(readZip(bytes), 'word/document.xml')!;
    expect(xml).toContain('w:instr=" DATE \\@ &quot;yyyy-MM-dd&quot; "');
    expect(xml).toContain('w:fldLock="1"');
    const back = await readDocument('docx', bytes);
    expect(runs(back)).toEqual([{ field: 'date', format: 'iso' }]);
    expect(JSON.stringify(back.blocks)).toMatch(/2025/);
  });

  it('goes through HTML with its format and fixed date', () => {
    const doc = readMarkdown('{date:short=2025-12-24}\n');
    const host = document.createElement('div');
    host.append(blocksToDom(doc.blocks, document, () => undefined, undefined, { lang: 'fr', now }));
    expect(host.querySelector('span.field')?.textContent).toBe('24/12/2025');
    expect(runs({ ...doc, blocks: domToBlocks(host, () => undefined) })).toEqual([{ field: 'date', format: 'short', fixed: '2025-12-24' }]);
  });
});
