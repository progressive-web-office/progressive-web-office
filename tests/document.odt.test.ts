import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { readOdt } from '../src/document/odt-reader';
import { writeOdt } from '../src/document/odt-writer';
import { readZipText } from '../src/core/zip';
import { parseXml } from '../src/core/xml';
import { detectFormat } from '../src/core/format';
import { makeZip } from './helpers';
import { PNG_1PX, richSample } from './fixtures';
import { zipSync, strToU8 } from 'fflate';

const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ' +
  'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';

describe('DOC-002 ODT reader', () => {
  it('reads styles, spans, whitespace, lists, links, tables and images', () => {
    const content = `<office:document-content ${NS}>
      <office:automatic-styles>
        <style:style style:name="P1" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/></style:style>
        <style:style style:name="P2" style:family="paragraph" style:parent-style-name="Quotations"/>
        <style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold" fo:font-style="italic"/></style:style>
        <style:style style:name="T2" style:family="text"><style:text-properties style:text-underline-style="solid" style:text-line-through-style="solid"/></style:style>
        <text:list-style style:name="L1"><text:list-level-style-number text:level="1"/><text:list-level-style-bullet text:level="2"/></text:list-style>
      </office:automatic-styles>
      <office:body><office:text>
        <text:h text:outline-level="2">Title</text:h>
        <text:p text:style-name="P1">a  b<text:s text:c="2"/>c<text:tab/>d<text:line-break/><text:span text:style-name="T1">bi</text:span><text:span text:style-name="T2">us</text:span><text:soft-page-break/></text:p>
        <text:p><text:a xlink:href="https://example.org">link</text:a><text:bookmark text:name="x"/></text:p>
        <text:list text:style-name="L1"><text:list-item><text:p>one</text:p><text:list><text:list-item><text:p>sub</text:p></text:list-item></text:list></text:list-item></text:list>
        <text:p text:style-name="P2">quoted</text:p>
        <table:table><table:table-column table:number-columns-repeated="2"/><table:table-header-rows><table:table-row><table:table-cell><text:p>h1</text:p></table:table-cell><table:table-cell/></table:table-row></table:table-header-rows></table:table>
        <text:p><draw:frame svg:width="2.54cm" svg:height="1in"><draw:image xlink:href="Pictures/p.png"/><svg:desc>alt text</svg:desc></draw:frame></text:p>
      </office:text></office:body></office:document-content>`;
    const bytes = zipSync({
      mimetype: strToU8('application/vnd.oasis.opendocument.text'),
      'content.xml': strToU8(content),
      'Pictures/p.png': PNG_1PX,
    });
    const doc = readOdt(bytes);
    const [img] = [...doc.resources.keys()];
    expect(doc.blocks).toEqual([
      { type: 'paragraph', style: 'h2', runs: [{ text: 'Title' }] },
      {
        type: 'paragraph',
        style: 'normal',
        align: 'center',
        runs: [{ text: 'a b  c\td\n' }, { text: 'bi', bold: true, italic: true }, { text: 'us', underline: true, strike: true }],
      },
      { type: 'paragraph', style: 'normal', runs: [{ text: 'link', link: 'https://example.org' }] },
      { type: 'paragraph', style: 'normal', list: { ordered: true, level: 0 }, runs: [{ text: 'one' }] },
      { type: 'paragraph', style: 'normal', list: { ordered: false, level: 1 }, runs: [{ text: 'sub' }] },
      { type: 'paragraph', style: 'quote', runs: [{ text: 'quoted' }] },
      { type: 'table', header: true, rows: [[{ blocks: [{ type: 'paragraph', style: 'normal', runs: [{ text: 'h1' }] }] }, { blocks: [{ type: 'paragraph', style: 'normal', runs: [] }] }]] },
      { type: 'paragraph', style: 'normal', runs: [{ image: img, alt: 'alt text', width: 96, height: 96 }] },
    ]);
  });

  it('FILE-004 rejects packages without content.xml', () => {
    expect(() => readOdt(makeZip({ mimetype: 'application/vnd.oasis.opendocument.text' }))).toThrow(/content\.xml/);
  });
});

describe('DOC-007 ODT writer', () => {
  it('writes a valid ODF package with an uncompressed mimetype first', () => {
    const bytes = writeOdt(richSample());
    expect(detectFormat('x', bytes)).toBe('odt');
    expect(new TextDecoder().decode(bytes.subarray(30, 38))).toBe('mimetype');
    expect(bytes[8]).toBe(0);
    const zip = unzipSync(bytes);
    for (const part of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) {
      expect(() => parseXml(readZipText(zip, part)!), part).not.toThrow();
    }
    const manifest = readZipText(zip, 'META-INF/manifest.xml')!;
    for (const path of Object.keys(zip).filter((p) => p.startsWith('Pictures/'))) expect(manifest).toContain(path);
  });

  it('DOC-011 round-trips every model feature', () => {
    const doc = richSample();
    const back = readOdt(writeOdt(doc));
    expect(back.blocks).toEqual(doc.blocks);
    expect(back.meta.title).toBe('Sample');
  });
});
