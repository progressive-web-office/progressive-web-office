import { describe, expect, it } from 'vitest';
import { getCell, newWorkbook, setInput, type CellStyle, type Workbook } from '../src/sheet/model';
import { applyCellStyle, clearCellStyle } from '../src/sheet/ops';
import { readWorkbook, writeWorkbook } from '../src/sheet/io';
import { readZip, readZipText } from '../src/core/zip';

const STYLE: CellStyle = { bold: true, italic: true, underline: true, color: '#c00000', fill: '#ffff00', align: 'center', border: true };

function styled(): Workbook {
  const wb = newWorkbook();
  const s = wb.sheets[0]!;
  setInput(s, 'A1', 'Total');
  setInput(s, 'B1', '1234.5');
  getCell(s, 'B1')!.numFmt = '#,##0.00';
  applyCellStyle(wb, 0, { r1: 0, c1: 0, r2: 0, c2: 1 }, STYLE);
  // An empty cell with a fill only.
  applyCellStyle(wb, 0, { r1: 2, c1: 2, r2: 2, c2: 2 }, { fill: '#d9ead3' });
  return wb;
}

describe('SHEET-014 cell formatting', () => {
  it('applies a style to a range, creating empty cells, and clears it', () => {
    const wb = styled();
    const s = wb.sheets[0]!;
    expect(getCell(s, 'A1')!.style).toEqual(STYLE);
    expect(getCell(s, 'C3')).toEqual({ value: null, style: { fill: '#d9ead3' } });
    applyCellStyle(wb, 0, { r1: 0, c1: 0, r2: 0, c2: 0 }, { bold: false, fill: undefined });
    expect(getCell(s, 'A1')!.style).toEqual({ italic: true, underline: true, color: '#c00000', align: 'center', border: true });
    clearCellStyle(wb, 0, { r1: 0, c1: 0, r2: 2, c2: 2 });
    expect(getCell(s, 'A1')!.style).toBeUndefined();
    expect(getCell(s, 'B1')!.numFmt).toBe('#,##0.00');
    expect(getCell(s, 'C3')).toBeUndefined();
  });

  it.each(['xlsx', 'ods'] as const)('round-trips through %s', (format) => {
    const back = readWorkbook(format, writeWorkbook(styled(), format)).sheets[0]!;
    expect(getCell(back, 'A1')!.style).toEqual(STYLE);
    expect(getCell(back, 'B1')!.style).toEqual(STYLE);
    expect(getCell(back, 'B1')!.numFmt).toBe('#,##0.00');
    expect(getCell(back, 'B1')!.value).toBe(1234.5);
    expect(getCell(back, 'C3')!.style).toEqual({ fill: '#d9ead3' });
    expect(getCell(back, 'A2')).toBeUndefined();
  });

  it('writes native styles', () => {
    const styles = readZipText(readZip(writeWorkbook(styled(), 'xlsx')), 'xl/styles.xml')!;
    expect(styles).toContain('<b/><i/><u/>');
    expect(styles).toContain('<color rgb="FFC00000"/>');
    expect(styles).toContain('<patternFill patternType="solid"><fgColor rgb="FFFFFF00"/>');
    expect(styles).toContain('<left style="thin">');
    expect(styles).toContain('<alignment horizontal="center"/>');
    const content = readZipText(readZip(writeWorkbook(styled(), 'ods')), 'content.xml')!;
    expect(content).toContain('fo:font-weight="bold"');
    expect(content).toContain('fo:background-color="#ffff00"');
    expect(content).toContain('fo:text-align="center"');
  });
});
