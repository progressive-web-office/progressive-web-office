import { describe, expect, it } from 'vitest';
import { findAll, findInPages } from '../src/pdf/find';

describe('PDF-017 text search in PDF', () => {
  it('ignores case and accents and keeps positions', () => {
    expect(findAll('Électricité et ELECTRONIQUE', 'electr')).toEqual([0, 15]);
    expect(findAll('aaaa', 'aa')).toEqual([0, 2]);
    expect(findAll('abc', '  ')).toEqual([]);
  });
  it('lists the matches page by page', () => {
    expect(findInPages([['Hello page 1'], ['nothing', 'page 2 page']], 'page')).toEqual([
      { page: 0, item: 0, offset: 6 },
      { page: 1, item: 1, offset: 0 },
      { page: 1, item: 1, offset: 7 },
    ]);
  });
});
