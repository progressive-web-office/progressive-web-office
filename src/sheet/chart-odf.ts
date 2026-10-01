/** Charts in ODS: ODF chart objects (`Object N/content.xml`) anchored in a cell (SHEET-022). */
import { attr, children, descendants, parseXml, escapeXml } from '../core/xml';
import { readZipText, type ZipEntries } from '../core/zip';
import { lengthToPx, ODF_NS, pxToIn } from '../document/odf';
import { colName, parseRef } from './address';
import { parseRange } from './chart';
import type { Chart, ChartType } from './model';

export const CHART_NS = 'urn:oasis:names:tc:opendocument:xmlns:chart:1.0';
export const CHART_MIME = 'application/vnd.oasis.opendocument.chart';

/** Escape for double-quoted attributes; quotes in sheet names stay readable (`'Sheet 1'.A1`). */
const esc = (s: string): string => escapeXml(s).replace(/&apos;/g, "'");

const CLASS: Record<ChartType, string> = { column: 'bar', bar: 'bar', line: 'line', pie: 'circle', scatter: 'scatter' };

/** `'Sheet name'.A1` – ODF cell address with the sheet always quoted. */
const addr = (sheet: string, row: number, col: number): string => `'${sheet.replace(/'/g, "''")}'.${colName(col)}${row + 1}`;
const range = (sheet: string, r1: number, c1: number, r2: number, c2: number): string => `${addr(sheet, r1, c1)}:${addr(sheet, r2, c2)}`;

/** The chart object document. */
export function chartObjectXml(chart: Chart, sheet: string): string {
  const r = parseRange(chart.range) ?? { r1: 0, c1: 0, r2: 0, c2: 0 };
  const first = chart.headers ? r.r1 + 1 : r.r1;
  const withCategories = r.c2 > r.c1;
  const cls = `chart:${CLASS[chart.type]}`;
  const categories = withCategories ? range(sheet, first, r.c1, r.r2, r.c1) : '';
  const series: string[] = [];
  for (let col = withCategories ? r.c1 + 1 : r.c1; col <= r.c2; col++) {
    const label = chart.headers ? ` chart:label-cell-address="${esc(addr(sheet, r.r1, col))}"` : '';
    const domain = chart.type === 'scatter' && categories ? `<chart:domain table:cell-range-address="${esc(categories)}"/>` : '';
    series.push(`<chart:series chart:values-cell-range-address="${esc(range(sheet, first, col, r.r2, col))}"${label} chart:class="${cls}">${domain}</chart:series>`);
  }
  const axes =
    chart.type === 'pie'
      ? ''
      : `<chart:axis chart:dimension="x" chart:name="primary-x">${categories && chart.type !== 'scatter' ? `<chart:categories table:cell-range-address="${esc(categories)}"/>` : ''}</chart:axis>` +
        '<chart:axis chart:dimension="y" chart:name="primary-y"><chart:grid chart:class="major"/></chart:axis>';
  const labels = chart.headers ? (withCategories ? 'both' : 'row') : withCategories ? 'column' : 'none';
  const title = chart.title?.trim() ? `<chart:title><text:p>${esc(chart.title.trim())}</text:p></chart:title>` : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<office:document-content xmlns:office="${ODF_NS.office}" xmlns:style="${ODF_NS.style}" xmlns:text="${ODF_NS.text}" xmlns:table="${ODF_NS.table}" xmlns:draw="${ODF_NS.draw}" xmlns:svg="${ODF_NS.svg}" xmlns:xlink="${ODF_NS.xlink}" xmlns:chart="${CHART_NS}" office:version="1.3">` +
    // ODF: chart:vertical="true" swaps the axes, i.e. horizontal bars.
    `<office:automatic-styles><style:style style:name="pa1" style:family="chart"><style:chart-properties chart:vertical="${chart.type === 'bar'}"/></style:style></office:automatic-styles>` +
    `<office:body><office:chart><chart:chart chart:class="${cls}" svg:width="${pxToIn(chart.width)}" svg:height="${pxToIn(chart.height)}">${title}` +
    '<chart:legend chart:legend-position="bottom"/>' +
    `<chart:plot-area chart:style-name="pa1" table:cell-range-address="${esc(range(sheet, r.r1, r.c1, r.r2, r.c2))}" chart:data-source-has-labels="${labels}">${axes}${series.join('')}</chart:plot-area>` +
    '</chart:chart></office:chart></office:body></office:document-content>'
  );
}

/** The frame placed in the anchor cell, pointing at `Object N`. */
export function chartFrameXml(chart: Chart, sheet: string, objectDir: string): string {
  const r = parseRange(chart.range);
  const ranges = r ? ` draw:notify-on-update-of-ranges="${esc(range(sheet, r.r1, r.c1, r.r2, r.c2))}"` : '';
  return (
    `<draw:frame draw:z-index="0" draw:name="${esc(chart.title?.trim() || objectDir)}" svg:width="${pxToIn(chart.width)}" svg:height="${pxToIn(chart.height)}" svg:x="0in" svg:y="0in">` +
    `<draw:object${ranges} xlink:href="./${esc(objectDir)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`
  );
}

