import { describe, expect, it } from 'vitest';
import { newWorkbook, setInput, type Workbook } from '../src/sheet/model';
import { Calculator } from '../src/sheet/engine';
import { columnValues, hiddenRows, setColumnFilter, toggleFilter } from '../src/sheet/filter';
import { readWorkbook, writeWorkbook } from '../src/sheet/io';
import { readZip, readZipText } from '../src/core/zip';

function table(): Workbook {
  const wb = newWorkbook();
  const s = wb.sheets[0]!;
  const rows = [
    ['Name', 'Class', 'Score'],
    ['Alice', 'A', '17'],
    ['Bilal', 'B', '9'],
    ['Chloé', 'A', '12'],
    ['David', '', '14'],
  ];
  rows.forEach((row, r) => row.forEach((v, c) => v && setInput(s, [r, c], v)));
  return wb;
}

describe('SHEET-018 autofilter', () => {
  it('turns a filter on the data block and lists the values of a column', () => {
    const wb = table();
    toggleFilter(wb, 0, { r1: 0, c1: 0, r2: 4, c2: 2 });
    expect(wb.sheets[0]!.filter).toEqual({ range: { r1: 0, c1: 0, r2: 4, c2: 2 }, columns: {} });
    expect(columnValues(wb, 0, new Calculator(wb), 1)).toEqual(['', 'A', 'B']);
    expect(columnValues(wb, 0, new Calculator(wb), 2)).toEqual(['9', '12', '14', '17']);
  });

  it('hides the rows whose values are not chosen, never the header', () => {
    const wb = table();
    toggleFilter(wb, 0, { r1: 0, c1: 0, r2: 4, c2: 2 });
    setColumnFilter(wb, 0, 1, ['A']);
    expect([...hiddenRows(wb, 0, new Calculator(wb))].sort()).toEqual([2, 4]);
    setColumnFilter(wb, 0, 2, ['17', '9']);
    expect([...hiddenRows(wb, 0, new Calculator(wb))].sort()).toEqual([2, 3, 4]);
    setColumnFilter(wb, 0, 1, undefined);
    expect([...hiddenRows(wb, 0, new Calculator(wb))].sort()).toEqual([3, 4]);
    toggleFilter(wb, 0, { r1: 0, c1: 0, r2: 4, c2: 2 });
    expect(wb.sheets[0]!.filter).toBeUndefined();
    expect(hiddenRows(wb, 0, new Calculator(wb)).size).toBe(0);
  });

  it.each(['xlsx', 'ods'] as const)('keeps the filter and its choices in %s', (format) => {
    const wb = table();
    toggleFilter(wb, 0, { r1: 0, c1: 0, r2: 4, c2: 2 });
    setColumnFilter(wb, 0, 1, ['A', '']);
    const back = readWorkbook(format, writeWorkbook(wb, format));
    expect(back.sheets[0]!.filter).toEqual({ range: { r1: 0, c1: 0, r2: 4, c2: 2 }, columns: { 1: ['A', ''] } });
  });

  it('writes native filters with the hidden rows', () => {
    const wb = table();
    toggleFilter(wb, 0, { r1: 0, c1: 0, r2: 4, c2: 2 });
    setColumnFilter(wb, 0, 1, ['A']);
    const xlsx = readZip(writeWorkbook(wb, 'xlsx'));
    const sheet = readZipText(xlsx, 'xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('<autoFilter ref="A1:C5"><filterColumn colId="1"><filters><filter val="A"/></filters></filterColumn></autoFilter>');
    expect(sheet).toMatch(/<row r="3" hidden="1">/);
    expect(readZipText(xlsx, 'xl/workbook.xml')).toContain('_xlnm._FilterDatabase');
    const content = readZipText(readZip(writeWorkbook(wb, 'ods')), 'content.xml')!;
    expect(content).toContain('table:target-range-address="Sheet1.A1:Sheet1.C5" table:display-filter-buttons="true"');
    expect(content).toContain('table:visibility="filter"');
  });
});
