/** OpenDocument Spreadsheet (.ods) writer (SHEET-009). */
import { escapeXml as esc } from '../core/xml';
import { writeZip } from '../core/zip';
import { MIME_TYPES } from '../core/format';
import { manifestXml, metaXml, ODF_XMLNS, pxToIn } from '../document/odf';
import { parseKey } from './address';
import { Calculator, formatGeneral } from './engine';
import { isError, serialToDate, usedSize, type Cell, type Value, type Workbook } from './model';
import { isDateFormat } from './number-format';
import { excelToOf } from './openformula';

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

export function writeOds(wb: Workbook): Uint8Array {
  const calc = new Calculator(wb);
  const formats = new Map<string, string>(); // fmt -> cell style name
  const styles: string[] = [];
  const colStyles = new Map<number, string>(); // px -> style name

  const cellStyle = (fmt: string | undefined): string => {
    if (!fmt) return '';
    let name = formats.get(fmt);
    if (!name) {
      const n = formats.size + 1;
      name = `ce${n}`;
      formats.set(fmt, name);
      styles.push(dataStyle(`N${n}`, fmt), `<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="Default" style:data-style-name="N${n}"/>`);
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

  const tables = wb.sheets.map((sheet, si) => {
    const [rows, cols] = usedSize(sheet);
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
    let body = '';
    let emptyRun = 0;
    const flushEmpty = (): void => {
      if (emptyRun) body += `<table:table-row${emptyRun > 1 ? ` table:number-rows-repeated="${emptyRun}"` : ''}><table:table-cell table:number-columns-repeated="${cols}"/></table:table-row>`;
      emptyRun = 0;
    };
    for (let r = 0; r < rows; r++) {
      const rowCells = byRow.get(r);
      if (!rowCells) {
        emptyRun++;
        continue;
      }
      flushEmpty();
      let rowXml = '';
      let gap = 0;
      for (let c = 0; c < cols; c++) {
        const cell = rowCells.get(c);
        if (!cell) {
          gap++;
          continue;
        }
        if (gap) rowXml += `<table:table-cell${gap > 1 ? ` table:number-columns-repeated="${gap}"` : ''}/>`;
        gap = 0;
        const v = cell.formula !== undefined ? calc.value(si, [r, c]) : cell.value;
        const formula = cell.formula !== undefined ? ` table:formula="${esc(excelToOf(cell.formula))}"` : '';
        const text = display(v);
        rowXml += `<table:table-cell${cellStyle(cell.numFmt)}${formula}${valueAttrs(v, cell)}>${text ? `<text:p>${esc(text)}</text:p>` : ''}</table:table-cell>`;
      }
      if (gap) rowXml += `<table:table-cell${gap > 1 ? ` table:number-columns-repeated="${gap}"` : ''}/>`;
      body += `<table:table-row>${rowXml}</table:table-row>`;
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
    `<office:body><office:spreadsheet>${tables.join('')}</office:spreadsheet></office:body></office:document-content>`;

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<office:document-styles ${ODF_XMLNS} office:version="1.3"><office:styles>` +
    '<style:default-style style:family="table-cell"><style:text-properties fo:font-size="10pt"/></style:default-style>' +
    '<style:style style:name="Default" style:family="table-cell"/>' +
    '</office:styles></office:document-styles>';

  return writeZip([
    { path: 'mimetype', data: MIME_TYPES.ods, store: true },
    {
      path: 'META-INF/manifest.xml',
      data: manifestXml(MIME_TYPES.ods, [
        { path: 'content.xml', mediaType: 'text/xml' },
        { path: 'styles.xml', mediaType: 'text/xml' },
        { path: 'meta.xml', mediaType: 'text/xml' },
      ]),
    },
    { path: 'content.xml', data: content },
    { path: 'styles.xml', data: stylesXml },
    { path: 'meta.xml', data: metaXml({}) },
  ]);
}
