/** XLSX (SpreadsheetML) reader (SHEET-001). */
import { readSheetCharts } from './chart-ooxml';
import { attr, child, children, descendants, parseXml } from '../core/xml';
import { readZip, readZipText, type ZipEntries } from '../core/zip';
import { readRels } from '../document/ooxml';
import { cellKey, parseRef } from './address';
import { translateFormula } from './formula';
import { cleanCellStyle, type Cell, type CellStyle, type Sheet, type Workbook } from './model';

/** Built-in number formats (ECMA-376 Part 1, 18.8.30), dates shown as ISO. */
export const BUILTIN_FORMATS: Record<number, string> = {
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  14: 'yyyy-mm-dd',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'yyyy-mm-dd hh:mm',
  37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mm:ss.0',
  48: '##0.0E+0',
};

/** Excel column width (characters) <-> pixels. */
export const widthToPx = (w: number): number => Math.round(w * 7 + 5);
export const pxToWidth = (px: number): number => Math.round(((px - 5) / 7) * 100) / 100;

const stripFn = (f: string): string => f.replace(/_xlfn\.|_xlws\./g, '');

function text(el: Element): string {
  // Concatenate <t> of plain and rich text, ignoring phonetic runs (rPh).
  let out = '';
  for (const c of children(el)) {
    if (c.localName === 't') out += c.textContent ?? '';
    else if (c.localName === 'r') out += children(c, 't').map((t) => t.textContent ?? '').join('');
  }
  return out;
}

class XlsxReader {
  private strings: string[] = [];
  private styles: { numFmt?: string; style?: CellStyle }[] = [];

  constructor(private readonly zip: ZipEntries) {}

  read(): Workbook {
    const wbText = readZipText(this.zip, 'xl/workbook.xml');
    if (!wbText) throw new Error('Not an Excel workbook: xl/workbook.xml is missing.');
    this.readSharedStrings();
    this.readStyles();
    const rels = readRels(this.zip, 'xl/workbook.xml');
    const sheets: Sheet[] = [];
    for (const s of descendants(parseXml(wbText), 'sheet')) {
      const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? attr(s, 'id');
      const rel = rid ? rels.get(rid) : undefined;
      const sheet: Sheet = { name: attr(s, 'name') ?? `Sheet${sheets.length + 1}`, cells: new Map() };
      const xml = rel ? readZipText(this.zip, rel.target) : undefined;
      if (xml && rel) {
        const sheetDoc = parseXml(xml);
        this.readSheet(sheetDoc, sheet);
        // SHEET-017: frozen panes.
        const pane = descendants(sheetDoc, 'pane').find((p) => /^frozen/.test(attr(p, 'state') ?? ''));
        const rows = pane ? Math.max(0, Math.round(Number(attr(pane, 'ySplit') ?? 0))) : 0;
        const cols = pane ? Math.max(0, Math.round(Number(attr(pane, 'xSplit') ?? 0))) : 0;
        if (rows || cols) sheet.freeze = { rows, cols };
        const charts = readSheetCharts(this.zip, rel.target, sheetDoc);
        if (charts.length) sheet.charts = charts;
      }
      sheets.push(sheet);
    }
    if (!sheets.length) sheets.push({ name: 'Sheet1', cells: new Map() });
    return { sheets };
  }

  private readSharedStrings(): void {
    const xml = readZipText(this.zip, 'xl/sharedStrings.xml');
    if (!xml) return;
    this.strings = descendants(parseXml(xml), 'si').map(text);
  }

