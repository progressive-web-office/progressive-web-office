import { describe, expect, it } from 'vitest';
import { newWorkbook, setInput } from '../src/sheet/model';
import { Calculator } from '../src/sheet/engine';
import { readWorkbook, writeWorkbook } from '../src/sheet/io';
import { insertCells } from '../src/sheet/ops';
import { cleanConditional, condFromOdf, evaluateConditional, odfCondValue, type CondRule, type ConditionalFormat } from '../src/sheet/conditional';

const r = (r1: number, c1: number, r2 = r1, c2 = c1) => ({ r1, c1, r2, c2 });
const red = { fill: '#ffc7ce', color: '#9c0006' };

function sheetWith(values: string[], conditional: ConditionalFormat[]) {
  const wb = newWorkbook();
  const sheet = wb.sheets[0]!;
  values.forEach((v, i) => setInput(sheet, [i, 0], v));
  sheet.conditional = conditional;
  const calc = new Calculator(wb);
  return { wb, sheet, looks: evaluateConditional(sheet, (row, col) => calc.value(0, [row, col])) };
}
const keys = (m: Map<string, unknown>) => [...m.keys()].map((k) => Number(k.split(',')[0])).sort((a, b) => a - b);

describe('SHEET-029 conditional formatting', () => {
  it('formats cells by comparison, text, duplicates, average and rank', () => {
    const values = ['5', '12', '7', '12', 'apple pie', '=A1*4'];
    const cases: [CondRule, number[]][] = [
      [{ kind: 'cellIs', op: 'greaterThan', a: 10, style: red }, [1, 3, 5]],
      [{ kind: 'cellIs', op: 'between', a: 7, b: 5, style: red }, [0, 2]],
      [{ kind: 'cellIs', op: 'equal', a: 'APPLE PIE', style: red }, [4]],
      [{ kind: 'containsText', text: 'pie', style: red }, [4]],
      [{ kind: 'duplicate', style: red }, [1, 3]],
      [{ kind: 'unique', style: red }, [0, 2, 4, 5]],
      [{ kind: 'aboveAverage', style: red }, [1, 3, 5]],
      [{ kind: 'belowAverage', style: red }, [0, 2]],
      [{ kind: 'top', rank: 1, style: red }, [5]],
      [{ kind: 'bottom', rank: 2, style: red }, [0, 2]],
      [{ kind: 'top', rank: 40, percent: true, style: red }, [1, 3, 5]],
    ];
    for (const [rule, rows] of cases) expect([rule.kind, keys(sheetWith(values, [{ ranges: [r(0, 0, 9, 0)], rule }]).looks)]).toEqual([rule.kind, rows]);
  });

  it('colours a scale and draws data bars', () => {
    const { looks } = sheetWith(['0', '5', '10'], [{ ranges: [r(0, 0, 2, 0)], rule: { kind: 'colorScale', colors: ['#ff0000', '#ffff00', '#00ff00'] } }]);
    expect([0, 1, 2].map((i) => looks.get(`${i},0`)?.look?.fill)).toEqual(['#ff0000', '#ffff00', '#00ff00']);
    const two = sheetWith(['0', '5', '10'], [{ ranges: [r(0, 0, 2, 0)], rule: { kind: 'colorScale', colors: ['#000000', '#ffffff'] } }]);
    expect(two.looks.get('1,0')?.look?.fill).toBe('#808080');
    const bars = sheetWith(['2', '4', 'x'], [{ ranges: [r(0, 0, 2, 0)], rule: { kind: 'dataBar', color: '#638ec6' } }]);
    expect([bars.looks.get('0,0')?.bar?.ratio, bars.looks.get('1,0')?.bar?.ratio, bars.looks.get('2,0')]).toEqual([0.5, 1, undefined]);
  });

  it('lets the first format win', () => {
    const { looks } = sheetWith(['20'], [
      { ranges: [r(0, 0)], rule: { kind: 'cellIs', op: 'greaterThan', a: 10, style: { fill: '#ff0000' } } },
      { ranges: [r(0, 0)], rule: { kind: 'cellIs', op: 'greaterThan', a: 1, style: { fill: '#00ff00', bold: true } } },
    ]);
    expect(looks.get('0,0')?.look).toEqual({ fill: '#ff0000', bold: true });
  });

  it('follows inserted rows', () => {
    const { wb, sheet } = sheetWith(['1'], [{ ranges: [r(0, 0, 4, 0)], rule: { kind: 'duplicate', style: red } }]);
    insertCells(wb, 0, 'rows', 2, 3);
    expect(sheet.conditional![0]!.ranges).toEqual([r(0, 0, 7, 0)]);
  });

  it('writes LibreOffice conditions and reads them back', () => {
    const rules: CondRule[] = [
      { kind: 'cellIs', op: 'lessThanOrEqual', a: -2.5, style: red },
      { kind: 'cellIs', op: 'notBetween', a: 1, b: 9, style: red },
      { kind: 'cellIs', op: 'equal', a: 'a, "b"', style: red },
      { kind: 'containsText', text: 'late', style: red },
      { kind: 'unique', style: red },
      { kind: 'bottom', rank: 10, percent: true, style: red },
    ];
    for (const rule of rules) expect(condFromOdf(odfCondValue(rule)!, red)).toEqual(rule);
  });

  const all: ConditionalFormat[] = [
    { ranges: [r(0, 0, 9, 0)], rule: { kind: 'cellIs', op: 'greaterThan', a: 10, style: { fill: '#ffc7ce', color: '#9c0006', bold: true } } },
    { ranges: [r(0, 0, 9, 0), r(0, 2, 3, 3)], rule: { kind: 'cellIs', op: 'between', a: 'a', b: 'm', style: { italic: true } } },
    { ranges: [r(0, 1, 9, 1)], rule: { kind: 'containsText', text: 'late', style: { color: '#9c5700' } } },
    { ranges: [r(0, 1, 9, 1)], rule: { kind: 'duplicate', style: { fill: '#ffeb9c' } } },
    { ranges: [r(0, 1, 9, 1)], rule: { kind: 'belowAverage', style: { underline: true } } },
    { ranges: [r(0, 1, 9, 1)], rule: { kind: 'top', rank: 3, style: { fill: '#c6efce' } } },
    { ranges: [r(0, 4, 9, 4)], rule: { kind: 'colorScale', colors: ['#f8696b', '#ffeb84', '#63be7b'] } },
    { ranges: [r(0, 5, 9, 5)], rule: { kind: 'dataBar', color: '#638ec6' } },
  ];
  it.each(['xlsx', 'ods'] as const)('keeps conditional formats in %s', (format) => {
    const wb = newWorkbook();
    setInput(wb.sheets[0]!, 'A1', '12');
    wb.sheets[0]!.conditional = all;
    const back = readWorkbook(format, writeWorkbook(wb, format)).sheets[0]!;
    expect(back.conditional).toEqual(all);
  });

  it('drops malformed formats from the network', () => {
    expect(cleanConditional([{ ranges: [r(0, 0)], rule: { kind: 'colorScale', colors: ['red', '#00ff00'] } }])).toBeUndefined();
    expect(cleanConditional([{ ranges: [r(0, 0)], rule: { kind: 'duplicate', style: { fill: '#AABBCC', evil: 'x' } } }])).toEqual([{ ranges: [r(0, 0)], rule: { kind: 'duplicate', style: { fill: '#aabbcc' } } }]);
  });
});
