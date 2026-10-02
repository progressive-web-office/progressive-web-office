import { describe, expect, it } from 'vitest';
import { readDocument, writeDocument } from '../src/document/io';
import { emptyDocument, paragraph, zoneParts, type RichDocument } from '../src/document/model';
import { readZip, readZipText } from '../src/core/zip';
import { pageSetupCss, zonePreview } from '../src/document/page-setup';
import { formatPageNumber } from '../src/document/model';

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

describe('DOC-029 page numbering styles', () => {
  const numbered = (): RichDocument => ({
    ...emptyDocument(),
    blocks: [paragraph('Cover'), paragraph('Body')],
    page: { footer: { center: '- {page} -' }, numberFormat: 'lower-roman', startAt: 3, hideOnFirstPage: true },
  });

  it.each(['docx', 'odt', 'tex', 'md'] as const)('round-trip through %s', async (format) => {
    const back = await readDocument(format, writeDocument(numbered(), format));
    expect(back.page).toEqual(numbered().page);
    expect(back.blocks).toEqual(numbered().blocks);
  });

  it('writes the native numbering settings', () => {
    const docx = readZip(writeDocument(numbered(), 'docx'));
    const main = readZipText(docx, 'word/document.xml')!;
    expect(main).toContain('<w:pgNumType w:fmt="lowerRoman" w:start="3"/>');
    expect(main).toContain('<w:titlePg/>');
    expect(main).toMatch(/<w:footerReference w:type="first" r:id="rId\d+"\/>/);
    const styles = readZipText(readZip(writeDocument(numbered(), 'odt')), 'styles.xml')!;
    expect(styles).toContain('style:num-format="i"');
    expect(styles).toContain('text:page-adjust="2"');
    expect(styles).toMatch(/<style:master-page style:name="First_20_Page"[^>]*\/>|<style:master-page style:name="First_20_Page"[^>]*><\/style:master-page>/);
    const tex = new TextDecoder().decode(writeDocument(numbered(), 'tex'));
    expect(tex).toContain('\\pagenumbering{roman}');
    expect(tex).toContain('\\setcounter{page}{3}');
    expect(tex).toContain('\\thispagestyle{empty}');
  });

  it('keeps decimal numbering from 1 implicit', () => {
    const plain: RichDocument = { ...numbered(), page: { footer: { center: '{page}' } } };
    const main = readZipText(readZip(writeDocument(plain, 'docx')), 'word/document.xml')!;
    expect(main).not.toContain('pgNumType');
    expect(main).not.toContain('titlePg');
  });
});

describe('DOC-029 page numbers on screen and in print', () => {
  it('writes numbers in every style', () => {
    expect([1, 4, 9, 14, 2026].map((n) => formatPageNumber(n, 'lower-roman'))).toEqual(['i', 'iv', 'ix', 'xiv', 'mmxxvi']);
    expect(formatPageNumber(4, 'upper-roman')).toBe('IV');
    expect([1, 26, 27, 52].map((n) => formatPageNumber(n, 'lower-alpha'))).toEqual(['a', 'z', 'aa', 'az']);
    expect(formatPageNumber(3, 'upper-alpha')).toBe('C');
    expect(formatPageNumber(0, 'lower-roman')).toBe('0');
  });

  it('previews the first page number in its style', () => {
    expect(zonePreview('- {page} -', '', { numberFormat: 'upper-roman', startAt: 5 })).toBe('- V -');
  });

  it('prints with the counter style, the first number and a bare title page', () => {
    const css = pageSetupCss({ footer: { center: '{page}' }, numberFormat: 'lower-roman', startAt: 3, hideOnFirstPage: true }, '');
    expect(css).toContain('counter(page, lower-roman)');
    expect(css).toContain('@page :first { counter-set: page 3; @bottom-center { content: none; } }');
    expect(pageSetupCss({ footer: { center: '{page}' } }, '')).not.toContain(':first');
  });
});
