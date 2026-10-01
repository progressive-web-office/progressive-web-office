/** CSV/TSV reading and writing (SHEET-003, SHEET-009). */
import { Calculator } from './engine';
import { formatGeneral } from './engine';
import { cellKey, parseKey } from './address';
import { formatValue, isDateFormat } from './number-format';
import { isError, newSheet, parseInput, usedSize, type Workbook } from './model';

const CANDIDATES = [',', ';', '\t', '|'];

function countOutsideQuotes(line: string, delim: string): number {
  let n = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === delim && !quoted) n++;
  }
  return n;
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ',';
  let bestScore = 0;
  for (const d of CANDIDATES) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const min = Math.min(...counts);
    const consistent = counts.every((c) => c === counts[0]);
    const score = (consistent ? 1000 : 0) + min * 10 + (counts[0] ?? 0);
    if ((counts[0] ?? 0) > 0 && score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

export function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += ch;
    }
    i++;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function readCsv(bytes: Uint8Array, fileName = 'Sheet1.csv'): Workbook {
  const text = decode(bytes).replace(/^﻿/, '');
  const delim = /\.tsv$/i.test(fileName) ? '\t' : detectDelimiter(text);
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Sheet1';
  const sheet = newSheet(base.slice(0, 31));
  parseCsv(text, delim).forEach((row, r) =>
    row.forEach((field, c) => {
      // CSV never creates formulas (CSV injection safety): "=..." stays text.
      const cell = field.startsWith('=') ? { value: field } : parseInput(field);
      if (cell) sheet.cells.set(cellKey(r, c), cell);
    }),
  );
  return { sheets: [sheet] };
}

function quote(field: string, delim: string): string {
  return /["\r\n]/.test(field) || field.includes(delim) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** Write one sheet as UTF-8 CSV (with BOM, CRLF), using computed values. */
export function writeCsv(wb: Workbook, sheetIndex = 0, delim = ','): Uint8Array {
  const sheet = wb.sheets[sheetIndex]!;
  const calc = new Calculator(wb);
  const [rows, cols] = usedSize(sheet);
  const grid: string[][] = Array.from({ length: rows }, () => Array<string>(cols).fill(''));
  for (const [key, cell] of sheet.cells) {
    const [r, c] = parseKey(key);
    const v = calc.value(sheetIndex, [r, c]);
    let text: string;
    if (typeof v === 'number') text = isDateFormat(cell.numFmt) ? formatValue(v, cell.numFmt) : formatGeneral(v);
    else text = isError(v) ? v.error : formatValue(v);
    grid[r]![c] = quote(text, delim);
  }
  return new TextEncoder().encode('﻿' + grid.map((r) => r.join(delim)).join('\r\n') + '\r\n');
}
