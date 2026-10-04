/** XLSX writer (SHEET-009). */
import { escapeXml as esc } from '../core/xml';
import { writeZip } from '../core/zip';
import { APP_XML, coreXml, NS, REL } from '../document/ooxml';
import { parseKey, quoteSheet, refName } from './address';
import { hiddenRows } from './filter';
import { validationsXlsx } from './validation';
import { conditionalXlsx, dxfXml, type CondStyle } from './conditional';
import { Calculator } from './engine';
import { isError, type CellStyle, type Sheet, type Workbook } from './model';
import { BUILTIN_FORMATS, pxToWidth } from './xlsx-reader';
import { chartXml, CT_CHART, CT_DRAWING, drawingXml, REL_DRAWING } from './chart-ooxml';

/** Functions that Excel stores with a `_xlfn.` prefix. */
const FUTURE_FUNCTIONS = ['CONCAT', 'IFS', 'SWITCH', 'TEXTJOIN', 'MAXIFS', 'MINIFS', 'XLOOKUP', 'IFNA', 'XOR', 'DAYS', 'RANK.EQ', 'MODE.SNGL', 'PERCENTILE.INC', 'QUARTILE.INC', 'CEILING.MATH', 'FLOOR.MATH'];
const addFn = (f: string): string => f.replace(new RegExp(`(?<![\\w.])(${FUTURE_FUNCTIONS.map((n) => n.replace('.', '\\.')).join('|')})\\(`, 'g'), '_xlfn.$1(');

/** The sheet view: the selected tab and frozen panes (SHEET-017). */
function sheetViews(sheet: Sheet, selected: boolean): string {
  const f = sheet.freeze;
  const pane =
    f && (f.rows || f.cols)
      ? `<pane${f.cols ? ` xSplit="${f.cols}"` : ''}${f.rows ? ` ySplit="${f.rows}"` : ''} topLeftCell="${refName(f.rows, f.cols)}" activePane="${f.rows && f.cols ? 'bottomRight' : f.rows ? 'bottomLeft' : 'topRight'}" state="frozen"/>`
      : '';
  if (!selected && !pane) return '';
  return `<sheetViews><sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}${pane ? `>${pane}</sheetView>` : '/>'}</sheetViews>`;
}

const rangeRef = (r: { r1: number; c1: number; r2: number; c2: number }, abs = false): string => `${refName(r.r1, r.c1, abs, abs)}:${refName(r.r2, r.c2, abs, abs)}`;

/** The sheet's autofilter, its chosen values by column (SHEET-018). */
function autoFilterXml(sheet: Sheet): string {
  const f = sheet.filter;
  if (!f) return '';
  const columns = Object.entries(f.columns)
    .map(([c, values]) => {
      const blank = values.includes('');
      const items = values.filter((v) => v !== '').map((v) => `<filter val="${esc(v)}"/>`).join('');
      return `<filterColumn colId="${Number(c) - f.range.c1}"><filters${blank ? ' blank="1"' : ''}>${items}</filters></filterColumn>`;
    })
    .join('');
  return `<autoFilter ref="${rangeRef(f.range)}"${columns ? `>${columns}</autoFilter>` : '/>'}`;
}

function filterNames(wb: Workbook): string {
  const names = wb.sheets.flatMap((s, i) => (s.filter ? [`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(quoteSheet(s.name))}!${rangeRef(s.filter.range, true)}</definedName>`] : []));
  return names.length ? `<definedNames>${names.join('')}</definedNames>` : '';
}


