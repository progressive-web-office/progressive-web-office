import { describe, expect, it } from 'vitest';
import { readDocument, writeDocument } from '../src/document/io';
import { emptyDocument, paperName, paragraph, textHeight, type PageGeometry, type RichDocument } from '../src/document/model';
import { geometryOptions, parseGeometryOptions } from '../src/document/geometry';
import { readZip, readZipText } from '../src/core/zip';

const A5_LANDSCAPE: PageGeometry = { width: 210, height: 148, top: 15, right: 25, bottom: 15, left: 25 };
const doc = (geometry: PageGeometry): RichDocument => ({ ...emptyDocument(), blocks: [paragraph('Body')], page: { geometry } });

describe('DOC-046 paper and margins of a document', () => {
  it('names papers and works out the text height', () => {
    expect(paperName({ width: 297, height: 210 })).toBe('A4');
    expect(paperName({ width: 170, height: 240 })).toBeUndefined();
    expect(textHeight(A5_LANDSCAPE)).toBe(118);
  });

  it('reads and writes LaTeX geometry options', () => {
    expect(geometryOptions(A5_LANDSCAPE)).toBe('a5paper,landscape,top=15mm,right=25mm,bottom=15mm,left=25mm');
    expect(geometryOptions({ width: 170, height: 240, top: 20, right: 20, bottom: 20, left: 20 })).toBe('paperwidth=170mm,paperheight=240mm,margin=20mm');
    expect(parseGeometryOptions('a4paper,margin=2cm,left=3cm')).toEqual({ width: 210, height: 297, top: 20, right: 20, bottom: 20, left: 30 });
    expect(parseGeometryOptions('letterpaper, landscape, hmargin=1in')).toMatchObject({ width: 279.4, height: 215.9, left: 25.4, right: 25.4 });
  });

  it.each(['odt', 'docx', 'tex', 'md'] as const)('keeps the paper and margins in %s', async (format) => {
    const back = await readDocument(format, writeDocument(doc(A5_LANDSCAPE), format));
    expect(back.page?.geometry).toEqual(A5_LANDSCAPE);
  });

  it('writes the page as each format does', () => {
    const odt = readZipText(readZip(writeDocument(doc(A5_LANDSCAPE), 'odt')), 'styles.xml')!;
    expect(odt).toContain('fo:page-width="210mm" fo:page-height="148mm" style:print-orientation="landscape" fo:margin-top="15mm"');
    const docx = readZipText(readZip(writeDocument(doc(A5_LANDSCAPE), 'docx')), 'word/document.xml')!;
    expect(docx).toContain('<w:pgSz w:w="11906" w:h="8391" w:orient="landscape"/><w:pgMar w:top="850" w:right="1417"');
    const md = new TextDecoder().decode(writeDocument(doc(A5_LANDSCAPE), 'md'));
    expect(md).toContain('papersize: a5\ngeometry: "landscape,top=15mm,right=25mm,bottom=15mm,left=25mm"');
    const tex = new TextDecoder().decode(writeDocument(doc(A5_LANDSCAPE), 'tex'));
    expect(tex).toContain('\\usepackage[a5paper,landscape,top=15mm,right=25mm,bottom=15mm,left=25mm]{geometry}');
  });

  it('reads the paper of a LaTeX class option and of Pandoc front matter', async () => {
    const tex = await readDocument('tex', new TextEncoder().encode('\\documentclass[a5paper]{article}\n\\begin{document}\nx\n\\end{document}\n'));
    expect(tex.page?.geometry).toMatchObject({ width: 148, height: 210 });
    const md = await readDocument('md', new TextEncoder().encode('---\npapersize: letter\ngeometry: margin=1in\n---\n\nx\n'));
    expect(md.page?.geometry).toEqual({ width: 215.9, height: 279.4, top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 });
  });
});
