import { describe, expect, it } from 'vitest';
import { Calculator } from '../src/sheet/engine';
import { cellInput, getCell, newWorkbook, parseInput, setInput } from '../src/sheet/model';
import { formatValue } from '../src/sheet/number-format';
import { readWorkbook, writeWorkbook } from '../src/sheet/io';

function sheet(inputs: Record<string, string>) {
  const wb = newWorkbook();
  for (const [ref, input] of Object.entries(inputs)) setInput(wb.sheets[0]!, ref, input);
  const calc = new Calculator(wb);
  const shown = (ref: string) => formatValue(calc.value(0, ref), calc.format(0, ref));
  return { wb, calc, shown };
}

describe('UNIT-002 quantities in cells', () => {
  it('reads "12 mm" as a number in its unit, kept in the number format', () => {
    expect(parseInput('12 mm')).toEqual({ value: 12, numFmt: 'General" mm"' });
    expect(parseInput('-3.5e2 kN·m')).toEqual({ value: -350, numFmt: 'General" kN·m"' });
    expect(parseInput('9.81 m/s²')).toEqual({ value: 9.81, numFmt: 'General" m/s²"' });
    expect(parseInput('12 apples')).toEqual({ value: '12 apples' });
    const { wb } = sheet({ A1: '12 mm' });
    expect(cellInput(getCell(wb.sheets[0]!, 'A1'))).toBe('12 mm');
    // A number typed in a cell in mm stays in mm.
    setInput(wb.sheets[0]!, 'A1', '15');
    expect(cellInput(getCell(wb.sheets[0]!, 'A1'))).toBe('15 mm');
  });
});