const EXCEL_ERRORS = new Set(['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#GETTING_DATA']);
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
  // Number formats and cell formatting (SHEET-014) -> style indexes (0 = default).
  const builtinIds = new Map(Object.entries(BUILTIN_FORMATS).map(([id, code]) => [code, Number(id)]));
  const customFormats: { id: number; code: string }[] = [];
  const DEFAULT_FONT = '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>';
  const fonts = [DEFAULT_FONT];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  const indexOf = (list: string[], xml: string): number => {
    const i = list.indexOf(xml);
    return i >= 0 ? i : list.push(xml) - 1;
  };
  const argb = (hex: string): string => `FF${hex.slice(1).toUpperCase()}`;
  const xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  // SHEET-029: the differential formats of conditional formatting.
  const dxfs: string[] = [];
  const dxf = (s: CondStyle): number => indexOf(dxfs, dxfXml(s));
  const styleOf = new Map<string, number>();
  const style = (fmt: string | undefined, look: CellStyle | undefined): number => {
    if (!fmt && !look) return 0;
    const key = `${fmt ?? ''}|${JSON.stringify(look ?? {})}`;
    let s = styleOf.get(key);
    if (s === undefined) {
      let id = fmt ? builtinIds.get(fmt) : 0;
      if (id === undefined) {
        id = 164 + customFormats.length;
        customFormats.push({ id, code: fmt! });
      }
      const font = look && (look.bold || look.italic || look.underline || look.color)
        ? indexOf(fonts, `<font>${look.bold ? '<b/>' : ''}${look.italic ? '<i/>' : ''}${look.underline ? '<u/>' : ''}<sz val="11"/>${look.color ? `<color rgb="${argb(look.color)}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`)
        : 0;
      const fill = look?.fill ? indexOf(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(look.fill)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const side = (name: string): string => `<${name} style="thin"><color auto="1"/></${name}>`;
      const border = look?.border ? indexOf(borders, `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`) : 0;
      const apply = `${id ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}${look?.align ? ' applyAlignment="1"' : ''}`;
      const xf = `<xf numFmtId="${id}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${apply}`;
      s = xfs.length;
      xfs.push(look?.align ? `${xf}><alignment horizontal="${look.align}"/></xf>` : `${xf}/>`);
      styleOf.set(key, s);
    }
    return s;
  };

  const sheetXml = wb.sheets.map((sheet, si) => {
    const rows = new Map<number, [number, string][]>();
    for (const [key, cell] of sheet.cells) {
      const [r, c] = parseKey(key);
      const ref = refName(r, c);
      // UNIT-002: a formula giving a quantity is written with its unit in the number format.
      const s = style(cell.formula !== undefined ? calc.format(si, [r, c]) : cell.numFmt, cell.style);
      const sAttr = s ? ` s="${s}"` : '';
      let xml: string;
      if (cell.formula !== undefined) {
        const v = calc.value(si, [r, c]);
        const f = `<f>${esc(addFn(cell.formula))}</f>`;
        // Errors of this application only (#UNIT!) are #VALUE! for other spreadsheets.
        if (isError(v)) xml = `<c r="${ref}"${sAttr} t="e">${f}<v>${esc(EXCEL_ERRORS.has(v.error) ? v.error : '#VALUE!')}</v></c>`;
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
      } else if (sAttr) {
        // An empty cell that only carries formatting (SHEET-014).
        xml = `<c r="${ref}"${sAttr}/>`;
      } else {
        continue;
      }
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r)!.push([c, xml]);
    }
    // SHEET-018: rows hidden by the filter.
    const hidden = hiddenRows(wb, si, calc);
    const data = [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r, cells]) => `<row r="${r + 1}"${hidden.has(r) ? ' hidden="1"' : ''}>${cells.sort((a, b) => a[0] - b[0]).map(([, x]) => x).join('')}</row>`)
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
      sheetViews(sheet, si === 0) +
      `<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${data}</sheetData>${autoFilterXml(sheet)}${conditionalXlsx(sheet, dxf)}${validationsXlsx(sheet)}${sheet.charts?.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`
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
    '</sheets>' +
    // SHEET-018: Excel names the range of each autofilter.
    filterNames(wb) +
    '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';

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
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
    `<fills count="${fills.length}">${fills.join('')}</fills>` +
    `<borders count="${borders.length}">${borders.join('')}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    (dxfs.length ? `<dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs>` : '') +
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
