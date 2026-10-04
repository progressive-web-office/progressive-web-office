import { describe, expect, it } from 'vitest';
import { readZip, readZipText } from '../src/core/zip';
import { readDocx } from '../src/document/docx-reader';
import { svgSize, writeDocx } from '../src/document/docx-writer';
import { writeLatex } from '../src/document/latex-writer';
import { addResource, emptyDocument, type RichDocument } from '../src/document/model';
import { emptyDrawing } from '../src/draw/model';
import { toSvg } from '../src/draw/svg';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

function withDrawing(): { doc: RichDocument; key: string; svg: string } {
  const doc = emptyDocument();
  const d = emptyDrawing(300, 120);
  d.shapes.push({ id: 'a', kind: 'rect', x: 10, y: 10, w: 50, h: 30 });
  const svg = toSvg(d);
  const key = addResource(doc, new TextEncoder().encode(svg), 'image/svg+xml', 'drawing.svg');
  doc.blocks = [{ type: 'paragraph', style: 'normal', runs: [{ image: key, alt: 'A box', width: 300, height: 120 }] }];
  return { doc, key, svg };
}

describe('DRAW-007 drawings in other formats', () => {
  it('reads the size of an SVG picture', () => {
    expect(svgSize(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120">'))).toEqual({ width: 300, height: 120 });
    expect(svgSize(new TextEncoder().encode('<svg viewBox="0 0 64 32">'))).toEqual({ width: 64, height: 32 });
    expect(svgSize(new TextEncoder().encode('<html>'))).toBeUndefined();
  });

  it('gives Word a PNG version with the SVG beside it, and reads the SVG back', () => {
    const { doc, key, svg } = withDrawing();
    const bytes = writeDocx(doc, { svgPng: new Map([[key, PNG]]) });
    const zip = readZip(bytes);
    expect(Object.keys(zip)).toEqual(expect.arrayContaining(['word/media/image1.svg', 'word/media/image1.png']));
    const xml = readZipText(zip, 'word/document.xml')!;
    expect(xml).toMatch(/<a:blip r:embed="rId\d+"><a:extLst><a:ext uri="\{96DAC541-7B7A-43D3-8B79-37D633B846F1\}"><asvg:svgBlip [^>]*r:embed="rId\d+"\/>/);
    expect(readZipText(zip, '[Content_Types].xml')).toContain('Extension="png"');
    const back = readDocx(bytes);
    const res = [...back.resources.values()][0]!;
    expect(res.mediaType).toBe('image/svg+xml');
    expect(new TextDecoder().decode(res.data)).toBe(svg);
  });

  it('keeps the SVG alone when no PNG could be made', () => {
    const { doc } = withDrawing();
    const zip = readZip(writeDocx(doc));
    expect(Object.keys(zip).filter((p) => p.startsWith('word/media/'))).toEqual(['word/media/image1.svg']);
  });

  it('shows the PNG version in LaTeX, the SVG kept beside it', () => {
    const { doc, key } = withDrawing();
    const out = writeLatex(doc, { svgPng: new Map([[key, PNG]]) });
    expect(out.tex).toContain(`\\includegraphics[width=0.5\\linewidth]{images/${key}.png}`);
    expect([...out.images.keys()]).toEqual([`images/${key}.svg`, `images/${key}.png`]);
  });
});
