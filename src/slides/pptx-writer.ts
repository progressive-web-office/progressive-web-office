/** PowerPoint (.pptx) writer (PRES-008, PRES-010). */
import { escapeXml as esc } from '../core/xml';
import { writeZip, type ZipEntryInput } from '../core/zip';
import { extensionForType, isTextRun, type Paragraph } from '../document/model';
import { APP_XML, coreXml, EMU_PER_PX, NS, REL } from '../document/ooxml';
import type { Presentation, Shape, Slide } from './model';

const emu = (px: number): number => Math.round(px * EMU_PER_PX);
const XMLNS = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
const HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const GROUP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const srgb = (c: string): string => `<a:solidFill><a:srgbClr val="${c.replace('#', '').toUpperCase()}"/></a:solidFill>`;
const rels = (items: { id: string; type: string; target: string }[]): string =>
  HEADER +
  `<Relationships xmlns="${NS.rel}">` +
  items.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(r.target)}"/>`).join('') +
  '</Relationships>';

function xfrm(s: Shape): string {
  return `<a:xfrm><a:off x="${emu(s.x)}" y="${emu(s.y)}"/><a:ext cx="${emu(s.width)}" cy="${emu(s.height)}"/></a:xfrm>`;
}

function paragraphXml(p: Paragraph): string {
  let pPr = '';
  const attrs: string[] = [];
  if (p.align && p.align !== 'left') attrs.push(`algn="${{ center: 'ctr', right: 'r', justify: 'just' }[p.align]}"`);
  if (p.list) {
    const level = Math.min(8, p.list.level);
    attrs.push(`marL="${342900 + level * 457200}"`, 'indent="-342900"');
    if (level) attrs.push(`lvl="${level}"`);
    pPr = p.list.ordered ? '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/>' : '<a:buFont typeface="Arial"/><a:buChar char="•"/>';
  } else {
    pPr = '<a:buNone/>';
  }
  let runs = '';
  for (const r of p.runs) {
    if (!isTextRun(r)) continue;
    const a = ['lang="en-US"', 'dirty="0"'];
    if (r.size) a.push(`sz="${Math.round(r.size * 100)}"`);
    if (r.bold) a.push('b="1"');
    if (r.italic) a.push('i="1"');
    if (r.underline) a.push('u="sng"');
    if (r.strike) a.push('strike="sngStrike"');
    const rPr = `<a:rPr ${a.join(' ')}${r.color ? `>${srgb(r.color)}</a:rPr>` : '/>'}`;
    r.text.split('\n').forEach((part, i) => {
      if (i > 0) runs += `<a:br>${rPr}</a:br>`;
      if (part) runs += `<a:r>${rPr}<a:t>${esc(part)}</a:t></a:r>`;
    });
  }
  return `<a:p><a:pPr${attrs.length ? ' ' + attrs.join(' ') : ''}>${pPr}</a:pPr>${runs}</a:p>`;
}

function txBody(s: Shape): string {
  const anchor = s.anchor ? ` anchor="${{ top: 't', middle: 'ctr', bottom: 'b' }[s.anchor]}"` : '';
  const sz = Math.round(s.fontSize * 100);
  const levels = [1, 2, 3, 4, 5].map((l) => `<a:lvl${l}pPr><a:defRPr sz="${sz}"/></a:lvl${l}pPr>`).join('');
  const paras = s.paragraphs.length ? s.paragraphs.map(paragraphXml).join('') : '<a:p><a:endParaRPr lang="en-US"/></a:p>';
  return `<p:txBody><a:bodyPr wrap="square" rtlCol="0"${anchor}><a:normAutofit/></a:bodyPr><a:lstStyle>${levels}</a:lstStyle>${paras}</p:txBody>`;
}

const PH_TYPES: Record<string, string> = { title: 'title', subtitle: 'subTitle', body: 'body' };

