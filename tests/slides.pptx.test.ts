import { describe, expect, it } from 'vitest';
import { readPptx } from '../src/slides/pptx-reader';
import { writePptx } from '../src/slides/pptx-writer';
import { contentSlide, emptyPresentation, textShape, type Presentation } from '../src/slides/model';
import { addResource } from '../src/document/model';
import { detectFormat } from '../src/core/format';
import { readZip, readZipText } from '../src/core/zip';
import { parseXml } from '../src/core/xml';
import { makeZip } from './helpers';
import { PNG_1PX } from './fixtures';
import { zipSync, strToU8 } from 'fflate';

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rels = (items: [string, string, string][]) =>
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
const xfrm = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${x * 9525}" y="${y * 9525}"/><a:ext cx="${w * 9525}" cy="${h * 9525}"/></a:xfrm>`;

function fixture(): Uint8Array {
  const files: Record<string, string | Uint8Array> = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
    'ppt/presentation.xml': `<p:presentation ${A}><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels([['rId2', 'slide', 'slides/slide1.xml'], ['rId9', 'theme', 'theme/theme1.xml']]),
    'ppt/theme/theme1.xml': `<a:theme ${A}><a:themeElements><a:clrScheme name="x"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme></a:themeElements></a:theme>`,
    'ppt/slides/_rels/slide1.xml.rels': rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'image', '../media/image1.png'], ['rId3', 'notesSlide', '../notesSlides/notesSlide1.xml']]),
    'ppt/slideLayouts/slideLayout1.xml': `<p:sldLayout ${A}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(10, 20, 300, 50)}</p:spPr></p:sp></p:spTree></p:cSld></p:sldLayout>`,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]),
    'ppt/slideMasters/slideMaster1.xml': `<p:sldMaster ${A}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFEE"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(10, 100, 500, 300)}</p:spPr></p:sp></p:spTree></p:cSld></p:sldMaster>`,
    'ppt/notesSlides/notesSlide1.xml': `<p:notes ${A}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="n"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Speaker notes</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
    'ppt/media/image1.png': PNG_1PX,
    'ppt/slides/slide1.xml': `<p:sld ${A}><p:cSld><p:spTree>
      <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>
        <p:txBody><a:bodyPr anchor="ctr"/><a:p><a:pPr algn="ctr"/><a:r><a:rPr b="1" sz="4000"><a:solidFill><a:srgbClr val="C00000"/></a:solidFill></a:rPr><a:t>Hello</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>
        <p:txBody><a:bodyPr/><a:p><a:r><a:t>Point one</a:t></a:r></a:p><a:p><a:pPr lvl="1"/><a:r><a:rPr i="1" u="sng"/><a:t>Sub point</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:cNvPr id="4" name="Ellipse"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(600, 100, 100, 80)}<a:prstGeom prst="ellipse"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>
      <p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="G"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${100 * 9525}" y="${400 * 9525}"/><a:ext cx="${200 * 9525}" cy="${100 * 9525}"/><a:chOff x="0" y="0"/><a:chExt cx="${400 * 9525}" cy="${200 * 9525}"/></a:xfrm></p:grpSpPr>
        <p:sp><p:nvSpPr><p:cNvPr id="6" name="Box"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 400, 200)}<a:prstGeom prst="rect"/></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>In group</a:t></a:r></a:p></p:txBody></p:sp>
      </p:grpSp>
      <p:pic><p:nvPicPr><p:cNvPr id="7" name="Pic" descr="A pixel"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr>${xfrm(700, 300, 64, 64)}</p:spPr></p:pic>
    </p:spTree></p:cSld></p:sld>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
}

describe('PRES-001/003/010 PPTX reader', () => {
  it('reads slide size, shapes, placeholders inheritance, groups, pictures, theme colours and notes', () => {
    const pres = readPptx(fixture());
    expect(pres.width).toBe(960);
    expect(pres.height).toBe(720);
    const [slide] = pres.slides;
    expect(slide!.background).toBe('#ffffee');
    expect(slide!.notes).toBe('Speaker notes');
    const [title, body, ellipse, grouped, pic] = slide!.shapes;
    expect(title).toMatchObject({ kind: 'text', placeholder: 'title', x: 10, y: 20, width: 300, height: 50, anchor: 'middle' });
    expect(title!.paragraphs).toEqual([{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: 'Hello', bold: true, size: 40, color: '#c00000' }] }]);
    expect(body).toMatchObject({ placeholder: 'body', x: 10, y: 100, width: 500, height: 300 });
    expect(body!.paragraphs).toEqual([
      { type: 'paragraph', style: 'normal', list: { ordered: false, level: 0 }, runs: [{ text: 'Point one' }] },
      { type: 'paragraph', style: 'normal', list: { ordered: false, level: 1 }, runs: [{ text: 'Sub point', italic: true, underline: true }] },
    ]);
    expect(ellipse).toMatchObject({ kind: 'ellipse', fill: '#4472c4', x: 600, y: 100, width: 100, height: 80 });
    expect(grouped).toMatchObject({ kind: 'text', x: 100, y: 400, width: 200, height: 100 });
    expect(pic).toMatchObject({ kind: 'image', alt: 'A pixel', x: 700, y: 300, width: 64, height: 64 });
    expect(pres.resources.get(pic!.image!)?.mediaType).toBe('image/png');
  });

  it('FILE-004 rejects packages without ppt/presentation.xml', () => {
    expect(() => readPptx(makeZip({ 'x.txt': '' }))).toThrow(/presentation\.xml/);
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

describe('PRES-008 PPTX writer', () => {
  it('writes a well-formed package detected as pptx', () => {
    const bytes = writePptx(sample());
    expect(detectFormat('x', bytes)).toBe('pptx');
    const zip = readZip(bytes);
    for (const part of Object.keys(zip).filter((p) => p.endsWith('.xml') || p.endsWith('.rels'))) {
      expect(() => parseXml(readZipText(zip, part)!), part).not.toThrow();
    }
    for (const part of ['ppt/presentation.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml', 'ppt/slides/slide2.xml', 'ppt/notesSlides/notesSlide2.xml']) {
      expect(zip[part], part).toBeDefined();
    }
  });

  it('round-trips slides, shapes, text formatting, images, backgrounds and notes', () => {
    const pres = sample();
    const back = readPptx(writePptx(pres));
    expect(back.width).toBe(1280);
    expect(back.slides).toHaveLength(2);
    const strip = (p: Presentation) =>
      p.slides.map((s) => ({ ...s, shapes: s.shapes.map(({ id: _id, image, ...rest }) => ({ ...rest, image: image ? 'IMG' : undefined })) }));
    expect(strip(back)).toEqual(strip(pres));
  });
});
