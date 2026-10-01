import { describe, expect, it } from 'vitest';
import { Calculator } from '../src/sheet/engine';
import { newWorkbook, setInput, getCell, type Workbook } from '../src/sheet/model';
import { translateFormula, shiftFormula } from '../src/sheet/formula';

function book(cells: Record<string, string>, more: Record<string, Record<string, string>> = {}): Workbook {
  const wb = newWorkbook();
  for (const [ref, input] of Object.entries(cells)) setInput(wb.sheets[0]!, ref, input);
  for (const [name, sheetCells] of Object.entries(more)) {
    const s = { name, cells: new Map() };
    wb.sheets.push(s);
    for (const [ref, input] of Object.entries(sheetCells)) setInput(s, ref, input);
  }
  return wb;
}
const calc = (cells: Record<string, string>, ref = 'Z99', more = {}) => {
  const wb = book(cells, more);
  return new Calculator(wb).value(0, ref);
};
const f = (formula: string, cells: Record<string, string> = {}) => calc({ ...cells, Z99: `=${formula}` });

describe('SHEET-006 formula evaluation', () => {
  it('evaluates arithmetic with precedence, unary minus, power and percent', () => {
    expect(f('1+2*3')).toBe(7);
    expect(f('(1+2)*3')).toBe(9);
    expect(f('2^3^2')).toBe(64); // left-associative like Excel
    expect(f('-2^2')).toBe(4); // unary minus binds tighter (Excel)
    expect(f('10/4')).toBe(2.5);
    expect(f('50%')).toBe(0.5);
    expect(f('1.5e2')).toBe(150);
  });

  it('evaluates comparisons and concatenation', () => {
    expect(f('1<2')).toBe(true);
    expect(f('"abc"="ABC"')).toBe(true);
    expect(f('2<>2')).toBe(false);
    expect(f('"a"&1&TRUE')).toBe('a1TRUE');
    expect(f('"say ""hi"""')).toBe('say "hi"');
  });

  it('resolves references and ranges, empty cells count as zero', () => {
    const cells = { A1: '1', A2: '2', A3: '3', B1: 'text', B2: 'TRUE' };
    expect(f('A1+A2*A3', cells)).toBe(7);
    expect(f('SUM(A1:A3)', cells)).toBe(6);
    expect(f('SUM($A$1:A3, 10)', cells)).toBe(16);
    expect(f('C5+1', cells)).toBe(1);
    expect(f('SUM(A:A)', cells)).toBe(6);
  });

  it('implements the required functions', () => {
    const cells = { A1: '4', A2: '8', A3: 'x', A4: '' };
    expect(f('AVERAGE(A1:A3)', cells)).toBe(6);
    expect(f('MIN(A1:A2)', cells)).toBe(4);
    expect(f('MAX(A1:A2,20)', cells)).toBe(20);
    expect(f('COUNT(A1:A4)', cells)).toBe(2);
    expect(f('COUNTA(A1:A4)', cells)).toBe(3);
    expect(f('IF(A1>3,"big","small")', cells)).toBe('big');
    expect(f('ROUND(2.345,2)')).toBe(2.35);
    expect(f('ROUND(-2.5,0)')).toBe(-3);
    expect(f('ABS(-3)')).toBe(3);
    expect(f('AND(TRUE,1)')).toBe(true);
    expect(f('OR(FALSE,0)')).toBe(false);
    expect(f('NOT(FALSE)')).toBe(true);
    expect(f('CONCAT("a","b",1)')).toBe('ab1');
    expect(f('LEN("hello")')).toBe(5);
    expect(f('UPPER("abc")&LOWER("DEF")')).toBe('ABCdef');
  });

  it('implements common extra functions', () => {
    const cells = { A1: 'apple', B1: '1', A2: 'pear', B2: '2', A3: 'apple', B3: '3' };
    expect(f('SUMIF(A1:A3,"apple",B1:B3)', cells)).toBe(4);
    expect(f('COUNTIF(B1:B3,">1")', cells)).toBe(2);
    expect(f('VLOOKUP("pear",A1:B3,2,FALSE)', cells)).toBe(2);
    expect(f('IFERROR(1/0,"oops")')).toBe('oops');
    expect(f('MOD(7,3)+INT(2.7)')).toBe(3);
    expect(f('LEFT("hello",2)&MID("hello",2,3)&RIGHT("hello",1)')).toBe('heello');
    expect(f('TRIM("  a  b ")')).toBe('a b');
  });

  it('references other sheets', () => {
    expect(calc({ A1: "='Data sheet'!B2*2" }, 'A1', { 'Data sheet': { B2: '21' } })).toBe(42);
    expect(calc({ A1: '=Other!A1' }, 'A1', { Other: { A1: '5' } })).toBe(5);
  });
});