function shapeXml(s: Shape, id: number, imageRid?: string): string {
  if (s.kind === 'image') {
    if (!imageRid) return '';
    return (
      `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}" descr="${esc(s.alt ?? '')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="${imageRid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr>${xfrm(s)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
    );
  }
  const ph = s.placeholder ? `<p:ph type="${PH_TYPES[s.placeholder]}"${s.placeholder === 'title' ? '' : ` idx="${s.placeholder === 'subtitle' ? 1 : 2}"`}/>` : '';
  const txBox = s.kind === 'text' && !s.placeholder ? ' txBox="1"' : '';
  const geom = s.kind === 'ellipse' ? 'ellipse' : 'rect';
  const fill = s.fill ? srgb(s.fill) : '<a:noFill/>';
  const line = s.line ? `<a:ln w="12700">${srgb(s.line)}</a:ln>` : s.kind === 'text' ? '' : '<a:ln><a:noFill/></a:ln>';
  const text = s.kind === 'text' || s.paragraphs.length ? txBody(s) : '';
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${s.placeholder ?? s.kind} ${id}"/><p:cNvSpPr${txBox}/><p:nvPr>${ph}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xfrm(s)}<a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr>${text}</p:sp>`
  );
}

function notesXml(text: string): string {
  const paras = text
    .split('\n')
    .map((l) => (l ? `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(l)}</a:t></a:r></a:p>` : '<a:p/>'))
    .join('');
  return (
    HEADER +
    `<p:notes ${XMLNS}><p:cSld><p:spTree>${GROUP}` +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
    `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>` +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'
  );
}

const CLR_MAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

function themeXml(name: string): string {
  const solid = (c: string) => `<a:solidFill><a:schemeClr val="${c}"/></a:solidFill>`;
  const ln = (w: number) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${solid('phClr')}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  return (
    HEADER +
    `<a:theme xmlns:a="${NS.a}" name="${name}"><a:themeElements>` +
    '<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1>' +
    '<a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink>' +
    '<a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
    '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="Office">' +
    `<a:fillStyleLst>${solid('phClr')}${solid('phClr')}${solid('phClr')}</a:fillStyleLst>` +
    `<a:lnStyleLst>${ln(6350)}${ln(12700)}${ln(19050)}</a:lnStyleLst>` +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    `<a:bgFillStyleLst>${solid('phClr')}${solid('phClr')}${solid('phClr')}</a:bgFillStyleLst>` +
    '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'
  );
}

export function writePptx(pres: Presentation): Uint8Array {
  const entries: ZipEntryInput[] = [];
  const media = new Map<string, string>(); // resource key -> ppt/media path
  const n = pres.slides.length;
  const notesCount = pres.slides.filter((s) => s.notes).length;

  pres.slides.forEach((slide: Slide, i) => {
    const slideRels = [{ id: 'rId1', type: REL.slideLayout, target: '../slideLayouts/slideLayout1.xml' }];
    let shapes = '';
    let nextId = 2;
    for (const s of slide.shapes) {
      let rid: string | undefined;
      if (s.kind === 'image' && s.image) {
        const res = pres.resources.get(s.image);
        if (res) {
          let path = media.get(s.image);
          if (!path) {
            path = `ppt/media/image${media.size + 1}.${extensionForType(res.mediaType)}`;
            media.set(s.image, path);
            entries.push({ path, data: res.data, store: true });
          }
          rid = `rId${slideRels.length + 1}`;
          slideRels.push({ id: rid, type: REL.image, target: `../media/${path.slice(path.lastIndexOf('/') + 1)}` });
        }
      }
      shapes += shapeXml(s, nextId++, rid);
    }
    if (slide.notes) {
      slideRels.push({ id: `rId${slideRels.length + 1}`, type: REL.notesSlide, target: `../notesSlides/notesSlide${i + 1}.xml` });
      entries.push(
        { path: `ppt/notesSlides/notesSlide${i + 1}.xml`, data: notesXml(slide.notes) },
        {
          path: `ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`,
          data: rels([
            { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster', target: '../notesMasters/notesMaster1.xml' },
            { id: 'rId2', type: REL.slide, target: `../slides/slide${i + 1}.xml` },
          ]),
        },
      );
    }
    const bg = slide.background ? `<p:bg><p:bgPr>${srgb(slide.background)}<a:effectLst/></p:bgPr></p:bg>` : '';
    entries.push(
      {
        path: `ppt/slides/slide${i + 1}.xml`,
        data: HEADER + `<p:sld ${XMLNS}><p:cSld>${bg}<p:spTree>${GROUP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
      },
      { path: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: rels(slideRels) },
    );
  });

  const presRels = [
    { id: 'rId1', type: REL.slideMaster, target: 'slideMasters/slideMaster1.xml' },
    { id: 'rId2', type: REL.theme, target: 'theme/theme1.xml' },
    ...pres.slides.map((_, i) => ({ id: `rId${i + 3}`, type: REL.slide, target: `slides/slide${i + 1}.xml` })),
  ];
  const notesMasterRid = `rId${n + 3}`;
  if (notesCount) presRels.push({ id: notesMasterRid, type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster', target: 'notesMasters/notesMaster1.xml' });

  const presentation =
    HEADER +
    `<p:presentation ${XMLNS} saveSubsetFonts="1">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    (notesCount ? `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRid}"/></p:notesMasterIdLst>` : '') +
    `<p:sldIdLst>${pres.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst>` +
    `<p:sldSz cx="${emu(pres.width)}" cy="${emu(pres.height)}"/><p:notesSz cx="6858000" cy="9144000"/>` +
    '</p:presentation>';

  const master =
    HEADER +
    `<p:sldMaster ${XMLNS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld>` +
    `${CLR_MAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
    '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>' +
    '<p:bodyStyle><a:lvl1pPr><a:defRPr sz="2400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle>' +
    '<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>';
  const layout =
    HEADER +
    `<p:sldLayout ${XMLNS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const notesMaster =
    HEADER +
    `<p:notesMaster ${XMLNS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld>${CLR_MAP}</p:notesMaster>`;

  const ct = (part: string, type: string) => `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`;
  const exts = new Set([...media.values()].map((p) => p.slice(p.lastIndexOf('.') + 1)));
  const imageTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', bin: 'application/octet-stream' };
  const contentTypes =
    HEADER +
    `<Types xmlns="${NS.ct}">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    [...exts].map((e) => `<Default Extension="${e}" ContentType="${imageTypes[e] ?? 'application/octet-stream'}"/>`).join('') +
    ct('ppt/presentation.xml', 'presentationml.presentation.main') +
    ct('ppt/slideMasters/slideMaster1.xml', 'presentationml.slideMaster') +
    ct('ppt/slideLayouts/slideLayout1.xml', 'presentationml.slideLayout') +
    ct('ppt/theme/theme1.xml', 'theme') +
    pres.slides.map((_, i) => ct(`ppt/slides/slide${i + 1}.xml`, 'presentationml.slide')).join('') +
    (notesCount ? ct('ppt/notesMasters/notesMaster1.xml', 'presentationml.notesMaster') + ct('ppt/theme/theme2.xml', 'theme') : '') +
    pres.slides.map((s, i) => (s.notes ? ct(`ppt/notesSlides/notesSlide${i + 1}.xml`, 'presentationml.notesSlide') : '')).join('') +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';

  return writeZip([
    { path: '[Content_Types].xml', data: contentTypes },
    {
      path: '_rels/.rels',
      data: rels([
        { id: 'rId1', type: REL.officeDocument, target: 'ppt/presentation.xml' },
        { id: 'rId2', type: REL.coreProps, target: 'docProps/core.xml' },
        { id: 'rId3', type: REL.extendedProps, target: 'docProps/app.xml' },
      ]),
    },
    { path: 'docProps/core.xml', data: coreXml(pres.meta, esc) },
    { path: 'docProps/app.xml', data: APP_XML },
    { path: 'ppt/presentation.xml', data: presentation },
    { path: 'ppt/_rels/presentation.xml.rels', data: rels(presRels) },
    { path: 'ppt/slideMasters/slideMaster1.xml', data: master },
    { path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([{ id: 'rId1', type: REL.slideLayout, target: '../slideLayouts/slideLayout1.xml' }, { id: 'rId2', type: REL.theme, target: '../theme/theme1.xml' }]) },
    { path: 'ppt/slideLayouts/slideLayout1.xml', data: layout },
    { path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([{ id: 'rId1', type: REL.slideMaster, target: '../slideMasters/slideMaster1.xml' }]) },
    { path: 'ppt/theme/theme1.xml', data: themeXml('Office Theme') },
    ...(notesCount
      ? [
          { path: 'ppt/notesMasters/notesMaster1.xml', data: notesMaster },
          { path: 'ppt/notesMasters/_rels/notesMaster1.xml.rels', data: rels([{ id: 'rId1', type: REL.theme, target: '../theme/theme2.xml' }]) },
          { path: 'ppt/theme/theme2.xml', data: themeXml('Notes Theme') },
        ]
      : []),
    ...entries,
  ]);
}
