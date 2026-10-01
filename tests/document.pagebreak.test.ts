import { describe, expect, it } from 'vitest';
import { readDocument, writeDocument } from '../src/document/io';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { emptyDocument, paragraph, type Block } from '../src/document/model';
import { readZip, readZipText, writeZip } from '../src/core/zip';

const blocks: Block[] = [paragraph('Chapter one'), { type: 'rule', page: true }, paragraph('Chapter two'), { type: 'rule' }, paragraph('After a line')];
const enc = (s: string) => new TextEncoder().encode(s);

describe('DOC-021 page breaks', () => {
  it('stay distinct from horizontal rules in the editor model', () => {
    expect(pmToBlocks(blocksToPm(blocks))).toEqual(blocks);
  });

  it.each(['docx', 'odt', 'md', 'tex'] as const)('round-trip through %s', async (format) => {
    const back = await readDocument(format, writeDocument({ ...emptyDocument(), blocks: structuredClone(blocks) }, format));
    expect(back.blocks.map((b) => (b.type === 'rule' ? `rule${b.page ? ':page' : ''}` : b.type))).toEqual(['paragraph', 'rule:page', 'paragraph', 'rule', 'paragraph']);
  });

  it('reads Word breaks inside a paragraph and "page break before"', async () => {
    const body =
      '<w:p><w:r><w:t>Before</w:t></w:r><w:r><w:br w:type="page"/></w:r><w:r><w:t>After</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>New page</w:t></w:r></w:p>';
    const docx = writeZip([
      { path: '[Content_Types].xml', data: enc('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
      { path: '_rels/.rels', data: enc('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
      { path: 'word/document.xml', data: enc(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`) },
    ]);
    const doc = await readDocument('docx', docx);
    expect(doc.blocks).toEqual([paragraph('Before'), { type: 'rule', page: true }, paragraph('After'), { type: 'rule', page: true }, paragraph('New page')]);
  });

  it('writes standard markup', () => {
    const d = { ...emptyDocument(), blocks };
    expect(readZipText(readZip(writeDocument(d, 'docx')), 'word/document.xml')).toContain('<w:br w:type="page"/>');
    expect(readZipText(readZip(writeDocument(d, 'odt')), 'content.xml')).toContain('fo:break-after="page"');
    expect(new TextDecoder().decode(writeDocument(d, 'md'))).toContain('\n\\newpage\n');
  });
});
