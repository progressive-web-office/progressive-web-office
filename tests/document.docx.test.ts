import { describe, expect, it } from 'vitest';
import { readDocx } from '../src/document/docx-reader';
import { writeDocx } from '../src/document/docx-writer';
import { readZip, readZipText } from '../src/core/zip';
import { parseXml } from '../src/core/xml';
import { detectFormat } from '../src/core/format';
import { makeZip } from './helpers';
import { richSample } from './fixtures';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

describe('DOC-001 DOCX reader', () => {
  it('reads paragraphs, localized heading styles, run formatting, lists, links and tables', () => {
    const bytes = makeZip({
      '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      'word/styles.xml': `<w:styles ${W}>
        <w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/></w:style>
        <w:style w:type="paragraph" w:styleId="Citation"><w:name w:val="Quote"/></w:style>
      </w:styles>`,
      'word/numbering.xml': `<w:numbering ${W}>
        <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
        <w:num w:numId="5"><w:abstractNumId w:val="0"/></w:num>
      </w:numbering>`,
      'word/_rels/document.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org" TargetMode="External"/>
      </Relationships>`,
      'word/document.xml': `<w:document ${W}><w:body>
        <w:p><w:pPr><w:pStyle w:val="Titre1"/></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p>
        <w:p><w:pPr><w:jc w:val="both"/></w:pPr>
          <w:r><w:rPr><w:b/><w:i w:val="0"/></w:rPr><w:t xml:space="preserve">Bold </w:t></w:r>
          <w:r><w:rPr><w:u w:val="single"/><w:strike/></w:rPr><w:t>us</w:t></w:r>
          <w:r><w:rPr><w:b w:val="false"/></w:rPr><w:tab/><w:t>x</w:t><w:br/><w:t>y</w:t></w:r>
          <w:hyperlink r:id="rId9"><w:r><w:t>link</w:t></w:r></w:hyperlink>
          <w:ins><w:r><w:t>+ins</w:t></w:r></w:ins><w:del><w:r><w:delText>gone</w:delText></w:r></w:del>
          <w:smartTag><w:r><w:t>!</w:t></w:r></w:smartTag>
        </w:p>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr></w:pPr><w:r><w:t>bullet</w:t></w:r></w:p>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="5"/></w:numPr></w:pPr><w:r><w:t>number</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="Citation"/></w:pPr><w:r><w:t>q</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>c1</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>
        <w:sectPr/>
      </w:body></w:document>`,
    });
    const doc = readDocx(bytes);
    expect(doc.blocks).toEqual([
      { type: 'paragraph', style: 'h1', runs: [{ text: 'Heading' }] },
      {
        type: 'paragraph',
        style: 'normal',
        align: 'justify',
        runs: [
          { text: 'Bold ', bold: true },
          { text: 'us', underline: true, strike: true },
          { text: '\tx\ny' },
          { text: 'link', link: 'https://example.org' },
          { text: '+ins!' },
        ],
      },
      { type: 'paragraph', style: 'normal', list: { ordered: false, level: 0 }, runs: [{ text: 'bullet' }] },
      { type: 'paragraph', style: 'normal', list: { ordered: true, level: 1 }, runs: [{ text: 'number' }] },
      { type: 'paragraph', style: 'quote', runs: [{ text: 'q' }] },
      { type: 'table', rows: [[{ blocks: [{ type: 'paragraph', style: 'normal', runs: [{ text: 'c1' }] }] }, { blocks: [{ type: 'paragraph', style: 'normal', runs: [] }] }]] },
    ]);
  });

  it('FILE-004 rejects packages without a main document', () => {
    expect(() => readDocx(makeZip({ 'a.txt': 'x' }))).toThrow(/word\/document\.xml/);
  });
});

describe('DOC-006 DOCX writer', () => {
  it('produces a well-formed OOXML package detected as docx', () => {
    const bytes = writeDocx(richSample());
    expect(detectFormat('x', bytes)).toBe('docx');
    const zip = readZip(bytes);
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/styles.xml',
      'word/numbering.xml',
      'word/_rels/document.xml.rels',
      'docProps/core.xml',
    ]) {
      expect(zip[part], part).toBeDefined();
      expect(() => parseXml(readZipText(zip, part)!), part).not.toThrow();
    }
    expect(Object.keys(zip).some((p) => p.startsWith('word/media/'))).toBe(true);
    expect(readZipText(zip, '[Content_Types].xml')).toContain('Extension="png"');
  });

  it('DOC-011 round-trips every model feature', () => {
    const doc = richSample();
    const back = readDocx(writeDocx(doc));
    expect(back.blocks).toEqual(doc.blocks);
    expect([...back.resources.values()].map((r) => r.mediaType)).toEqual(['image/png']);
    expect(back.meta.title).toBe('Sample');
  });

  it('restarts numbering for separate ordered lists', () => {
    const doc = richSample();
    doc.blocks = [
      { type: 'paragraph', style: 'normal', list: { ordered: true, level: 0 }, runs: [{ text: 'a' }] },
      { type: 'paragraph', style: 'normal', runs: [{ text: 'break' }] },
      { type: 'paragraph', style: 'normal', list: { ordered: true, level: 0 }, runs: [{ text: 'b' }] },
    ];
    const xml = readZipText(readZip(writeDocx(doc)), 'word/document.xml')!;
    const ids = [...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
  });
});