/** A chart from a frame found in cell (row, col), when it embeds a chart object. */
export function readChartFrame(zip: ZipEntries, frame: Element, row: number, col: number): Chart | undefined {
  const object = children(frame, 'object')[0];
  const href = object ? (object.getAttributeNS(ODF_NS.xlink, 'href') ?? attr(object, 'href')) : null;
  if (!href) return undefined;
  const dir = href.replace(/^\.\//, '').replace(/\/$/, '');
  const xml = readZipText(zip, `${dir}/content.xml`);
  if (!xml) return undefined;
  const doc = parseXml(xml);
  const chartEl = descendants(doc, 'chart').find((el) => el.namespaceURI === CHART_NS && el.parentElement?.localName === 'chart');
  const plot = descendants(doc, 'plot-area')[0];
  if (!chartEl || !plot) return undefined;
  const cls = (attr(chartEl, 'class') ?? '').replace(/^chart:/, '');
  const verticalStyle = attr(plot, 'style-name');
  const vertical = !!verticalStyle && descendants(doc, 'style').some((st) => attr(st, 'name') === verticalStyle && descendants(st, 'chart-properties').some((p) => attr(p, 'vertical') === 'true'));
  const type: ChartType | undefined = cls === 'bar' ? (vertical ? 'bar' : 'column') : cls === 'line' ? 'line' : cls === 'circle' || cls === 'ring' ? 'pie' : cls === 'scatter' ? 'scatter' : undefined;
  if (!type) return undefined;
  // `'Sheet'.A1:'Sheet'.C4` (or `Sheet.$A$1:.$C$4`) -> A1:C4
  // Cell parts follow the last dot of each address; sheet names may hold spaces and dots.
  const cells = [...(attr(plot, 'cell-range-address') ?? '').matchAll(/\.\$?([A-Z]{1,3})\$?(\d+)(?=$|[:\s])/g)].slice(0, 2).map((m) => `${m[1]}${m[2]}`);
  const p = cells[0] ? parseRef(cells[0]) : undefined;
  const q = cells[1] ? parseRef(cells[1]) : p;
  if (!p || !q) return undefined;
  const labels = attr(plot, 'data-source-has-labels') ?? 'none';
  const title = descendants(children(chartEl, 'title')[0] ?? doc.createElement('x'), 'p')
    .map((e) => e.textContent ?? '')
    .join(' ')
    .trim();
  const width = Math.round(lengthToPx(attr(frame, 'width')) ?? lengthToPx(attr(chartEl, 'width')) ?? 480);
  const height = Math.round(lengthToPx(attr(frame, 'height')) ?? lengthToPx(attr(chartEl, 'height')) ?? 300);
  return {
    type,
    ...(title ? { title } : {}),
    range: `${colName(Math.min(p.col, q.col))}${Math.min(p.row, q.row) + 1}:${colName(Math.max(p.col, q.col))}${Math.max(p.row, q.row) + 1}`,
    headers: labels === 'both' || labels === 'row',
    anchor: { row, col },
    width,
    height,
  };
}