  private readStyles(): void {
    const xml = readZipText(this.zip, 'xl/styles.xml');
    if (!xml) return;
    const doc = parseXml(xml);
    const custom = new Map<number, string>();
    for (const f of descendants(doc, 'numFmt')) custom.set(Number(attr(f, 'numFmtId')), attr(f, 'formatCode') ?? '');
    // SHEET-014: fonts, fills and borders, by index.
    const rgb = (el: Element | undefined): string | undefined => {
      const v = el ? attr(el, 'rgb') : null;
      return v && /^[0-9a-f]{8}$/i.test(v) ? `#${v.slice(2).toLowerCase()}` : undefined;
    };
    const on = (el: Element | undefined): boolean => !!el && !/^(0|false)$/.test(attr(el, 'val') ?? '');
    const list = (name: string, item: string): Element[] => {
      const group = descendants(doc, name)[0];
      return group ? children(group, item) : [];
    };
    const fonts = list('fonts', 'font').map((f): CellStyle => {
      const u = child(f, 'u');
      const color = rgb(child(f, 'color'));
      return cleanCellStyle({ bold: on(child(f, 'b')), italic: on(child(f, 'i')), underline: !!u && attr(u, 'val') !== 'none', ...(color && color !== '#000000' ? { color } : {}) }) ?? {};
    });
    const fills = list('fills', 'fill').map((f): CellStyle => {
      const p = child(f, 'patternFill');
      const color = p && attr(p, 'patternType') === 'solid' ? rgb(child(p, 'fgColor')) : undefined;
      return color ? { fill: color } : {};
    });
    const borders = list('borders', 'border').map((b): CellStyle => (['left', 'right', 'top', 'bottom'].some((side) => { const e = child(b, side); return !!e && !!attr(e, 'style') && attr(e, 'style') !== 'none'; }) ? { border: true } : {}));
    const cellXfs = descendants(doc, 'cellXfs')[0];
    if (!cellXfs) return;
    this.styles = children(cellXfs, 'xf').map((xf) => {
      const id = Number(attr(xf, 'numFmtId') ?? 0);
      const align = attr(child(xf, 'alignment') ?? xf, 'horizontal');
      const look = cleanCellStyle({
        ...fonts[Number(attr(xf, 'fontId') ?? 0)],
        ...fills[Number(attr(xf, 'fillId') ?? 0)],
        ...borders[Number(attr(xf, 'borderId') ?? 0)],
        ...(align === 'left' || align === 'center' || align === 'right' ? { align } : {}),
      });
      return { numFmt: id === 0 ? undefined : (custom.get(id) ?? BUILTIN_FORMATS[id]), ...(look ? { style: look } : {}) };
    });
  }

  private readSheet(doc: Document, sheet: Sheet): void {
    for (const col of descendants(doc, 'col')) {
      const width = Number(attr(col, 'width'));
      if (!width || attr(col, 'customWidth') === '0') continue;
      const min = Number(attr(col, 'min') ?? 1);
      const max = Math.min(Number(attr(col, 'max') ?? min), min + 255);
      sheet.colWidths ??= new Map();
      for (let c = min; c <= max; c++) sheet.colWidths.set(c - 1, widthToPx(width));
    }
    const shared = new Map<string, { formula: string; row: number; col: number }>();
    let rowIndex = -1;
    for (const row of descendants(doc, 'row')) {
      rowIndex = attr(row, 'r') ? Number(attr(row, 'r')) - 1 : rowIndex + 1;
      let colIndex = -1;
      for (const c of children(row, 'c')) {
        const ref = attr(c, 'r');
        const pos = ref ? parseRef(ref) : undefined;
        const r = pos?.row ?? rowIndex;
        colIndex = pos?.col ?? colIndex + 1;
        const cell = this.readCell(c, r, colIndex, shared);
        if (cell) sheet.cells.set(cellKey(r, colIndex), cell);
      }
    }
  }

  private readCell(c: Element, row: number, col: number, shared: Map<string, { formula: string; row: number; col: number }>): Cell | undefined {
    const t = attr(c, 't') ?? 'n';
    const v = child(c, 'v')?.textContent ?? null;
    let value: Cell['value'] = null;
    switch (t) {
      case 's':
        value = v !== null ? (this.strings[Number(v)] ?? '') : null;
        break;
      case 'inlineStr': {
        const is = child(c, 'is');
        value = is ? text(is) : '';
        break;
      }
      case 'str':
      case 'e':
        value = v;
        break;
      case 'b':
        value = v === null ? null : v === '1' || v === 'true';
        break;
      case 'd':
        value = v;
        break;
      default:
        value = v === null || v === '' ? null : Number(v);
    }
    const cell: Cell = { value };
    const f = child(c, 'f');
    if (f) {
      const kind = attr(f, 't');
      const si = attr(f, 'si');
      let formula = f.textContent ?? '';
      if (kind === 'shared' && si !== null) {
        if (formula) {
          shared.set(si, { formula, row, col });
        } else {
          const master = shared.get(si);
          if (master) formula = translateFormula(master.formula, row - master.row, col - master.col);
        }
      }
      if (formula) cell.formula = stripFn(formula);
    }
    const s = attr(c, 's');
    const xf = s !== null ? this.styles[Number(s)] : undefined;
    if (xf?.numFmt && typeof value === 'number') cell.numFmt = xf.numFmt;
    if (xf?.style) cell.style = xf.style;
    if (cell.value === null && !cell.formula && !cell.style) return undefined;
    return cell;
  }
}

export function readXlsx(bytes: Uint8Array): Workbook {
  return new XlsxReader(readZip(bytes)).read();
}
