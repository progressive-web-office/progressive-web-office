import { describe, expect, it } from 'vitest';
import { newWorkbook, setInput } from '../src/sheet/model';
import { readWorkbook, writeWorkbook } from '../src/sheet/io';
import { insertCells, deleteCells } from '../src/sheet/ops';
import { cleanValidations, isValid, listItems, odfCondition, rangesOfCells, ruleFromOdf, setValidation, subtractRange, validationAt, type Validation, type ValidationRule } from '../src/sheet/validation';

const base = { allowBlank: true, errorStyle: 'stop' as const };
const r = (r1: number, c1: number, r2 = r1, c2 = c1) => ({ r1, c1, r2, c2 });

describe('SHEET-028 data validation', () => {
  it('checks lists, numbers, dates and text lengths', () => {
    const list: Validation = { ...base, ranges: [r(0, 0)], rule: { kind: 'list', items: ['yes', 'no', '3'] } };
    expect(isValid(list, 'yes')).toBe(true);
    expect(isValid(list, 'maybe')).toBe(false);
    expect(isValid(list, 3)).toBe(true);
    expect(isValid(list, null)).toBe(true);
    expect(isValid({ ...list, allowBlank: false }, '')).toBe(false);
    const whole: Validation = { ...base, ranges: [r(0, 0)], rule: { kind: 'whole', op: 'between', a: 1, b: 10 } };
    expect([isValid(whole, 5), isValid(whole, 5.5), isValid(whole, 11), isValid(whole, 'x')]).toEqual([true, false, false, false]);
    const dec: Validation = { ...base, ranges: [r(0, 0)], rule: { kind: 'decimal', op: 'greaterThanOrEqual', a: 0 } };
    expect([isValid(dec, 0), isValid(dec, -0.1)]).toEqual([true, false]);
    const len: Validation = { ...base, ranges: [r(0, 0)], rule: { kind: 'textLength', op: 'lessThanOrEqual', a: 3 } };
    expect([isValid(len, 'abc'), isValid(len, 'abcd'), isValid(len, 1234)]).toEqual([true, false, false]);
    const notBetween: Validation = { ...base, ranges: [r(0, 0)], rule: { kind: 'decimal', op: 'notBetween', a: 10, b: 0 } };
    expect([isValid(notBetween, 5), isValid(notBetween, -1)]).toEqual([false, true]);
  });

  it('reads a list from a range of the sheet', () => {
    const values: Record<string, string> = { '0,4': 'red', '1,4': 'green', '2,4': '' };
    expect(listItems({ kind: 'list', source: '$E$1:$E$3' }, (row, col) => values[`${row},${col}`] ?? null)).toEqual(['red', 'green']);
  });

  it('gives a range to a new validation, taking it from the others', () => {
    expect(subtractRange(r(0, 0, 9, 0), r(3, 0, 4, 0))).toEqual([r(0, 0, 2, 0), r(5, 0, 9, 0)]);
    const sheet = newWorkbook().sheets[0]!;
    setValidation(sheet, r(0, 0, 9, 1), { ...base, rule: { kind: 'whole', op: 'greaterThan', a: 0 } });
    setValidation(sheet, r(2, 1), { ...base, rule: { kind: 'list', items: ['a'] } });
    expect(validationAt(sheet, 2, 1)?.rule.kind).toBe('list');
    expect(validationAt(sheet, 2, 0)?.rule.kind).toBe('whole');
    setValidation(sheet, r(0, 0, 9, 1), undefined);
    expect(sheet.validations).toBeUndefined();
  });

  it('moves the ranges with inserted and deleted rows', () => {
    const wb = newWorkbook();
    const sheet = wb.sheets[0]!;
    setValidation(sheet, r(2, 0, 5, 0), { ...base, rule: { kind: 'whole', op: 'greaterThan', a: 0 } });
    insertCells(wb, 0, 'rows', 0, 2);
    expect(sheet.validations![0]!.ranges).toEqual([r(4, 0, 7, 0)]);
    deleteCells(wb, 0, 'rows', 5, 2);
    expect(sheet.validations![0]!.ranges).toEqual([r(4, 0, 5, 0)]);
    deleteCells(wb, 0, 'rows', 3, 5);
    expect(sheet.validations).toBeUndefined();
  });

  it('writes OpenDocument conditions and reads them back', () => {
    const rules = [
      { kind: 'list', items: ['a', 'say "hi"'] },
      { kind: 'list', source: '$E$1:$E$9' },
      { kind: 'whole', op: 'between', a: 1, b: 10 },
      { kind: 'decimal', op: 'greaterThan', a: 0.5 },
      { kind: 'date', op: 'notBetween', a: 46000, b: 46100 },
      { kind: 'textLength', op: 'lessThanOrEqual', a: 20 },
      { kind: 'textLength', op: 'between', a: 2, b: 5 },
    ] as ValidationRule[];
    for (const rule of rules) expect(ruleFromOdf(odfCondition(rule))).toEqual(rule);
    expect(ruleFromOdf('of:cell-content-is-in-list([.$Sheet2.$A$1:.$A$4])')).toEqual({ kind: 'list', source: '$A$1:$A$4' });
  });

  it('joins cells into ranges', () => {
    expect(rangesOfCells([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [5, 1]])).toEqual([r(0, 0, 2, 1), r(5, 1)]);
  });

  it.each(['xlsx', 'ods'] as const)('keeps validations in %s', (format) => {
    const wb = newWorkbook();
    const sheet = wb.sheets[0]!;
    setInput(sheet, 'A1', 'yes');
    setInput(sheet, 'E1', 'red');
    setInput(sheet, 'E2', 'blue');
    setValidation(sheet, r(0, 0, 4, 0), { ...base, rule: { kind: 'list', items: ['yes', 'no'] }, input: { title: 'Answer', message: 'Yes or no' }, error: { message: 'Only yes or no' } });
    setValidation(sheet, r(0, 1, 9, 2), { allowBlank: false, errorStyle: 'warning', rule: { kind: 'decimal', op: 'between', a: 0, b: 100 } });
    setValidation(sheet, r(1, 3), { ...base, errorStyle: 'information', rule: { kind: 'list', source: '$E$1:$E$2' } });
    const back = readWorkbook(format, writeWorkbook(wb, format)).sheets[0]!;
    expect(back.validations).toEqual(sheet.validations);
  });

  it('drops malformed validations from the network', () => {
    expect(cleanValidations([{ ranges: [r(0, 0)], rule: { kind: 'whole', op: 'nope', a: 1 } }, { ranges: [], rule: { kind: 'list', items: ['a'] } }])).toBeUndefined();
    expect(cleanValidations([{ ranges: [r(0, 0)], rule: { kind: 'list', items: ['a', 3] }, errorStyle: 'x' }])).toEqual([{ ranges: [r(0, 0)], rule: { kind: 'list', items: ['a'] }, allowBlank: true, errorStyle: 'stop' }]);
  });
});
