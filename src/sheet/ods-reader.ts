/** OpenDocument Spreadsheet (.ods) reader (SHEET-002). */
import { readChartFrame } from './chart-odf';
import { attr, children, descendants, parseXml } from '../core/xml';
import { readZip, readZipText } from '../core/zip';
import { lengthToPx, ODF_NS } from '../document/odf';
import { cellKey } from './address';
import { cleanCellStyle, dateToSerial, type Cell, type CellStyle, type Sheet, type Workbook } from './model';
import { ofToExcel } from './openformula';

/** Safety caps for repeated rows/cells holding content. */
const MAX_REPEAT_CONTENT = 10_000;
/** Repeats beyond which formatted empty cells or rows are dropped (SHEET-014). */
const MAX_REPEAT_FORMAT = 64;

/** Text of a <text:p> (handles text:s, text:tab, text:line-break, spans). */
function paragraphText(p: Element): string {
  let out = '';
  for (let n = p.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3) out += n.nodeValue ?? '';
    else if (n.nodeType === 1) {
      const el = n as Element;
      if (el.localName === 's') out += ' '.repeat(Number(attr(el, 'c') ?? 1) || 1);
      else if (el.localName === 'tab') out += '\t';
      else if (el.localName === 'line-break') out += '\n';
      else if (el.localName !== 'annotation') out += paragraphText(el);
    }
  }
  return out;
}

/** Number format code from an ODF data style element. */
function dataStyleToFormat(el: Element): string | undefined {
  const kind = el.localName;
  let code = '';
  for (const c of children(el)) {
    switch (c.localName) {
      case 'number': {
        const decimals = Number(attr(c, 'decimal-places') ?? 0);
        const grouping = attr(c, 'grouping') === 'true';
        code += `${grouping ? '#,##0' : '0'}${decimals ? `.${'0'.repeat(decimals)}` : ''}`;
        break;
      }
      case 'text': {
        const t = c.textContent ?? '';
        if (kind === 'percentage-style' && t === '%') code += '%';
        else if (kind === 'date-style' || kind === 'time-style') code += t;
        else if (t) code += `"${t}"`;
        break;
      }
      case 'currency-symbol':
        code += `"${c.textContent ?? ''}"`;
        break;
      case 'year':
        code += attr(c, 'style') === 'long' ? 'yyyy' : 'yy';
        break;
      case 'month':
        code += attr(c, 'textual') === 'true' ? (attr(c, 'style') === 'long' ? 'mmmm' : 'mmm') : attr(c, 'style') === 'long' ? 'mm' : 'm';
        break;
      case 'day':
        code += attr(c, 'style') === 'long' ? 'dd' : 'd';
        break;
      case 'day-of-week':
        code += attr(c, 'style') === 'long' ? 'dddd' : 'ddd';
        break;
      case 'hours':
        code += attr(c, 'style') === 'long' ? 'hh' : 'h';
        break;
      case 'minutes':
        code += attr(c, 'style') === 'long' ? 'mm' : 'm';
        break;
      case 'seconds':
        code += attr(c, 'style') === 'long' ? 'ss' : 's';
        break;
      case 'am-pm':
        code += 'AM/PM';
        break;
      default:
        break;
    }
  }
  return code || undefined;
}

function parseIsoDate(v: string): number | undefined {
  const m = /^(-?\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?/.exec(v);
  if (!m) return undefined;
  const days = dateToSerial(Number(m[1]), Number(m[2]), Number(m[3]));
  const time = m[4] ? (Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6] ?? 0)) / 86400 : 0;
  return days + time;
}

function parseDuration(v: string): number | undefined {
  const m = /^-?P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(v);
  if (!m) return undefined;
  return (Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0)) / 86400;
}

