import { describe, expect, it } from 'vitest';
import { getCell, newWorkbook, setInput } from '../src/sheet/model';
import { fillDownEnd, fillRange, fillTarget } from '../src/sheet/fill';

function sheetWith(inputs: Record<string, string>) {
  const wb = newWorkbook();
  for (const [ref, v] of Object.entries(inputs)) setInput(wb.sheets[0]!, ref, v);
  return wb;
}
const value = (wb: ReturnType<typeof newWorkbook>, ref: string) => getCell(wb.sheets[0]!, ref)?.value;
const formula = (wb: ReturnType<typeof newWorkbook>, ref: string) => getCell(wb.sheets[0]!, ref)?.formula;

describe('SHEET-027 fill handle', () => {
  it('continues numbers as a series and copies a single number', () => {
    const wb = sheetWith({ A1: '1', A2: '3', B1: '7' });
    fillRange(wb, 0, { r1: 0, c1: 0, r2: 1, c2: 0 }, { r1: 0, c1: 0, r2: 4, c2: 0 });
    expect([value(wb, 'A3'), value(wb, 'A4'), value(wb, 'A5')]).toEqual([5, 7, 9]);
    fillRange(wb, 0, { r1: 0, c1: 1, r2: 0, c2: 1 }, { r1: 0, c1: 1, r2: 2, c2: 1 });
    expect([value(wb, 'B2'), value(wb, 'B3')]).toEqual([7, 7]);
  });

  it('keeps decimal steps exact and fills upwards and leftwards', () => {
    const wb = sheetWith({ C3: '0.1', C4: '0.2' });
    fillRange(wb, 0, { r1: 2, c1: 2, r2: 3, c2: 2 }, { r1: 0, c1: 2, r2: 5, c2: 2 });
    expect([value(wb, 'C1'), value(wb, 'C2'), value(wb, 'C5'), value(wb, 'C6')]).toEqual([-0.1, 0, 0.3, 0.4]);
    const wb2 = sheetWith({ C1: '10', D1: '20' });
    fillRange(wb2, 0, { r1: 0, c1: 2, r2: 0, c2: 3 }, { r1: 0, c1: 0, r2: 0, c2: 3 });
    expect([value(wb2, 'A1'), value(wb2, 'B1')]).toEqual([-10, 0]);
  });

  it('goes on day by day from one date', () => {
    const wb = sheetWith({ A1: '2026-01-30' });
    fillRange(wb, 0, { r1: 0, c1: 0, r2: 0, c2: 0 }, { r1: 0, c1: 0, r2: 2, c2: 0 });
    const a1 = value(wb, 'A1') as number;
    expect(value(wb, 'A3')).toBe(a1 + 2);
    expect(getCell(wb.sheets[0]!, 'A3')?.numFmt).toBe(getCell(wb.sheets[0]!, 'A1')?.numFmt);
  });

  it('continues texts ending with a number, days and months', () => {
    const wb = sheetWith({ A1: 'Item 1', B1: 'Week 08', C1: 'Monday', D1: 'janvier', E1: 'Jan', E2: 'Mar', F1: 'SUN' });
    fillRange(wb, 0, { r1: 0, c1: 0, r2: 0, c2: 3 }, { r1: 0, c1: 0, r2: 2, c2: 3 });
    expect([value(wb, 'A3'), value(wb, 'B3'), value(wb, 'C3'), value(wb, 'D3')]).toEqual(['Item 3', 'Week 10', 'Wednesday', 'mars']);
    fillRange(wb, 0, { r1: 0, c1: 4, r2: 1, c2: 4 }, { r1: 0, c1: 4, r2: 6, c2: 4 });
    expect([value(wb, 'E3'), value(wb, 'E7')]).toEqual(['May', 'Jan']);
    fillRange(wb, 0, { r1: 0, c1: 5, r2: 0, c2: 5 }, { r1: 0, c1: 5, r2: 1, c2: 5 });
    expect(value(wb, 'F2')).toBe('MON');
  });

  it('repeats other texts and moves the relative references of formulas', () => {
    const wb = sheetWith({ A1: 'yes', A2: 'no', B1: '=A1*$C$1', C1: '2' });
    fillRange(wb, 0, { r1: 0, c1: 0, r2: 1, c2: 1 }, { r1: 0, c1: 0, r2: 4, c2: 1 });
    expect([value(wb, 'A3'), value(wb, 'A4'), value(wb, 'A5')]).toEqual(['yes', 'no', 'yes']);
    expect([formula(wb, 'B2'), formula(wb, 'B3'), formula(wb, 'B5')]).toEqual([undefined, 'A3*$C$1', 'A5*$C$1']);
    expect(getCell(wb.sheets[0]!, 'B4')).toBeUndefined();
  });

  it('keeps the formatting of the source', () => {
    const wb = sheetWith({ A1: '5' });
    wb.sheets[0]!.cells.get('0,0')!.style = { bold: true };
    fillRange(wb, 0, { r1: 0, c1: 0, r2: 0, c2: 0 }, { r1: 0, c1: 0, r2: 1, c2: 0 });
    expect(getCell(wb.sheets[0]!, 'A2')?.style).toEqual({ bold: true });
  });

  it('finds the target from the pointer and the end for a double click', () => {
    const src = { r1: 2, c1: 2, r2: 3, c2: 3 };
    expect(fillTarget(src, 9, 4)).toEqual({ r1: 2, c1: 2, r2: 9, c2: 3 });
    expect(fillTarget(src, 3, 0)).toEqual({ r1: 2, c1: 0, r2: 3, c2: 3 });
    expect(fillTarget(src, 3, 3)).toEqual(src);
    expect(fillRange(newWorkbook(), 0, src, { r1: 0, c1: 0, r2: 9, c2: 9 })).toBe(false);
    const wb = sheetWith({ A1: 'a', A2: 'b', A3: 'c', A4: 'd', B1: '1' });
    expect(fillDownEnd(wb, 0, { r1: 0, c1: 1, r2: 0, c2: 1 })).toBe(3);
  });
});
