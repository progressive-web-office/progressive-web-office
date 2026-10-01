/** XLSX writer (SHEET-009). */
import { escapeXml as esc } from '../core/xml';
import { writeZip } from '../core/zip';
import { APP_XML, coreXml, NS, REL } from '../document/ooxml';
import { parseKey, refName } from './address';
import { Calculator } from './engine';
import { isError, type Workbook } from './model';
import { BUILTIN_FORMATS, pxToWidth } from './xlsx-reader';
import { chartXml, CT_CHART, CT_DRAWING, drawingXml, REL_DRAWING } from './chart-ooxml';

/** Functions that Excel stores with a `_xlfn.` prefix. */
const FUTURE_FUNCTIONS = ['CONCAT', 'IFS', 'SWITCH', 'TEXTJOIN', 'MAXIFS', 'MINIFS', 'XLOOKUP'];
const addFn = (f: string): string => f.replace(new RegExp(`\\b(${FUTURE_FUNCTIONS.join('|')})\\(`, 'g'), '_xlfn.$1(');

export function writeXlsx(wb: Workbook): Uint8Array {
  const calc = new Calculator(wb);
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const sst = (s: string): number => {
    let i = stringIndex.get(s);
    if (i === undefined) {
      i = strings.length;
      strings.push(s);
      stringIndex.set(s, i);
    }
    return i;
  };
  // Number formats -> style indexes (0 = default).
  const builtinIds = new Map(Object.entries(BUILTIN_FORMATS).map(([id, code]) => [code, Number(id)]));
  const customFormats: { id: number; code: string }[] = [];
  const xfs: number[] = [0];
  const styleOf = new Map<string, number>();
  const style = (fmt: string | undefined): number => {
    if (!fmt) return 0;
    let s = styleOf.get(fmt);
    if (s === undefined) {
      let id = builtinIds.get(fmt);
      if (id === undefined) {
        id = 164 + customFormats.length;
        customFormats.push({ id, code: fmt });
      }
      s = xfs.length;
      xfs.push(id);
      styleOf.set(fmt, s);
    }
    return s;
  };

  const sheetXml = wb.sheets.map((sheet, si) => {
    const rows = new Map<number, [number, string][]>();
    for (const [key, cell] of sheet.cells) {
      const [r, c] = parseKey(key);
      const ref = refName(r, c);
      const s = style(cell.numFmt);
      const sAttr = s ? ` s="${s}"` : '';
      let xml: string;
      if (cell.formula !== undefined) {
        const v = calc.value(si, [r, c]);
        const f = `<f>${esc(addFn(cell.formula))}</f>`;
        if (isError(v)) xml = `<c r="${ref}"${sAttr} t="e">${f}<v>${esc(v.error)}</v></c>`;
        else if (typeof v === 'number') xml = `<c r="${ref}"${sAttr}>${f}<v>${v}</v></c>`;
        else if (typeof v === 'boolean') xml = `<c r="${ref}"${sAttr} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
        else if (typeof v === 'string') xml = `<c r="${ref}"${sAttr} t="str">${f}<v>${esc(v)}</v></c>`;
        else xml = `<c r="${ref}"${sAttr}>${f}</c>`;
      } else if (typeof cell.value === 'number') {
        xml = `<c r="${ref}"${sAttr}><v>${cell.value}</v></c>`;
      } else if (typeof cell.value === 'boolean') {
        xml = `<c r="${ref}"${sAttr} t="b"><v>${cell.value ? 1 : 0}</v></c>`;
      } else if (typeof cell.value === 'string') {
        xml = `<c r="${ref}"${sAttr} t="s"><v>${sst(cell.value)}</v></c>`;
      } else {
        continue;
      }
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r)!.push([c, xml]);
    }
    const data = [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r, cells]) => `<row r="${r + 1}">${cells.sort((a, b) => a[0] - b[0]).map(([, x]) => x).join('')}</row>`)
      .join('');
    const cols = sheet.colWidths?.size
      ? `<cols>${[...sheet.colWidths.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([c, px]) => `<col min="${c + 1}" max="${c + 1}" width="${pxToWidth(px)}" customWidth="1"/>`)
          .join('')}</cols>`
      : '';
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS.r}">` +
      `${si === 0 ? '<sheetViews><sheetView workbookViewId="0" tabSelected="1"/></sheetViews>' : ''}` +
      `<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${data}</sheetData>${sheet.charts?.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`
    );
  });

  // SHEET-022: one drawing per sheet with charts, one chart part per chart.
  const drawingParts: { path: string; data: string }[] = [];
  const chartParts: { path: string; data: string }[] = [];
  const sheetRels: { path: string; data: string }[] = [];
  wb.sheets.forEach((sheet, si) => {
    if (!sheet.charts?.length) return;
    const d = drawingParts.length + 1;
    const { xml, rels } = drawingXml(sheet, chartParts.length + 1);
    drawingParts.push({ path: `xl/drawings/drawing${d}.xml`, data: xml }, { path: `xl/drawings/_rels/drawing${d}.xml.rels`, data: rels });
    for (const chart of sheet.charts) chartParts.push({ path: `xl/charts/chart${chartParts.length + 1}.xml`, data: chartXml(chart, sheet.name) });
    sheetRels.push({
      path: `xl/worksheets/_rels/sheet${si + 1}.xml.rels`,
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${REL_DRAWING}" Target="../drawings/drawing${d}.xml"/></Relationships>`,
    });
  });

  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS.r}">` +
    '<bookViews><workbookView/></bookViews><sheets>' +
    wb.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';

  const n = wb.sheets.length;
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<Relationships xmlns="${NS.rel}">` +
    wb.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL.worksheet}" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="${REL.styles}" Target="styles.xml"/>` +
    `<Relationship Id="rId${n + 2}" Type="${REL.sharedStrings}" Target="sharedStrings.xml"/>` +
    '</Relationships>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (customFormats.length
      ? `<numFmts count="${customFormats.length}">${customFormats.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${esc(f.code)}"/>`).join('')}</numFmts>`
      : '') +
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.map((id) => `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0"${id ? ' applyNumberFormat="1"' : ''}/>`).join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const sstXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
    strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') +
    '</sst>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<Types xmlns="${NS.ct}">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    wb.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    drawingParts.filter((p) => !p.path.includes('_rels')).map((p) => `<Override PartName="/${p.path}" ContentType="${CT_DRAWING}"/>`).join('') +
    chartParts.map((p) => `<Override PartName="/${p.path}" ContentType="${CT_CHART}"/>`).join('') +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<Relationships xmlns="${NS.rel}">` +
    `<Relationship Id="rId1" Type="${REL.officeDocument}" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="${REL.coreProps}" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="${REL.extendedProps}" Target="docProps/app.xml"/>` +
    '</Relationships>';

  return writeZip([
    { path: '[Content_Types].xml', data: contentTypes },
    { path: '_rels/.rels', data: rootRels },
    { path: 'docProps/core.xml', data: coreXml({}, esc) },
    { path: 'docProps/app.xml', data: APP_XML },
    { path: 'xl/workbook.xml', data: workbookXml },
    { path: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { path: 'xl/styles.xml', data: stylesXml },
    { path: 'xl/sharedStrings.xml', data: sstXml },
    ...sheetXml.map((data, i) => ({ path: `xl/worksheets/sheet${i + 1}.xml`, data })),
    ...sheetRels,
    ...drawingParts,
    ...chartParts,
  ]);
}