export function readOds(bytes: Uint8Array): Workbook {
  const zip = readZip(bytes);
  const text = readZipText(zip, 'content.xml');
  if (!text) throw new Error('Not an OpenDocument spreadsheet: content.xml is missing.');
  const doc = parseXml(text);
  const stylesXml = readZipText(zip, 'styles.xml');
  const docs = stylesXml ? [parseXml(stylesXml), doc] : [doc];

  const dataStyles = new Map<string, string>();
  const cellStyles = new Map<string, string>();
  const colWidths = new Map<string, number>();
  // SHEET-014: cell formatting of each cell style, and their parents.
  const looks = new Map<string, CellStyle>();
  const parents = new Map<string, string>();
  const lookOf = (name: string | null, depth = 0): CellStyle | undefined => {
    if (!name || depth > 8) return undefined;
    const parent = parents.get(name);
    return cleanCellStyle({ ...(parent ? lookOf(parent, depth + 1) : {}), ...looks.get(name) });
  };
  for (const d of docs) {
    for (const el of Array.from(d.getElementsByTagNameNS(ODF_NS.number, '*'))) {
      if (!el.localName.endsWith('-style')) continue;
      const name = attr(el, 'name');
      const code = dataStyleToFormat(el);
      if (name && code) dataStyles.set(name, code);
    }
    for (const st of descendants(d, 'style')) {
      if (st.namespaceURI !== ODF_NS.style) continue;
      const name = attr(st, 'name');
      if (!name) continue;
      const ds = attr(st, 'data-style-name');
      if (ds) cellStyles.set(name, ds);
      if (attr(st, 'family') === 'table-cell') {
        looks.set(name, readLook(st));
        const parent = attr(st, 'parent-style-name');
        if (parent) parents.set(name, parent);
      }
      const colProps = children(st, 'table-column-properties')[0];
      const w = colProps ? lengthToPx(attr(colProps, 'column-width')) : undefined;
      if (w) colWidths.set(name, Math.round(w));
    }
  }
  const formatOf = (styleName: string | null): string | undefined => {
    if (!styleName) return undefined;
    const ds = cellStyles.get(styleName);
    return ds ? dataStyles.get(ds) : undefined;
  };

  const sheets: Sheet[] = [];
  for (const table of descendants(doc, 'table')) {
    if (table.namespaceURI !== ODF_NS.table || table.parentElement?.localName !== 'spreadsheet') continue;
    const sheet: Sheet = { name: attr(table, 'name') ?? `Sheet${sheets.length + 1}`, cells: new Map() };
    let col = 0;
    for (const c of descendants(table, 'table-column')) {
      const repeat = Math.min(Number(attr(c, 'number-columns-repeated') ?? 1) || 1, 1024);
      const w = colWidths.get(attr(c, 'style-name') ?? '');
      if (w) {
        sheet.colWidths ??= new Map();
        for (let i = 0; i < repeat; i++) sheet.colWidths.set(col + i, w);
      }
      col += repeat;
    }
    let row = 0;
    const visitRows = (container: Element): void => {
      for (const el of children(container)) {
        if (el.localName === 'table-row') {
          const repeat = Number(attr(el, 'number-rows-repeated') ?? 1) || 1;
          const cells = readRow(el);
          const formatOnly = cells.every(([, cell]) => cell.value === null && cell.formula === undefined);
          if (cells.length && !(formatOnly && repeat > MAX_REPEAT_FORMAT)) {
            for (let i = 0; i < Math.min(repeat, MAX_REPEAT_CONTENT); i++) {
              for (const [c, cell] of cells) sheet.cells.set(cellKey(row + i, c), { ...cell });
            }
          }
          row += repeat;
        } else if (['table-header-rows', 'table-rows', 'table-row-group'].includes(el.localName)) {
          visitRows(el);
        }
      }
    };
    const readRow = (rowEl: Element): [number, Cell][] => {
      const out: [number, Cell][] = [];
      let c = 0;
      for (const cellEl of children(rowEl)) {
        if (cellEl.localName !== 'table-cell' && cellEl.localName !== 'covered-table-cell') continue;
        const repeat = Number(attr(cellEl, 'number-columns-repeated') ?? 1) || 1;
        // SHEET-022: charts anchored in this cell.
        for (const frame of children(cellEl, 'frame')) {
          const chart = readChartFrame(zip, frame, row, c);
          if (chart) (sheet.charts ??= []).push(chart);
        }
        const cell = readCell(cellEl);
        // A formatted empty cell repeated across the sheet is not worth keeping one by one.
        const formatOnly = cell && cell.value === null && cell.formula === undefined;
        if (cell && !(formatOnly && repeat > MAX_REPEAT_FORMAT)) for (let i = 0; i < Math.min(repeat, MAX_REPEAT_CONTENT); i++) out.push([c + i, { ...cell }]);
        c += repeat;
      }
      return out;
    };
    const readCell = (el: Element): Cell | undefined => {
      const type = attr(el, 'value-type');
      const formulaAttr = attr(el, 'formula');
      const paras = children(el, 'p').map(paragraphText);
      let cell: Cell | undefined;
      let fmt = formatOf(attr(el, 'style-name'));
      switch (type) {
        case 'float':
        case 'currency':
          cell = { value: Number(attr(el, 'value')) };
          break;
        case 'percentage':
          cell = { value: Number(attr(el, 'value')) };
          fmt ??= '0%';
          break;
        case 'date': {
          const v = parseIsoDate(attr(el, 'date-value') ?? '');
          cell = v === undefined ? { value: paras.join('\n') } : { value: v };
          fmt ??= (attr(el, 'date-value') ?? '').includes('T') ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd';
          break;
        }
        case 'time': {
          const v = parseDuration(attr(el, 'time-value') ?? '');
          cell = v === undefined ? { value: paras.join('\n') } : { value: v };
          fmt ??= 'hh:mm:ss';
          break;
        }
        case 'boolean':
          cell = { value: attr(el, 'boolean-value') === 'true' };
          break;
        case 'string':
          cell = { value: attr(el, 'string-value') ?? paras.join('\n') };
          break;
        default:
          cell = paras.length ? { value: paras.join('\n') } : undefined;
      }
      const look = lookOf(attr(el, 'style-name'));
      if (look) (cell ??= { value: null }).style = look;
      if (formulaAttr) {
        cell ??= { value: null };
        cell.formula = ofToExcel(formulaAttr);
      }
      if (cell && fmt && typeof cell.value === 'number') cell.numFmt = fmt;
      if (cell && cell.value === '' && !cell.formula) return undefined;
      return cell;
    };
    visitRows(table);
    sheets.push(sheet);
  }
  if (!sheets.length) sheets.push({ name: 'Sheet1', cells: new Map() });
  readFrozenPanes(zip, sheets);
  return { sheets };
}

