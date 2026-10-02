import { describe, expect, it } from 'vitest';
import { fitScale } from '../src/pdf/fit';

describe('PDF-016 zoom to the width or the whole page, n pages per row', () => {
  const a4 = { pageWidth: 595, pageHeight: 842, gap: 12 };
  it('fits the width of one or several pages', () => {
    expect(fitScale('width', { ...a4, width: 1226, height: 700, columns: 2 })).toBeCloseTo(1, 5);
    expect(fitScale('width', { ...a4, width: 619, height: 700, columns: 1 })).toBeCloseTo(1, 5);
  });
  it('fits the whole page: the height limits a tall page', () => {
    expect(fitScale('page', { ...a4, width: 1226, height: 866, columns: 1 })).toBeCloseTo(1, 5);
    expect(fitScale('page', { ...a4, width: 1226, height: 866, columns: 2 })).toBeCloseTo(1, 5);
    expect(fitScale('page', { ...a4, width: 800, height: 866, columns: 4 })).toBeLessThan(0.4);
  });
  it('keeps a percentage as it is', () => {
    expect(fitScale(1.5, { ...a4, width: 100, height: 100, columns: 3 })).toBe(1.5);
  });
});
