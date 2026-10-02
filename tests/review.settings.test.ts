import { beforeEach, describe, expect, it } from 'vitest';
import { loadReading, rememberReading, saveReading } from '../src/review/settings';

describe('SET-002 reading and review settings', () => {
  beforeEach(() => localStorage.clear());

  it('has defaults', () => {
    expect(loadReading()).toEqual({ perRow: 1, zoom: 'width', flow: 'scroll', rememberLast: true, review: false });
  });

  it('keeps the chosen defaults', () => {
    saveReading({ perRow: 2, zoom: 'page', flow: 'pages' });
    expect(loadReading()).toMatchObject({ perRow: 2, zoom: 'page', flow: 'pages', rememberLast: true });
  });

  it('remembers the last choice of the toolbar only when asked to', () => {
    rememberReading({ perRow: 3 });
    expect(loadReading().perRow).toBe(3);
    saveReading({ rememberLast: false, perRow: 2 });
    rememberReading({ perRow: 4, flow: 'pages' });
    expect(loadReading()).toMatchObject({ perRow: 2, flow: 'scroll' });
  });

  it('ignores invalid values and reads the former PDF view', () => {
    localStorage.setItem('pwo.reading', JSON.stringify({ perRow: 5, zoom: 'huge', flow: 'x', review: 'yes' }));
    expect(loadReading()).toMatchObject({ perRow: 1, zoom: 'width', flow: 'scroll', review: false });
    // The former separate settings turn the review mode on.
    localStorage.setItem('pwo.reading', JSON.stringify({ docReview: true }));
    expect(loadReading().review).toBe(true);
    localStorage.clear();
    localStorage.setItem('pwo.pdf.view', JSON.stringify({ zoom: 'page', columns: 2, flow: 'pages' }));
    expect(loadReading()).toMatchObject({ perRow: 2, zoom: 'page', flow: 'pages' });
  });
});
