import { describe, expect, it } from 'vitest';
import { colName, colIndex, parseRef, refName, cellKey, parseKey } from '../src/sheet/address';

describe('sheet addresses', () => {
  it('converts column indexes and names', () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    expect(['A', 'z', 'AA', 'AAA'].map(colIndex)).toEqual([0, 25, 26, 702]);
  });
  it('parses and formats A1 references', () => {
    expect(parseRef('$B$3')).toEqual({ row: 2, col: 1, absRow: true, absCol: true });
    expect(parseRef('c10')).toEqual({ row: 9, col: 2, absRow: false, absCol: false });
    expect(parseRef('A0')).toBeUndefined();
    expect(refName(4, 27)).toBe('AB5');
  });
  it('builds map keys', () => {
    expect(cellKey(1, 2)).toBe('1,2');
    expect(parseKey('1,2')).toEqual([1, 2]);
  });
});