/** Frozen panes from settings.xml (SHEET-017). */
function readFrozenPanes(zip: ReturnType<typeof readZip>, sheets: Sheet[]): void {
  const text = readZipText(zip, 'settings.xml');
  if (!text) return;
  const tables = descendants(parseXml(text), 'config-item-map-named').find((m) => attr(m, 'name') === 'Tables');
  if (!tables) return;
  for (const entry of children(tables, 'config-item-map-entry')) {
    const sheet = sheets.find((s) => s.name === attr(entry, 'name'));
    if (!sheet) continue;
    const value = (name: string): number => Number(children(entry, 'config-item').find((i) => attr(i, 'name') === name)?.textContent ?? 0) || 0;
    const cols = value('HorizontalSplitMode') === 2 ? value('HorizontalSplitPosition') : 0;
    const rows = value('VerticalSplitMode') === 2 ? value('VerticalSplitPosition') : 0;
    if (rows > 0 || cols > 0) sheet.freeze = { rows: Math.max(0, rows), cols: Math.max(0, cols) };
  }
}

/** Formatting of an ODF table-cell style (SHEET-014). */
function readLook(st: Element): CellStyle {
  const cellProps = children(st, 'table-cell-properties')[0];
  const para = children(st, 'paragraph-properties')[0];
  const text = children(st, 'text-properties')[0];
  const look: CellStyle = {};
  const bg = cellProps ? attr(cellProps, 'background-color') : null;
  if (bg && /^#[0-9a-f]{6}$/i.test(bg)) look.fill = bg;
  const border = cellProps ? [attr(cellProps, 'border'), attr(cellProps, 'border-left'), attr(cellProps, 'border-top')].find((b) => b && b !== 'none') : undefined;
  if (border) look.border = true;
  const align = para ? attr(para, 'text-align') : null;
  if (align === 'center') look.align = 'center';
  else if (align === 'end' || align === 'right') look.align = 'right';
  else if (align === 'start' || align === 'left') look.align = 'left';
  if (text) {
    if (attr(text, 'font-weight') === 'bold' || Number(attr(text, 'font-weight')) >= 600) look.bold = true;
    if (attr(text, 'font-style') === 'italic') look.italic = true;
    const u = attr(text, 'text-underline-style');
    if (u && u !== 'none') look.underline = true;
    const color = attr(text, 'color');
    if (color && /^#[0-9a-f]{6}$/i.test(color) && color.toLowerCase() !== '#000000') look.color = color;
  }
  return look;
}