describe('UNIT-003 dimensional analysis in formulas', () => {
  it('adds lengths in different units, in the unit of the first', () => {
    const { shown } = sheet({ A1: '12 mm', A2: '3 m', A3: '=A1+A2', A4: '=A2+A1', A5: '=A2-A1' });
    expect(shown('A3')).toBe('3012 mm');
    expect(shown('A4')).toBe('3.012 m');
    expect(shown('A5')).toBe('2.988 m');
  });

  it('multiplies and divides into new units', () => {
    const { shown } = sheet({ A1: '2 kN', A2: '0.5 m', A3: '=A1*A2', B1: '100 km', B2: '2 h', B3: '=B1/B2', C1: '12 mm', C2: '=C1*C1', C3: '=SQRT(C2)', D1: '3 kg', D2: '2 m/s²', D3: '=D1*D2', E1: '=B1/A2' });
    expect(shown('A3')).toBe('1 kN·m');
    expect(shown('B3')).toBe('50 km/h');
    expect(shown('C2')).toBe('144 mm²');
    expect(shown('C3')).toBe('12 mm');
    expect(shown('D3')).toBe('6 N');
    // Same dimension, units cancel: a pure number.
    expect(shown('E1')).toBe('200000');
  });

  it('refuses to add or compare different dimensions', () => {
    const { shown } = sheet({ A1: '12 mm', A2: '2 s', A3: '=A1+A2', A4: '=A1>A2', A5: '=A1+1', A6: '=SIN(A1)', A7: '=A1*2', A8: '=A1/A2' });
    expect(shown('A3')).toBe('#UNIT!');
    expect(shown('A4')).toBe('#UNIT!');
    expect(shown('A5')).toBe('#UNIT!');
    expect(shown('A6')).toBe('#UNIT!');
    expect(shown('A7')).toBe('24 mm');
    expect(shown('A8')).toBe('6 mm/s');
  });

  it('sums, averages and compares a column of quantities', () => {
    const { shown } = sheet({ A1: '1 m', A2: '50 cm', A3: '250 mm', B1: '=SUM(A1:A3)', B2: '=AVERAGE(A1:A3)', B3: '=MAX(A1:A3)', B4: '=MIN(A1:A3)', B5: '=COUNT(A1:A3)', B6: '=A2>A3', B7: '=ROUND(A1/3;2)', B8: '=ABS(-A2)', C1: '2 s', C2: '=SUM(A1;C1)' });
    expect(shown('B1')).toBe('1.75 m');
    expect(shown('B2')).toBe('0.583333333333333 m');
    expect(shown('B3')).toBe('1 m');
    expect(shown('B4')).toBe('250 mm');
    expect(shown('B5')).toBe('3');
    expect(shown('B6')).toBe('TRUE');
    expect(shown('B7')).toBe('0.33 m');
    expect(shown('B8')).toBe('50 cm');
    expect(shown('C2')).toBe('#UNIT!');
  });

  it('shows a result in the unit of its number format, or refuses another dimension', () => {
    const { wb, calc } = sheet({ A1: '2 kN', A2: '0.5 m', A3: '=A1*A2', A4: '=A1*A2' });
    getCell(wb.sheets[0]!, 'A3')!.numFmt = '0.0" N·m"';
    getCell(wb.sheets[0]!, 'A4')!.numFmt = 'General" m"';
    calc.invalidate();
    expect(formatValue(calc.value(0, 'A3'), calc.format(0, 'A3'))).toBe('1000.0 N·m');
    expect(formatValue(calc.value(0, 'A4'), calc.format(0, 'A4'))).toBe('#UNIT!');
  });

  it('converts with CONVERT, QTY and UNIT', () => {
    const { shown } = sheet({ A1: '=CONVERT(100;"C";"F")', A2: '=CONVERT(1;"in";"mm")', A3: '5 km', A4: '=CONVERT(A3;"km";"mi")', A5: '=QTY(3;"bar")', A6: '=UNIT(A5)', A7: '=CONVERT(1;"m";"kg")' });
    expect(shown('A1')).toBe('212');
    expect(shown('A2')).toBe('25.4');
    expect(shown('A4')).toBe('3.10685596118667 mi');
    expect(shown('A5')).toBe('3 bar');
    expect(shown('A6')).toBe('bar');
    expect(shown('A7')).toBe('#N/A');
  });

  it('keeps the units in XLSX and ODS, readable by other spreadsheets', () => {
    const { wb } = sheet({ A1: '12 mm', A2: '3 m', A3: '=A1+A2', B1: '2 kN', B2: '=B1*A2' });
    for (const format of ['xlsx', 'ods'] as const) {
      const back = readWorkbook(format, writeWorkbook(wb, format));
      const calc = new Calculator(back);
      const shown = (ref: string) => formatValue(calc.value(0, ref), calc.format(0, ref));
      expect([shown('A1'), shown('A3'), shown('B2')]).toEqual(['12 mm', '3012 mm', '6 kN·m']);
      // The value cached for other spreadsheets is the number in the unit shown, with that unit in its format.
      expect(getCell(back.sheets[0]!, 'A3')!.value).toBe(3012);
      expect(getCell(back.sheets[0]!, 'A3')!.numFmt).toBe('General" mm"');
    }
  });
});

describe('UNIT-004 cells shown in another unit', () => {
  it('converts quantities, gives plain numbers the unit, shows formulas in it, and refuses other dimensions', async () => {
    const { setCellsUnit } = await import('../src/sheet/unit-cells');
    const { wb, calc } = sheet({ A1: '12 mm', A2: '7', A3: '=A1*2', A4: '3 s' });
    const result = setCellsUnit(wb.sheets[0]!, { r1: 0, c1: 0, r2: 3, c2: 0 }, 'cm');
    expect(result).toEqual({ changed: 3, refused: 1 });
    calc.invalidate();
    const shown = (ref: string) => formatValue(calc.value(0, ref), calc.format(0, ref));
    expect([shown('A1'), shown('A2'), shown('A3'), shown('A4')]).toEqual(['1.2 cm', '7 cm', '2.4 cm', '3 s']);
  });

  it('keeps the units in CSV, read back as quantities', async () => {
    const { readCsv, writeCsv } = await import('../src/sheet/csv');
    const { wb } = sheet({ A1: '12 mm', A2: '=A1*3' });
    const csv = new TextDecoder().decode(writeCsv(wb));
    expect(csv).toContain('12 mm');
    expect(csv).toContain('36 mm');
    const back = readCsv(new TextEncoder().encode(csv));
    expect(getCell(back.sheets[0]!, 'A1')).toEqual({ value: 12, numFmt: 'General" mm"' });
  });
});
