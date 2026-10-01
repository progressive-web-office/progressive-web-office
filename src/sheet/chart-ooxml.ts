/** Charts in XLSX: DrawingML chart parts anchored by a drawing (SHEET-022). */
import { attr, children, descendants, parseXml, escapeXml as esc } from '../core/xml';
import { readZipText, type ZipEntries } from '../core/zip';
import { EMU_PER_PX, NS, readRels } from '../document/ooxml';
import { colName, parseRef, quoteSheet } from './address';
import { parseRange, type Range } from './chart';
import type { Chart, ChartType, Sheet } from './model';

const C_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const XDR_NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
export const REL_DRAWING = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
const REL_CHART = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
export const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';
export const CT_CHART = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';

/** Text content needs no escaped quotes; keep formulas readable (`'Sheet 1'!A1`). */
const escF = (f: string): string => esc(f).replace(/&apos;/g, "'");

const abs = (row: number, col: number): string => `$${colName(col)}$${row + 1}`;
const ref = (sheet: string, r1: number, c1: number, r2: number, c2: number): string =>
  `${quoteSheet(sheet)}!${abs(r1, c1)}${r1 === r2 && c1 === c2 ? '' : `:${abs(r2, c2)}`}`;

function seriesXml(chart: Chart, sheet: string, r: Range): string {
  const first = chart.headers ? r.r1 + 1 : r.r1;
  const withCategories = r.c2 > r.c1;
  const out: string[] = [];
  for (let col = withCategories ? r.c1 + 1 : r.c1, i = 0; col <= r.c2; col++, i++) {
    const tx = chart.headers ? `<c:tx><c:strRef><c:f>${escF(ref(sheet, r.r1, col, r.r1, col))}</c:f></c:strRef></c:tx>` : '';
    const values = `<c:numRef><c:f>${escF(ref(sheet, first, col, r.r2, col))}</c:f></c:numRef>`;
    const categories = withCategories ? ref(sheet, first, r.c1, r.r2, r.c1) : '';
    if (chart.type === 'scatter') {
      const x = withCategories ? `<c:xVal><c:numRef><c:f>${escF(categories)}</c:f></c:numRef></c:xVal>` : '';
      out.push(`<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr>${x}<c:yVal>${values}</c:yVal><c:smooth val="0"/></c:ser>`);
    } else {
      const cat = withCategories ? `<c:cat><c:strRef><c:f>${escF(categories)}</c:f></c:strRef></c:cat>` : '';
      out.push(`<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${cat}<c:val>${values}</c:val>${chart.type === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`);
    }
  }
  return out.join('');
}

const axes = (catPos: 'b' | 'l', valPos: 'b' | 'l', scatter: boolean): string =>
  `${scatter ? '<c:valAx>' : '<c:catAx>'}<c:axId val="1001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${catPos}"/><c:crossAx val="1002"/>${scatter ? '</c:valAx>' : '</c:catAx>'}` +
  `<c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${valPos}"/><c:majorGridlines/><c:crossAx val="1001"/></c:valAx>`;

export function chartXml(chart: Chart, sheet: string): string {
  const r = parseRange(chart.range) ?? { r1: 0, c1: 0, r2: 0, c2: 0 };
  const series = seriesXml(chart, sheet, r);
  let plot: string;
  switch (chart.type) {
    case 'line':
      plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="1001"/><c:axId val="1002"/></c:lineChart>${axes('b', 'l', false)}`;
      break;
    case 'pie':
      plot = `<c:pieChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/></c:pieChart>`;
      break;
    case 'scatter':
      plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${series}<c:axId val="1001"/><c:axId val="1002"/></c:scatterChart>${axes('b', 'l', true)}`;
      break;
    default: {
      const dir = chart.type === 'bar' ? 'bar' : 'col';
      plot = `<c:barChart><c:barDir val="${dir}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="80"/><c:axId val="1001"/><c:axId val="1002"/></c:barChart>${axes(dir === 'bar' ? 'l' : 'b', dir === 'bar' ? 'b' : 'l', false)}`;
    }
  }
  const title = chart.title?.trim()
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${esc(chart.title.trim())}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : '<c:autoTitleDeleted val="1"/>';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<c:chartSpace xmlns:c="${C_NS}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><c:roundedCorners val="0"/>` +
    `<c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`
  );
}

/** The drawing part placing charts `firstChart`… of a sheet, with its relationships. */
export function drawingXml(sheet: Sheet, firstChart: number): { xml: string; rels: string } {
  const anchors = (sheet.charts ?? []).map(
    (c, i) =>
      `<xdr:oneCellAnchor><xdr:from><xdr:col>${c.anchor.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.anchor.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
      `<xdr:ext cx="${Math.round(c.width * EMU_PER_PX)}" cy="${Math.round(c.height * EMU_PER_PX)}"/>` +
      `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${esc(c.title?.trim() || `Chart ${i + 1}`)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
      '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
      `<a:graphic><a:graphicData uri="${C_NS}"><c:chart xmlns:c="${C_NS}" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`,
  );
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<xdr:wsDr xmlns:xdr="${XDR_NS}" xmlns:a="${NS.a}" xmlns:r="${NS.r}">${anchors.join('')}</xdr:wsDr>`;
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<Relationships xmlns="${NS.rel}">` +
    (sheet.charts ?? []).map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_CHART}" Target="../charts/chart${firstChart + i}.xml"/>`).join('') +
    '</Relationships>';
  return { xml, rels };
}