describe('SHEET-008 formula errors', () => {
  it('reports division by zero, unknown names, bad values, syntax errors and cycles', () => {
    expect(f('1/0')).toEqual({ error: '#DIV/0!' });
    expect(f('FOO(1)')).toEqual({ error: '#NAME?' });
    expect(f('"a"+1')).toEqual({ error: '#VALUE!' });
    expect(f('1+')).toEqual({ error: '#ERROR!' });
    expect(f('Missing!A1')).toEqual({ error: '#REF!' });
    expect(calc({ A1: '=B1', B1: '=A1+1' }, 'A1')).toEqual({ error: '#CYCLE!' });
    expect(calc({ A1: '=A1' }, 'A1')).toEqual({ error: '#CYCLE!' });
    expect(f('A1+1', { A1: '=1/0' })).toEqual({ error: '#DIV/0!' });
  });
});

describe('SHEET-007 recalculation', () => {
  it('recomputes dependants after a change', () => {
    const wb = book({ A1: '1', A2: '=A1*10' });
    const calc = new Calculator(wb);
    expect(calc.value(0, 'A2')).toBe(10);
    setInput(wb.sheets[0]!, 'A1', '5');
    calc.invalidate();
    expect(calc.value(0, 'A2')).toBe(50);
  });
});

describe('cell input parsing', () => {
  it('detects numbers, booleans, percentages, dates, formulas and forced text', () => {
    const wb = newWorkbook();
    const s = wb.sheets[0]!;
    setInput(s, 'A1', '42');
    setInput(s, 'A2', 'TRUE');
    setInput(s, 'A3', '12.5%');
    setInput(s, 'A4', '2024-01-31');
    setInput(s, 'A5', '=SUM(A1:A1)');
    setInput(s, 'A6', "'007");
    setInput(s, 'A7', 'hello');
    expect(getCell(s, 'A1')).toEqual({ value: 42 });
    expect(getCell(s, 'A2')).toEqual({ value: true });
    expect(getCell(s, 'A3')).toEqual({ value: 0.125, numFmt: '0.0%' });
    expect(getCell(s, 'A4')).toEqual({ value: 45322, numFmt: 'yyyy-mm-dd' });
    expect(getCell(s, 'A5')).toEqual({ value: null, formula: 'SUM(A1:A1)' });
    expect(getCell(s, 'A6')).toEqual({ value: '007' });
    expect(getCell(s, 'A7')).toEqual({ value: 'hello' });
    setInput(s, 'A7', '');
    expect(getCell(s, 'A7')).toBeUndefined();
  });
});

describe('reference translation', () => {
  it('translates relative references (copy / shared formulas)', () => {
    expect(translateFormula('A1+$B$2+B$3+$C4+SUM(A1:B2)', 1, 1)).toBe('B2+$B$2+C$3+$C5+SUM(B2:C3)');
    expect(translateFormula('"A1"&A1', 1, 0)).toBe('"A1"&A2');
    expect(translateFormula('A1', -1, 0)).toBe('#REF!');
  });

  it('SHEET-011 shifts references on row/column insertion and deletion', () => {
    expect(shiftFormula('A1+A5+SUM(A2:A6)', 'rows', 2, 2)).toBe('A1+A7+SUM(A2:A8)');
    expect(shiftFormula('A1+A5+SUM(A2:A6)', 'rows', 2, -2)).toBe('A1+A3+SUM(A2:A4)');
    expect(shiftFormula('A3', 'rows', 2, -1)).toBe('#REF!');
    expect(shiftFormula('B1+$D$1', 'cols', 1, 1)).toBe('C1+$E$1');
    expect(shiftFormula('Other!A5+A5', 'rows', 0, 1, { formulaSheet: 'S1', targetSheet: 'Other' })).toBe('Other!A6+A5');
  });
});
