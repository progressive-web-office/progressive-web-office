import { describe, expect, it } from 'vitest';
import { readDocument, writeDocument } from '../src/document/io';
import { emptyDocument, paragraph, zoneParts, type RichDocument } from '../src/document/model';
import { readZip, readZipText } from '../src/core/zip';

const doc = (): RichDocument => ({
  ...emptyDocument(),
  meta: { title: 'Rapport' },
  blocks: [paragraph('Body')],
  page: { header: { left: '{title}', right: 'BUT GEII' }, footer: { center: 'Page {page} / {pages}', right: '{date}' } },
});

describe('DOC-024 headers and footers', () => {
  it('splits zones into text and fields', () => {
    expect(zoneParts('Page {page} / {pages}')).toEqual(['Page ', { field: 'page' }, ' / ', { field: 'pages' }]);
    expect(zoneParts('{unknown}')).toEqual(['{unknown}']);
  });

  it.each(['docx', 'odt', 'tex', 'md'] as const)('round-trip through %s', async (format) => {
    const back = await readDocument(format, writeDocument(doc(), format));
    expect(back.page).toEqual(doc().page);
    expect(back.blocks).toEqual([paragraph('Body')]);
  });

  it('writes Word header/footer parts with fields', () => {
    const zip = readZip(writeDocument(doc(), 'docx'));
    const main = readZipText(zip, 'word/document.xml')!;
    expect(main).toMatch(/<w:sectPr><w:headerReference w:type="default" r:id="rId\d+"\/><w:footerReference w:type="default" r:id="rId\d+"\/><w:pgSz/);
    const footer = readZipText(zip, 'word/footer1.xml')!;
    expect(footer).toContain('<w:fldSimple w:instr=" PAGE ">');
    expect(footer).toContain('<w:fldSimple w:instr=" NUMPAGES ">');
    expect(readZipText(zip, '[Content_Types].xml')).toContain('/word/header1.xml');
    expect(readZipText(readZip(writeDocument(doc(), 'odt')), 'styles.xml')).toContain('<style:footer><text:p text:style-name="Footer"><text:tab/>Page<text:s/><text:page-number text:select-page="current">1</text:page-number> /<text:s/><text:page-count>1</text:page-count>');
    expect(new TextDecoder().decode(writeDocument(doc(), 'tex'))).toContain('\\fancyfoot[C]{Page \\thepage{} / \\pageref*{LastPage}}');
  });

  it('leaves documents without header or footer unchanged', async () => {
    const plain = { ...emptyDocument(), blocks: [paragraph('x')] };
    const zip = readZip(writeDocument(plain, 'docx'));
    expect(Object.keys(zip).some((p) => p.includes('header'))).toBe(false);
    expect((await readDocument('docx', writeDocument(plain, 'docx'))).page).toBeUndefined();
  });
});