// --- reading ------------------------------------------------------------------

const text = (el: Element | undefined): string => (el ? descendants(el, 't').map((t) => t.textContent ?? '').join('') : '');

/** `'Sheet 1'!$B$2:$B$4` -> range (sheet name ignored: charts read their own sheet). */
function refRange(f: string): Range | undefined {
  const cells = f.slice(f.lastIndexOf('!') + 1).replace(/\$/g, '');
  const [a, b = a] = cells.split(':');
  const p = a ? parseRef(a) : undefined;
  const q = b ? parseRef(b) : undefined;
  return p && q ? { r1: p.row, c1: p.col, r2: q.row, c2: q.col } : undefined;
}

export function readChartXml(xml: string): Omit<Chart, 'anchor' | 'width' | 'height'> | undefined {
  const doc = parseXml(xml);
  const plotArea = descendants(doc, 'plotArea')[0];
  if (!plotArea) return undefined;
  const plot = children(plotArea).find((el) => /Chart$/.test(el.localName));
  if (!plot) return undefined;
  let type: ChartType;
  if (plot.localName === 'lineChart' || plot.localName === 'line3DChart') type = 'line';
  else if (plot.localName === 'pieChart' || plot.localName === 'doughnutChart' || plot.localName === 'pie3DChart') type = 'pie';
  else if (plot.localName === 'scatterChart') type = 'scatter';
  else if (plot.localName === 'barChart' || plot.localName === 'bar3DChart') type = attr(children(plot, 'barDir')[0] ?? plot, 'val') === 'bar' ? 'bar' : 'column';
  else return undefined;
  let union: Range | undefined;
  let headers = false;
  for (const ser of children(plot, 'ser')) {
    const tx = children(ser, 'tx')[0];
    const parts = [tx, ...['cat', 'val', 'xVal', 'yVal'].map((n) => children(ser, n)[0])].filter((e): e is Element => !!e);
    if (tx && descendants(tx, 'f').length) headers = true;
    for (const part of parts) {
      const f = descendants(part, 'f')[0]?.textContent;
      const r = f ? refRange(f) : undefined;
      if (!r) continue;
      union = union ? { r1: Math.min(union.r1, r.r1), c1: Math.min(union.c1, r.c1), r2: Math.max(union.r2, r.r2), c2: Math.max(union.c2, r.c2) } : r;
    }
  }
  if (!union) return undefined;
  const range = `${colName(union.c1)}${union.r1 + 1}:${colName(union.c2)}${union.r2 + 1}`;
  const chartEl = descendants(doc, 'chart').find((el) => el.namespaceURI === C_NS && el.parentElement?.localName === 'chartSpace');
  const titleEl = chartEl ? children(chartEl, 'title')[0] : undefined;
  const title = text(titleEl).trim();
  return { type, ...(title ? { title } : {}), range, headers };
}

/** Charts of a worksheet, through its drawing part. */
export function readSheetCharts(zip: ZipEntries, sheetPath: string, sheetDoc: Document): Chart[] {
  const drawingRef = descendants(sheetDoc, 'drawing')[0];
  const rid = drawingRef ? (drawingRef.getAttributeNS(NS.r, 'id') ?? attr(drawingRef, 'id')) : null;
  if (!rid) return [];
  const rel = readRels(zip, sheetPath).get(rid);
  const drawingXmlText = rel ? readZipText(zip, rel.target) : undefined;
  if (!rel || !drawingXmlText) return [];
  const drawingRels = readRels(zip, rel.target);
  const out: Chart[] = [];
  for (const anchor of children(parseXml(drawingXmlText).documentElement)) {
    if (!/Anchor$/.test(anchor.localName)) continue;
    const chartRef = descendants(anchor, 'chart').find((el) => el.namespaceURI === C_NS);
    const chartRid = chartRef ? (chartRef.getAttributeNS(NS.r, 'id') ?? attr(chartRef, 'id')) : null;
    const chartRel = chartRid ? drawingRels.get(chartRid) : undefined;
    const xml = chartRel ? readZipText(zip, chartRel.target) : undefined;
    const chart = xml ? readChartXml(xml) : undefined;
    if (!chart) continue;
    const num = (parent: Element | undefined, name: string): number => Number(parent ? (children(parent, name)[0]?.textContent ?? 0) : 0);
    const from = children(anchor, 'from')[0];
    const to = children(anchor, 'to')[0];
    const ext = children(anchor, 'ext')[0] ?? descendants(anchor, 'ext').find((e) => e.parentElement?.localName === 'xfrm' && Number(attr(e, 'cx')) > 0);
    const col = num(from, 'col');
    const row = num(from, 'row');
    let width = Math.round(Number(attr(ext ?? anchor, 'cx') ?? 0) / EMU_PER_PX);
    let height = Math.round(Number(attr(ext ?? anchor, 'cy') ?? 0) / EMU_PER_PX);
    // Two-cell anchors: estimate the size from default column width / row height.
    if ((!width || !height) && to) {
      width = Math.max(160, (num(to, 'col') - col) * 64);
      height = Math.max(120, (num(to, 'row') - row) * 20);
    }
    out.push({ ...chart, anchor: { row, col }, width: width || 480, height: height || 300 });
  }
  return out;
}
