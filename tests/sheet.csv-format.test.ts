import { describe, expect, it } from 'vitest';
import { formatValue, isDateFormat } from '../src/sheet/number-format';
import { detectDelimiter, parseCsv, readCsv, writeCsv } from '../src/sheet/csv';
import { getCell, newWorkbook, setInput } from '../src/sheet/model';

describe('number formats', () => {
  it('formats numbers, percentages, dates, booleans and errors', () => {
    expect(formatValue(1234.5)).toBe('1234.5');
    expect(formatValue(0.1 + 0.2)).toBe('0.3');
    expect(formatValue(1234.567, '0.00')).toBe('1234.57');
    expect(formatValue(1234567.891, '#,##0.00')).toBe('1,234,567.89');
    expect(formatValue(-1234, '#,##0')).toBe('-1,234');
    expect(formatValue(0.125, '0.0%')).toBe('12.5%');
    expect(formatValue(45322, 'yyyy-mm-dd')).toBe('2024-01-31');
    expect(formatValue(45322, 'dd/mm/yyyy')).toBe('31/01/2024');
    expect(formatValue(45322.5, 'yyyy-mm-dd hh:mm')).toBe('2024-01-31 12:00');
    expect(formatValue(9.5, '"$"#,##0.00')).toBe('$9.50');
    expect(formatValue(9.5, '#,##0.00 [$€-40C]')).toBe('9.50 €');
    expect(formatValue(true)).toBe('TRUE');
    expect(formatValue(null)).toBe('');
    expect(formatValue({ error: '#DIV/0!' })).toBe('#DIV/0!');
    expect(isDateFormat('mm:ss')).toBe(true);
    expect(isDateFormat('0.00')).toBe(false);
  });
});

describe('SHEET-003 CSV', () => {
  it('detects comma, semicolon and tab delimiters', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a;b;"c,d"\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
  });

  it('parses quoted fields with delimiters, quotes and newlines', () => {
    expect(parseCsv('a,"b,c","say ""hi""","multi\nline"\r\n1,2,,4', ',')).toEqual([
      ['a', 'b,c', 'say "hi"', 'multi\nline'],
      ['1', '2', '', '4'],
    ]);
  });

  it('reads typed values, strips the BOM and never creates formulas', () => {
    const wb = readCsv(new TextEncoder().encode('﻿name;qty;when;f\nx;3;2024-01-31;=1+1\n'), 'data.csv');
    const s = wb.sheets[0]!;
    expect(s.name).toBe('data');
    expect(getCell(s, 'A1')).toEqual({ value: 'name' });
    expect(getCell(s, 'B2')).toEqual({ value: 3 });
    expect(getCell(s, 'C2')).toEqual({ value: 45322, numFmt: 'yyyy-mm-dd' });
    expect(getCell(s, 'D2')).toEqual({ value: '=1+1' });
  });

  it('decodes Windows-1252 files that are not valid UTF-8', () => {
    const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in cp1252
    expect(getCell(readCsv(bytes, 'a.csv').sheets[0]!, 'A1')).toEqual({ value: 'café' });
  });

  it('SHEET-009 writes computed values with quoting', () => {
    const wb = newWorkbook();
    const s = wb.sheets[0]!;
    setInput(s, 'A1', 'a,b');
    setInput(s, 'B1', 'say "hi"');
    setInput(s, 'A2', '2');
    setInput(s, 'B2', '=A2*21');
    setInput(s, 'C2', '2024-01-31');
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(writeCsv(wb, 0));
    expect(text).toBe('﻿"a,b","say ""hi""",\r\n2,42,2024-01-31\r\n');
  });
});
