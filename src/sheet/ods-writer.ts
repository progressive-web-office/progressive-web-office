/** OpenDocument Spreadsheet (.ods) writer (SHEET-009). */
import { escapeXml as esc } from '../core/xml';
import { writeZip } from '../core/zip';
import { MIME_TYPES } from '../core/format';
import { manifestXml, metaXml, ODF_XMLNS, pxToIn } from '../document/odf';
import { parseKey, quoteSheet, refName } from './address';
import { hiddenRows } from './filter';
import { Calculator, formatGeneral } from './engine';
import { isError, serialToDate, usedSize, type Cell, type CellStyle, type Value, type Workbook } from './model';
import { isDateFormat } from './number-format';
import { excelToOf } from './openformula';
import { chartFrameXml, chartObjectXml, CHART_MIME } from './chart-odf';

/** ODF data style XML for a number format code. */
function dataStyle(name: string, fmt: string): string {
  if (isDateFormat(fmt)) {
    const isTime = !/[yd]/i.test(fmt.replace(/"[^"]*"/g, '')) && /[hs]/i.test(fmt);
    const tag = isTime ? 'time-style' : 'date-style';
    let body = '';
    const re = /yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|"[^"]*"|./gi;
    let m: RegExpExecArray | null;
    const tokens: string[] = [];
    while ((m = re.exec(fmt))) tokens.push(m[0]);
    const hasHours = tokens.some((t) => /^h+$/i.test(t));
    tokens.forEach((t, i) => {
      const lower = t.toLowerCase();
      const minute = (lower === 'mm' || lower === 'm') && hasHours && (/^h+$/i.test(tokens[i - 2] ?? '') || /^s+$/i.test(tokens[i + 2] ?? ''));
      const long = (l: boolean) => ` number:style="${l ? 'long' : 'short'}"`;
      if (lower === 'yyyy' || lower === 'yy') body += `<number:year${long(lower === 'yyyy')}/>`;
      else if (minute) body += `<number:minutes${long(lower === 'mm')}/>`;
      else if (lower === 'mmmm' || lower === 'mmm') body += `<number:month number:textual="true"${long(lower === 'mmmm')}/>`;
      else if (lower === 'mm' || lower === 'm') body += `<number:month${long(lower === 'mm')}/>`;
      else if (lower === 'dddd' || lower === 'ddd') body += `<number:day-of-week${long(lower === 'dddd')}/>`;
      else if (lower === 'dd' || lower === 'd') body += `<number:day${long(lower === 'dd')}/>`;
      else if (lower === 'hh' || lower === 'h') body += `<number:hours${long(lower === 'hh')}/>`;
      else if (lower === 'ss' || lower === 's') body += `<number:seconds${long(lower === 'ss')}/>`;
      else if (lower === 'am/pm') body += '<number:am-pm/>';
      else body += `<number:text>${esc(t.replace(/^"|"$/g, ''))}</number:text>`;
    });
    return `<number:${tag} style:name="${name}">${body}</number:${tag}>`;
  }
  // UNIT-002: "General" with text around it (`General" mm"`): ODF's standard number, and the text.
  const general = /general/i.exec(fmt.replace(/"[^"]*"/g, (q) => ' '.repeat(q.length)));
  if (general) {
    const lit = (t: string) => t.replace(/"/g, '');
    const text = (t: string) => (t ? `<number:text>${esc(t)}</number:text>` : '');
    return `<number:number-style style:name="${name}">${text(lit(fmt.slice(0, general.index)))}<number:number number:min-integer-digits="1"/>${text(lit(fmt.slice(general.index + 7)))}</number:number-style>`;
  }
  const percent = fmt.includes('%');
  const core = /[#0][#0,]*(\.0+)?/.exec(fmt.replace(/"[^"]*"/g, (q) => ' '.repeat(q.length)));
  const decimals = core?.[1] ? core[1].length - 1 : 0;
  const grouping = core ? core[0].includes(',') : false;
  const prefix = core ? fmt.slice(0, core.index).replace(/"/g, '') : '';
  const suffix = core ? fmt.slice(core.index + core[0].length).replace(/"/g, '').replace('%', '') : '';
  const number = `<number:number number:decimal-places="${decimals}" number:min-decimal-places="${decimals}" number:min-integer-digits="1"${grouping ? ' number:grouping="true"' : ''}/>`;
  const text = (t: string) => (t ? `<number:text>${esc(t)}</number:text>` : '');
  if (percent) return `<number:percentage-style style:name="${name}">${text(prefix)}${number}<number:text>%</number:text></number:percentage-style>`;
  return `<number:number-style style:name="${name}">${text(prefix)}${number}${text(suffix)}</number:number-style>`;
}

function isoFromSerial(serial: number, withTime: boolean): string {
  const iso = serialToDate(serial).toISOString();
  return withTime ? iso.slice(0, 19) : iso.slice(0, 10);
}

function durationFromSerial(serial: number): string {
  const total = Math.round(serial * 86400);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${String(h).padStart(2, '0')}H${String(m).padStart(2, '0')}M${String(s).padStart(2, '0')}S`;
}

const CONFIG_NS = 'urn:oasis:names:tc:opendocument:xmlns:config:1.0';

/** settings.xml with the frozen panes of each sheet, as LibreOffice writes them (SHEET-017); undefined without any. */
function settingsXml(wb: Workbook): string | undefined {
  const frozen = wb.sheets.filter((s) => s.freeze && (s.freeze.rows || s.freeze.cols));
  if (!frozen.length) return undefined;
  const item = (name: string, type: string, value: number | string): string => `<config:config-item config:name="${name}" config:type="${type}">${value}</config:config-item>`;
  const tables = frozen
    .map((s) => {
      const { rows, cols } = s.freeze!;
      return (
        `<config:config-item-map-entry config:name="${esc(s.name)}">` +
        item('HorizontalSplitMode', 'short', cols ? 2 : 0) +
        item('VerticalSplitMode', 'short', rows ? 2 : 0) +
        item('HorizontalSplitPosition', 'int', cols) +
        item('VerticalSplitPosition', 'int', rows) +
        item('ActiveSplitRange', 'short', 2) +
        item('PositionLeft', 'int', 0) +
        item('PositionRight', 'int', cols) +
        item('PositionTop', 'int', 0) +
        item('PositionBottom', 'int', rows) +
        '</config:config-item-map-entry>'
      );
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:config="${CONFIG_NS}" office:version="1.3"><office:settings>` +
    '<config:config-item-set config:name="ooo:view-settings"><config:config-item-map-indexed config:name="Views"><config:config-item-map-entry>' +
    `${item('ViewId', 'string', 'view1')}<config:config-item-map-named config:name="Tables">${tables}</config:config-item-map-named>` +
    '</config:config-item-map-entry></config:config-item-map-indexed></config:config-item-set></office:settings></office:document-settings>'
  );
}

/** Cell formatting as ODF style properties (SHEET-014). */
function lookXml(look: CellStyle | undefined): string {
  if (!look) return '';
  const cellProps = [look.fill ? `fo:background-color="${look.fill}"` : '', look.border ? 'fo:border="0.06pt solid #000000"' : '', look.align ? 'style:text-align-source="fix"' : ''].filter(Boolean);
  const text = [
    look.bold ? 'fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"' : '',
    look.italic ? 'fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"' : '',
    look.underline ? 'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : '',
    look.color ? `fo:color="${look.color}"` : '',
  ].filter(Boolean);
  return (
    (cellProps.length ? `<style:table-cell-properties ${cellProps.join(' ')}/>` : '') +
    (look.align ? `<style:paragraph-properties fo:text-align="${{ left: 'start', center: 'center', right: 'end' }[look.align]}"/>` : '') +
    (text.length ? `<style:text-properties ${text.join(' ')}/>` : '')
  );
}

const odfAddress = (sheet: string, r: number, c: number): string => `${quoteSheet(sheet)}.${refName(r, c)}`;

/** The autofilters, as anonymous database ranges (SHEET-018). */
function databaseRanges(wb: Workbook): string {
  const ranges = wb.sheets.flatMap((sheet, si) => {
    const f = sheet.filter;
    if (!f) return [];
    const conditions = Object.entries(f.columns).map(([c, values]) => {
      const field = Number(c) - f.range.c1;
      const items = values.map((v) => `<table:filter-set-item table:value="${esc(v)}"/>`).join('');
      return `<table:filter-condition table:field-number="${field}" table:value="${esc(values[0] ?? '')}" table:operator="="${items ? `>${items}</table:filter-condition>` : '/>'}`;
    });
    const filter = !conditions.length ? '' : `<table:filter>${conditions.length > 1 ? `<table:filter-and>${conditions.join('')}</table:filter-and>` : conditions[0]}</table:filter>`;
    const target = `${odfAddress(sheet.name, f.range.r1, f.range.c1)}:${odfAddress(sheet.name, f.range.r2, f.range.c2)}`;
    return [`<table:database-range table:name="__Anonymous_Sheet_DB__${si}" table:target-range-address="${esc(target)}" table:display-filter-buttons="true">${filter}</table:database-range>`];
  });
  return ranges.length ? `<table:database-ranges>${ranges.join('')}</table:database-ranges>` : '';
}

export function writeOds(wb: Workbook): Uint8Array {
  const calc = new Calculator(wb);
  const formats = new Map<string, string>(); // fmt -> cell style name
  const styles: string[] = [];
  const colStyles = new Map<number, string>(); // px -> style name

  const dataStyles = new Map<string, string>(); // fmt -> data style name
  const cellStyle = (fmt: string | undefined, look: CellStyle | undefined): string => {
    if (!fmt && !look) return '';
    const key = `${fmt ?? ''}|${JSON.stringify(look ?? {})}`;
    let name = formats.get(key);
    if (!name) {
      name = `ce${formats.size + 1}`;
      formats.set(key, name);
      let data = '';
      if (fmt) {
        let ds = dataStyles.get(fmt);
        if (!ds) {
          ds = `N${dataStyles.size + 1}`;
          dataStyles.set(fmt, ds);
          styles.push(dataStyle(ds, fmt));
        }
        data = ` style:data-style-name="${ds}"`;
      }
      styles.push(`<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="Default"${data}>${lookXml(look)}</style:style>`);
    }
    return ` table:style-name="${name}"`;
  };
  const colStyle = (px: number): string => {
    let name = colStyles.get(px);
    if (!name) {
      name = `co${colStyles.size + 1}`;
      colStyles.set(px, name);
      styles.push(`<style:style style:name="${name}" style:family="table-column"><style:table-column-properties style:column-width="${pxToIn(px)}"/></style:style>`);
    }
    return name;
  };

  const valueAttrs = (v: Value, cell: Cell): string => {
    if (v === null) return '';
    if (isError(v)) return ` office:value-type="string" office:string-value="${esc(v.error)}"`;
    if (typeof v === 'boolean') return ` office:value-type="boolean" office:boolean-value="${v}"`;
    if (typeof v === 'string') return ` office:value-type="string" office:string-value="${esc(v)}"`;
    const fmt = cell.numFmt;
    if (fmt && isDateFormat(fmt)) {
      const timeOnly = !/[yd]/i.test(fmt.replace(/"[^"]*"/g, ''));
      if (timeOnly) return ` office:value-type="time" office:time-value="${durationFromSerial(v)}"`;
      return ` office:value-type="date" office:date-value="${isoFromSerial(v, /h/i.test(fmt))}"`;
    }
    if (fmt?.includes('%')) return ` office:value-type="percentage" office:value="${v}"`;
    return ` office:value-type="float" office:value="${v}"`;
  };

  const display = (v: Value): string => {
    if (v === null) return '';
    if (isError(v)) return v.error;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return formatGeneral(v);
    return v;
  };

  // SHEET-022: chart objects, each anchored in a cell by a frame.
  const objects: { dir: string; xml: string }[] = [];
  const tables = wb.sheets.map((sheet, si) => {
    let [rows, cols] = usedSize(sheet);
    const frames = new Map<string, string>();
    for (const chart of sheet.charts ?? []) {
      const dir = `Object ${objects.length + 1}`;
      objects.push({ dir, xml: chartObjectXml(chart, sheet.name) });
      const key = `${chart.anchor.row},${chart.anchor.col}`;
      frames.set(key, (frames.get(key) ?? '') + chartFrameXml(chart, sheet.name, dir));
      rows = Math.max(rows, chart.anchor.row + 1);
      cols = Math.max(cols, chart.anchor.col + 1);
    }
    // SHEET-026: an empty column keeps its width too.
    for (const c of sheet.colWidths?.keys() ?? []) cols = Math.max(cols, c + 1);
    let columns = '';
    for (let c = 0; c < cols; c++) {
      const w = sheet.colWidths?.get(c);
      columns += `<table:table-column table:style-name="${w ? colStyle(w) : 'co0'}" table:default-cell-style-name="Default"/>`;
    }
    const byRow = new Map<number, Map<number, Cell>>();
    for (const [key, cell] of sheet.cells) {
      const [r, c] = parseKey(key);
      if (!byRow.has(r)) byRow.set(r, new Map());
      byRow.get(r)!.set(c, cell);
    }
    for (const key of frames.keys()) {
      const [r] = parseKey(key);
      if (!byRow.has(r)) byRow.set(r, new Map());
    }
    // SHEET-018: rows hidden by the filter.
    const hidden = hiddenRows(wb, si, calc);
    let body = '';
    let emptyRun = 0;
    const flushEmpty = (): void => {
      if (emptyRun) body += `<table:table-row${emptyRun > 1 ? ` table:number-rows-repeated="${emptyRun}"` : ''}><table:table-cell table:number-columns-repeated="${cols}"/></table:table-row>`;
      emptyRun = 0;
    };
    for (let r = 0; r < rows; r++) {
      const rowCells = byRow.get(r) ?? (hidden.has(r) ? new Map<number, Cell>() : undefined);
      if (!rowCells) {
        emptyRun++;
        continue;
      }
      flushEmpty();
      let rowXml = '';
      let gap = 0;
      for (let c = 0; c < cols; c++) {
        const cell = rowCells.get(c);
        const frame = frames.get(`${r},${c}`) ?? '';
        if (!cell && !frame) {
          gap++;
          continue;
        }
        if (gap) rowXml += `<table:table-cell${gap > 1 ? ` table:number-columns-repeated="${gap}"` : ''}/>`;
        gap = 0;
        if (!cell) {
          rowXml += `<table:table-cell>${frame}</table:table-cell>`;
          continue;
        }
        const v = cell.formula !== undefined ? calc.value(si, [r, c]) : cell.value;
        const formula = cell.formula !== undefined ? ` table:formula="${esc(excelToOf(cell.formula))}"` : '';
        const text = display(v);
        // UNIT-002: a formula giving a quantity is written with its unit in the number format.
        rowXml += `<table:table-cell${cellStyle(cell.formula !== undefined ? calc.format(si, [r, c]) : cell.numFmt, cell.style)}${formula}${valueAttrs(v, cell)}>${frame}${text ? `<text:p>${esc(text)}</text:p>` : ''}</table:table-cell>`;
      }
      if (gap) rowXml += `<table:table-cell${gap > 1 ? ` table:number-columns-repeated="${gap}"` : ''}/>`;
      if (!rowXml) rowXml = `<table:table-cell table:number-columns-repeated="${cols}"/>`;
      body += `<table:table-row${hidden.has(r) ? ' table:visibility="filter"' : ''}>${rowXml}</table:table-row>`;
    }
    flushEmpty();
    return `<table:table table:name="${esc(sheet.name)}">${columns}${body}</table:table>`;
  });

  const content =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<office:document-content ${ODF_XMLNS} office:version="1.3">` +
    '<office:automatic-styles><style:style style:name="co0" style:family="table-column"><style:table-column-properties style:column-width="0.8925in"/></style:style>' +
    styles.join('') +
    '</office:automatic-styles>' +
    `<office:body><office:spreadsheet>${tables.join('')}${databaseRanges(wb)}</office:spreadsheet></office:body></office:document-content>`;

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<office:document-styles ${ODF_XMLNS} office:version="1.3"><office:styles>` +
    '<style:default-style style:family="table-cell"><style:text-properties fo:font-size="10pt"/></style:default-style>' +
    '<style:style style:name="Default" style:family="table-cell"/>' +
    '</office:styles></office:document-styles>';

  const settings = settingsXml(wb);
  return writeZip([
    { path: 'mimetype', data: MIME_TYPES.ods, store: true },
    {
      path: 'META-INF/manifest.xml',
      data: manifestXml(MIME_TYPES.ods, [
        { path: 'content.xml', mediaType: 'text/xml' },
        { path: 'styles.xml', mediaType: 'text/xml' },
        { path: 'meta.xml', mediaType: 'text/xml' },
        ...(settings ? [{ path: 'settings.xml', mediaType: 'text/xml' }] : []),
        ...objects.flatMap((o) => [
          { path: `${o.dir}/`, mediaType: CHART_MIME },
          { path: `${o.dir}/content.xml`, mediaType: 'text/xml' },
        ]),
      ]),
    },
    { path: 'content.xml', data: content },
    { path: 'styles.xml', data: stylesXml },
    { path: 'meta.xml', data: metaXml({}) },
    ...(settings ? [{ path: 'settings.xml', data: settings }] : []),
    ...objects.map((o) => ({ path: `${o.dir}/content.xml`, data: o.xml })),
  ]);
}
