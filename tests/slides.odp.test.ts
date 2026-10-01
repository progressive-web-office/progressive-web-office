import { describe, expect, it } from 'vitest';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { readOdp } from '../src/slides/odp-reader';
import { writeOdp } from '../src/slides/odp-writer';
import { contentSlide, emptyPresentation, textShape, type Presentation } from '../src/slides/model';
import { addResource } from '../src/document/model';
import { detectFormat } from '../src/core/format';
import { readZipText } from '../src/core/zip';
import { parseXml } from '../src/core/xml';
import { ODF_XMLNS } from '../src/document/odf';
import { PNG_1PX } from './fixtures';

function fixture(): Uint8Array {
  const styles = `<office:document-styles ${ODF_XMLNS}><office:automatic-styles>
    <style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="10in" fo:page-height="7.5in"/></style:page-layout>
  </office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>`;
  const content = `<office:document-content ${ODF_XMLNS}><office:automatic-styles>
    <style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#ffeedd"/></style:style>
    <style:style style:name="gr1" style:family="graphic"><style:graphic-properties draw:fill="solid" draw:fill-color="#ff0000" svg:stroke-color="#000000" draw:stroke="solid"/></style:style>
    <style:style style:name="P1" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/></style:style>
    <style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold" fo:font-size="40pt" fo:color="#c00000"/></style:style>
    <text:list-style style:name="L1"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/><text:list-level-style-number text:level="2"/></text:list-style>
  </office:automatic-styles><office:body><office:presentation>
    <draw:page draw:name="page1" draw:style-name="dp1" draw:master-page-name="Default">
      <draw:frame presentation:class="title" svg:x="1in" svg:y="0.5in" svg:width="8in" svg:height="1in"><draw:text-box><text:p text:style-name="P1"><text:span text:style-name="T1">Hello</text:span></text:p></draw:text-box></draw:frame>
      <draw:frame presentation:class="outline" svg:x="1in" svg:y="2in" svg:width="8in" svg:height="4in"><draw:text-box>
        <text:list text:style-name="L1"><text:list-item><text:p>Point</text:p><text:list><text:list-item><text:p>Numbered</text:p></text:list-item></text:list></text:list-item></text:list>
      </draw:text-box></draw:frame>
      <draw:rect draw:style-name="gr1" svg:x="0in" svg:y="6in" svg:width="1in" svg:height="0.5in"><text:p>Box</text:p></draw:rect>
      <draw:custom-shape draw:style-name="gr1" svg:x="2in" svg:y="6in" svg:width="1in" svg:height="1in"><draw:enhanced-geometry draw:type="ellipse"/></draw:custom-shape>
      <draw:frame svg:x="5in" svg:y="5in" svg:width="1in" svg:height="1in"><draw:image xlink:href="Pictures/p.png"/><svg:desc>A pixel</svg:desc></draw:frame>
      <presentation:notes><draw:frame presentation:class="notes" svg:x="0in" svg:y="0in" svg:width="1in" svg:height="1in"><draw:text-box><text:p>Speaker notes</text:p></draw:text-box></draw:frame></presentation:notes>
    </draw:page>
  </office:presentation></office:body></office:document-content>`;
  return zipSync({
    mimetype: strToU8('application/vnd.oasis.opendocument.presentation'),
    'content.xml': strToU8(content),
    'styles.xml': strToU8(styles),
    'Pictures/p.png': PNG_1PX,
  });
}

describe('PRES-002 ODP reader', () => {
  it('reads page size, frames, text formatting, lists, shapes, images, backgrounds and notes', () => {
    const pres = readOdp(fixture());
    expect(pres.width).toBe(960);
    expect(pres.height).toBe(720);
    const [slide] = pres.slides;
    expect(slide!.background).toBe('#ffeedd');
    expect(slide!.notes).toBe('Speaker notes');
    const [title, body, rect, ellipse, image] = slide!.shapes;
    expect(title).toMatchObject({ kind: 'text', placeholder: 'title', x: 96, y: 48, width: 768, height: 96 });
    expect(title!.paragraphs).toEqual([{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: 'Hello', bold: true, size: 40, color: '#c00000' }] }]);
    expect(body!.paragraphs).toEqual([
      { type: 'paragraph', style: 'normal', list: { ordered: false, level: 0 }, runs: [{ text: 'Point' }] },
      { type: 'paragraph', style: 'normal', list: { ordered: true, level: 1 }, runs: [{ text: 'Numbered' }] },
    ]);
    expect(rect).toMatchObject({ kind: 'rect', fill: '#ff0000', line: '#000000' });
    expect(rect!.paragraphs[0]!.runs).toEqual([{ text: 'Box' }]);
    expect(ellipse).toMatchObject({ kind: 'ellipse', x: 192, y: 576, width: 96, height: 96 });
    expect(image).toMatchObject({ kind: 'image', alt: 'A pixel' });
  });
});

function sample(): Presentation {
  const pres = emptyPresentation();
  const img = addResource(pres, PNG_1PX, 'image/png');
  const slide2 = contentSlide();
  slide2.background = '#102030';
  slide2.notes = 'Remember the demo';
  slide2.shapes.push(
    textShape('Red box', { kind: 'rect', fill: '#ff0000', line: '#000000', x: 100, y: 500, width: 200, height: 100, anchor: 'middle' }),
    { ...textShape('', { kind: 'ellipse', fill: '#00ff00', x: 400, y: 500, width: 120, height: 120 }), paragraphs: [] },
    { ...textShape('', { kind: 'image', image: img, alt: 'pixel', x: 600, y: 500, width: 50, height: 50 }), paragraphs: [] },
  );
  slide2.shapes[1]!.paragraphs.push({ type: 'paragraph', style: 'normal', list: { ordered: true, level: 1 }, runs: [{ text: 'Numbered', bold: true, size: 20, color: '#336699' }] });
  pres.slides.push(slide2);
  return pres;
}

describe('PRES-008 ODP writer', () => {
  it('writes a valid ODF presentation package', () => {
    const bytes = writeOdp(sample());
    expect(detectFormat('x', bytes)).toBe('odp');
    expect(new TextDecoder().decode(bytes.subarray(30, 38))).toBe('mimetype');
    const zip = unzipSync(bytes);
    for (const part of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) {
      expect(() => parseXml(readZipText(zip, part)!), part).not.toThrow();
    }
  });

  it('round-trips slides, shapes, text formatting, images, backgrounds and notes', () => {
    const pres = sample();
    const back = readOdp(writeOdp(pres));
    expect(back.width).toBe(1280);
    const strip = (p: Presentation) =>
      p.slides.map((s) => ({ ...s, shapes: s.shapes.map(({ id: _id, image, ...rest }) => ({ ...rest, image: image ? 'IMG' : undefined })) }));
    expect(strip(back)).toEqual(strip(pres));
  });
});
