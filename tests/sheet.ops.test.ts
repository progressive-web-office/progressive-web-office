import { describe, expect, it } from 'vitest';
import { getCell, newWorkbook, setInput, newSheet } from '../src/sheet/model';
import { Calculator } from '../src/sheet/engine';
import { addSheet, deleteSheet, insertCells, deleteCells, renameSheet, copyRange, pasteText, clearRange } from '../src/sheet/ops';
import { readWorkbook, writeWorkbook } from '../src/sheet/io';
import { detectFormat } from '../src/core/format';

function wb() {
  const w = newWorkbook();
  const s = w.sheets[0]!;
  setInput(s, 'A1', '1');
  setInput(s, 'A2', '2');
  setInput(s, 'A3', '3');
  setInput(s, 'B1', '=SUM(A1:A3)');
  setInput(s, 'B2', '=A3*10');
  const o = newSheet('Other');
  setInput(o, 'A1', '=Sheet1!A3+1');
  w.sheets.push(o);
  return w;
}

describe('SHEET-011 insert / delete rows and columns', () => {
  it('inserts rows, moving cells and fixing formulas on all sheets', () => {
    const w = wb();
    insertCells(w, 0, 'rows', 1, 2);
    const s = w.sheets[0]!;
    expect(getCell(s, 'A4')).toEqual({ value: 2 });
    expect(getCell(s, 'A2')).toBeUndefined();
    expect(getCell(s, 'B1')?.formula).toBe('SUM(A1:A5)');
    expect(getCell(s, 'B4')?.formula).toBe('A5*10');
    expect(getCell(w.sheets[1]!, 'A1')?.formula).toBe('Sheet1!A5+1');
    expect(new Calculator(w).value(0, 'B1')).toBe(6);
  });

  it('deletes rows, producing #REF! for deleted references', () => {
    const w = wb();
    deleteCells(w, 0, 'rows', 2, 1);
    const s = w.sheets[0]!;
    expect(getCell(s, 'A3')).toBeUndefined();
    expect(getCell(s, 'B1')?.formula).toBe('SUM(A1:A2)');
    expect(getCell(s, 'B2')?.formula).toBe('#REF!*10');
    expect(new Calculator(w).value(0, 'B2')).toEqual({ error: '#REF!' });
  });

  it('inserts and deletes columns', () => {
    const w = wb();
    insertCells(w, 0, 'cols', 0, 1);
    expect(getCell(w.sheets[0]!, 'C1')?.formula).toBe('SUM(B1:B3)');
    deleteCells(w, 0, 'cols', 0, 1);
    expect(getCell(w.sheets[0]!, 'B1')?.formula).toBe('SUM(A1:A3)');
  });
});

describe('SHEET-010 worksheets', () => {
  it('adds sheets with unique names', () => {
    const w = newWorkbook();
    expect(addSheet(w)).toBe(1);
    expect(w.sheets.map((s) => s.name)).toEqual(['Sheet1', 'Sheet2']);
  });

  it('renames sheets, validating names and updating references', () => {
    const w = wb();
    renameSheet(w, 0, 'Data 2026');
    expect(getCell(w.sheets[1]!, 'A1')?.formula).toBe("'Data 2026'!A3+1");
    expect(() => renameSheet(w, 0, 'Other')).toThrow(/already/);
    expect(() => renameSheet(w, 0, 'bad/name')).toThrow(/character/);
    expect(() => renameSheet(w, 0, '')).toThrow();
  });

  it('deletes a sheet (never the last one)', () => {
    const w = wb();
    deleteSheet(w, 1);
    expect(w.sheets).toHaveLength(1);
    expect(() => deleteSheet(w, 0)).toThrow(/last/);
  });
});

describe('SHEET-013 copy / paste as tab-separated text', () => {
  it('copies displayed values as TSV and pastes text into cells', () => {
    const w = wb();
    const calc = new Calculator(w);
    expect(copyRange(w, 0, calc, { r1: 0, c1: 0, r2: 1, c2: 1 })).toBe('1\t6\n2\t30');
    pasteText(w, 1, { row: 2, col: 1 }, 'x\t2\n=A1\ty');
    const o = w.sheets[1]!;
    expect(getCell(o, 'B3')).toEqual({ value: 'x' });
    expect(getCell(o, 'C3')).toEqual({ value: 2 });
    expect(getCell(o, 'B4')?.formula).toBe('A1');
    clearRange(w, 1, { r1: 2, c1: 1, r2: 3, c2: 2 });
    expect(o.cells.size).toBe(1);
  });
});

describe('FILE-006 spreadsheet conversions', () => {
  it.each(['xlsx', 'ods', 'csv'] as const)('writes %s that is detected and read back', (format) => {
    const bytes = writeWorkbook(wb(), format, 0);
    expect(detectFormat(`x.${format}`, bytes)).toBe(format);
    const back = readWorkbook(format, bytes, `x.${format}`);
    expect(new Calculator(back).value(0, 'B1')).toBe(6);
  });
});
