import { describe, expect, it } from 'vitest';
import { Calculator } from '../src/sheet/engine';
import { newWorkbook, parseInput, setCell } from '../src/sheet/model';
import { parseRef } from '../src/sheet/address';

const f = (formula: string, cells: Record<string, string> = {}) => {
  const wb = newWorkbook();
  for (const [ref, text] of Object.entries({ ...cells, Z99: `=${formula}` })) {
    const r = parseRef(ref)!;
    setCell(wb.sheets[0]!, [r.row, r.col], parseInput(text));
  }
  return new Calculator(wb).value(0, 'Z99');
};
const NUM = { error: '#NUM!' };
const NA = { error: '#N/A' };

// Expected values are those of Excel and LibreOffice Calc.
describe('SHEET-025 more spreadsheet functions', () => {
  it('logic and information', () => {
    expect(f('IFS(1>2,"a",2>1,"b")')).toBe('b');
    expect(f('IFS(1>2,"a")')).toEqual(NA);
    expect(f('SWITCH(2,1,"one",2,"two","other")')).toBe('two');
    expect(f('SWITCH(9,1,"one","other")')).toBe('other');
    expect(f('XOR(TRUE,FALSE,TRUE)')).toBe(false);
    expect(f('ISERROR(1/0)')).toBe(true);
    expect(f('ISNA(NA())')).toBe(true);
    expect(f('ISERR(NA())')).toBe(false);
    expect(f('IFNA(VLOOKUP("x",A1:B1,2,FALSE),"none")', { A1: 'y', B1: '1' })).toBe('none');
    expect(f('ISEVEN(4)')).toBe(true);
    expect(f('ISODD(-3)')).toBe(true);
    expect(f('ISLOGICAL(TRUE())')).toBe(true);
  });

  it('mathematics', () => {
    expect(f('TRUNC(-4.7)')).toBe(-4);
    expect(f('TRUNC(3.14159,2)')).toBe(3.14);
    expect(f('CEILING(4.2,0.5)')).toBe(4.5);
    expect(f('FLOOR(4.7,2)')).toBe(4);
    expect(f('MROUND(10,3)')).toBe(9);
    expect(f('MROUND(-10,3)')).toEqual(NUM);
    expect(f('EVEN(1.5)')).toBe(2);
    expect(f('ODD(2)')).toBe(3);
    expect(f('ODD(0)')).toBe(1);
    expect(f('EVEN(-1)')).toBe(-2);
    expect(f('FACT(5)')).toBe(120);
    expect(f('COMBIN(8,2)')).toBe(28);
    expect(f('PERMUT(5,2)')).toBe(20);
    expect(f('GCD(24,36)')).toBe(12);
    expect(f('LCM(4,6)')).toBe(12);
    expect(f('QUOTIENT(-7,2)')).toBe(-3);
    expect(f('SUMPRODUCT(A1:A3,B1:B3)', { A1: '1', A2: '2', A3: '3', B1: '4', B2: '5', B3: '6' })).toBe(32);
    const r = f('RANDBETWEEN(1,6)') as number;
    expect(r >= 1 && r <= 6 && Number.isInteger(r)).toBe(true);
  });

  it('conditional aggregates', () => {
    const cells = { A1: 'a', A2: 'b', A3: 'a', A4: 'a', B1: '10', B2: '20', B3: '30', B4: '40', C1: 'x', C2: 'x', C3: 'y', C4: 'x' };
    expect(f('COUNTIFS(A1:A4,"a",C1:C4,"x")', cells)).toBe(2);
    expect(f('SUMIFS(B1:B4,A1:A4,"a",B1:B4,">15")', cells)).toBe(70);
    expect(f('AVERAGEIFS(B1:B4,A1:A4,"a")', cells)).toBeCloseTo(80 / 3);
    expect(f('MAXIFS(B1:B4,C1:C4,"x")', cells)).toBe(40);
    expect(f('MINIFS(B1:B4,C1:C4,"x")', cells)).toBe(10);
    expect(f('AVERAGEIF(A1:A4,"a",B1:B4)', cells)).toBeCloseTo(80 / 3);
    expect(f('AVERAGEIF(B1:B4,">15")', cells)).toBe(30);
    expect(f('AVERAGEIFS(B1:B4,A1:A4,"z")', cells)).toEqual({ error: '#DIV/0!' });
  });

  it('statistics', () => {
    const cells = { A1: '3', A2: '1', A3: '4', A4: '1', A5: '5' };
    expect(f('LARGE(A1:A5,2)', cells)).toBe(4);
    expect(f('SMALL(A1:A5,1)', cells)).toBe(1);
    expect(f('SMALL(A1:A5,9)', cells)).toEqual(NUM);
    expect(f('RANK(4,A1:A5)', cells)).toBe(2);
    expect(f('RANK.EQ(1,A1:A5,1)', cells)).toBe(1);
    expect(f('MODE(A1:A5)', cells)).toBe(1);
    expect(f('PERCENTILE(A1:A5,0.5)', cells)).toBe(3);
    expect(f('QUARTILE(A1:A5,1)', cells)).toBe(1);
    expect(f('QUARTILE(A1:A5,3)', cells)).toBe(4);
    expect(f('GEOMEAN(2,8)')).toBeCloseTo(4);
  });

  it('text', () => {
    const cells = { A1: 'Ada', A2: '', A3: 'Alan' };
    expect(f('TEXTJOIN(", ",TRUE,A1:A3)', cells)).toBe('Ada, Alan');
    expect(f('TEXTJOIN("-",FALSE,A1:A3)', cells)).toBe('Ada--Alan');
    expect(f('SUBSTITUTE("a-b-c","-","+")')).toBe('a+b+c');
    expect(f('SUBSTITUTE("a-b-c","-","+",2)')).toBe('a-b+c');
    expect(f('REPLACE("abcdef",2,3,"X")')).toBe('aXef');
    expect(f('FIND("b","abcb")')).toBe(2);
    expect(f('FIND("B","abcb")')).toEqual({ error: '#VALUE!' });
    expect(f('SEARCH("B","abcb",3)')).toBe(4);
    expect(f('SEARCH("c?d","abcxd")')).toBe(3);
    expect(f('REPT("ab",3)')).toBe('ababab');
    expect(f('PROPER("jean-pierre dupont")')).toBe('Jean-Pierre Dupont');
    expect(f('EXACT("a","A")')).toBe(false);
    expect(f('VALUE("12,5")')).toBe(12.5);
    expect(f('VALUE("15%")')).toBe(0.15);
    expect(f('TEXT(0.256,"0.0%")')).toBe('25.6%');
    expect(f('CHAR(65)&CODE("a")')).toBe('A97');
  });

  it('lookup', () => {
    const cells = { A1: 'apple', A2: 'banana', A3: 'cherry', B1: '1', B2: '2', B3: '3', D1: '10', E1: '20', F1: '30', D2: 'x', E2: 'y', F2: 'z' };
    expect(f('INDEX(A1:B3,2,2)', cells)).toBe(2);
    expect(f('MATCH("cherry",A1:A3,0)', cells)).toBe(3);
    expect(f('MATCH(25,D1:F1)', cells)).toBe(2);
    expect(f('INDEX(B1:B3,MATCH("banana",A1:A3,0))', cells)).toBe(2);
    expect(f('XLOOKUP("cherry",A1:A3,B1:B3)', cells)).toBe(3);
    expect(f('XLOOKUP("kiwi",A1:A3,B1:B3,"none")', cells)).toBe('none');
    expect(f('HLOOKUP(20,D1:F2,2,FALSE)', cells)).toBe('y');
    expect(f('CHOOSE(2,"a","b","c")')).toBe('b');
    expect(f('MATCH("kiwi",A1:A3,0)', cells)).toEqual(NA);
  });

  it('dates and times', () => {
    const d = (y: number, m: number, day: number) => `DATE(${y},${m},${day})`;
    expect(f(`WEEKDAY(${d(2026, 10, 3)})`)).toBe(7); // a Saturday
    expect(f(`WEEKDAY(${d(2026, 10, 3)},2)`)).toBe(6);
    expect(f(`EDATE(${d(2026, 1, 31)},1)=${d(2026, 2, 28)}`)).toBe(true);
    expect(f(`EOMONTH(${d(2026, 1, 15)},1)=${d(2026, 2, 28)}`)).toBe(true);
    expect(f(`DAYS(${d(2026, 3, 1)},${d(2026, 2, 1)})`)).toBe(28);
    expect(f('HOUR(TIME(14,30,15))&":"&MINUTE(TIME(14,30,15))&":"&SECOND(TIME(14,30,15))')).toBe('14:30:15');
    expect(f(`NETWORKDAYS(${d(2026, 9, 28)},${d(2026, 10, 9)})`)).toBe(10);
    expect(f(`DATEDIF(${d(2000, 6, 15)},${d(2026, 6, 14)},"Y")`)).toBe(25);
    expect(f(`DATEDIF(${d(2026, 1, 31)},${d(2026, 3, 1)},"M")`)).toBe(1);
  });
});

describe('SHEET-025 newer functions in files', () => {
  it('names them as LibreOffice does in OpenDocument', async () => {
    const { excelToOf, ofToExcel } = await import('../src/sheet/openformula');
    const of = excelToOf('IFS(A1>1,"a",TRUE,XLOOKUP(B1,C1:C3,D1:D3))+RANK.EQ(1,E1:E3)');
    expect(of).toBe('of:=COM.MICROSOFT.IFS([.A1]>1;"a";TRUE;COM.MICROSOFT.XLOOKUP([.B1];[.C1:.C3];[.D1:.D3]))+COM.MICROSOFT.RANK.EQ(1;[.E1:.E3])');
    expect(ofToExcel(of)).toBe('IFS(A1>1,"a",TRUE,XLOOKUP(B1,C1:C3,D1:D3))+RANK.EQ(1,E1:E3)');
    expect(ofToExcel('of:="COM.MICROSOFT.IFS"&COUNTIFS([.A1:.A3];"x")')).toBe('"COM.MICROSOFT.IFS"&COUNTIFS(A1:A3,"x")');
  });
});
