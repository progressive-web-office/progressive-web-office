import { describe, expect, it } from 'vitest';
import { getCell, newWorkbook, setInput, type Workbook } from '../src/sheet/model';
import { Calculator } from '../src/sheet/engine';
import { guessHeader, sortRange } from '../src/sheet/ops';

function table(rows: string[][]): Workbook {
  const wb = newWorkbook();
  const s = wb.sheets[0]!;
  rows.forEach((row, r) => row.forEach((v, c) => v !== '' && setInput(s, [r, c], v)));
  return wb;
}
const column = (wb: Workbook, col: number, rows: number): string[] => {
  const calc = new Calculator(wb);
  return Array.from({ length: rows }, (_, r) => String(calc.value(0, [r, col]) ?? ''));
};

describe('SHEET-016 sorting a range', () => {
  it('sorts rows by a column, keeping the header and the rows together', () => {
    const wb = table([
      ['Name', 'Score'],
      ['Chloé', '12'],
      ['alice', '17'],
      ['Bob', '9'],
    ]);
    sortRange(wb, 0, new Calculator(wb), { r1: 0, c1: 0, r2: 3, c2: 1 }, { col: 1, descending: true, header: true });
    expect(column(wb, 0, 4)).toEqual(['Name', 'alice', 'Chloé', 'Bob']);
    expect(column(wb, 1, 4)).toEqual(['Score', '17', '12', '9']);
    sortRange(wb, 0, new Calculator(wb), { r1: 0, c1: 0, r2: 3, c2: 1 }, { col: 0, descending: false, header: true });
    expect(column(wb, 0, 4)).toEqual(['Name', 'alice', 'Bob', 'Chloé']);
  });

  it('puts numbers before text, and empty cells last in both orders', () => {
    const wb = table([['b'], ['10'], [''], ['2'], ['A']]);
    const r = { r1: 0, c1: 0, r2: 4, c2: 0 };
    sortRange(wb, 0, new Calculator(wb), r, { col: 0, descending: false, header: false });
    expect(column(wb, 0, 5)).toEqual(['2', '10', 'A', 'b', '']);
    sortRange(wb, 0, new Calculator(wb), r, { col: 0, descending: true, header: false });
    expect(column(wb, 0, 5)).toEqual(['b', 'A', '10', '2', '']);
  });

  it('sorts by computed values and moves formulas with their row', () => {
    const wb = table([
      ['3', '=A1*10'],
      ['1', '=A2*10'],
      ['2', '=A3*10'],
    ]);
    sortRange(wb, 0, new Calculator(wb), { r1: 0, c1: 0, r2: 2, c2: 1 }, { col: 1, descending: false, header: false });
    expect(column(wb, 1, 3)).toEqual(['10', '20', '30']);
    expect(getCell(wb.sheets[0]!, 'B1')?.formula).toBe('A1*10');
  });

  it('is stable for equal keys and leaves cells outside the range alone', () => {
    const wb = table([
      ['1', 'x', 'out'],
      ['0', 'y', 'out2'],
      ['1', 'z', ''],
    ]);
    sortRange(wb, 0, new Calculator(wb), { r1: 0, c1: 0, r2: 2, c2: 1 }, { col: 0, descending: false, header: false });
    expect(column(wb, 1, 3)).toEqual(['y', 'x', 'z']);
    expect(column(wb, 2, 3)).toEqual(['out', 'out2', '']);
  });

  it('guesses a header row', () => {
    expect(guessHeader(table([['Name', 'Score'], ['a', '1']]), 0, new Calculator(table([['Name', 'Score'], ['a', '1']])), { r1: 0, c1: 0, r2: 1, c2: 1 })).toBe(true);
    const nums = table([['3', '1'], ['2', '4']]);
    expect(guessHeader(nums, 0, new Calculator(nums), { r1: 0, c1: 0, r2: 1, c2: 1 })).toBe(false);
  });
});
