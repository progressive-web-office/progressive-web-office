import { describe, expect, it } from 'vitest';
import { REVIEW_KEYS, reviewAction, spreadStart } from '../src/review/keys';

const key = (k: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe('REVIEW-002 review shortcuts', () => {
  it('turns pages with j/k, n/p, Page Up/Down, the space bar and the side arrows', () => {
    for (const k of ['j', 'n', 'PageDown', ' ', 'ArrowRight']) expect(reviewAction(key(k))).toBe('next');
    for (const k of ['k', 'p', 'PageUp', 'ArrowLeft']) expect(reviewAction(key(k))).toBe('prev');
    expect(reviewAction(key(' ', { shiftKey: true }))).toBe('prev');
    expect(reviewAction(key('Home'))).toBe('first');
    expect(reviewAction(key('g'))).toBe('first');
    expect(reviewAction(key('End'))).toBe('last');
    expect(reviewAction(key('G', { shiftKey: true }))).toBe('last');
  });

  it('zooms, fits, lays out pages, comments and shows the help', () => {
    expect(reviewAction(key('+'))).toBe('zoomIn');
    expect(reviewAction(key('='))).toBe('zoomIn');
    expect(reviewAction(key('-'))).toBe('zoomOut');
    expect(reviewAction(key('w'))).toBe('fitWidth');
    expect(reviewAction(key('h'))).toBe('fitPage');
    expect(reviewAction(key('0'))).toBe('fitPage');
    expect(reviewAction(key('2'))).toBe('perRow2');
    expect(reviewAction(key('s'))).toBe('flow');
    expect(reviewAction(key('c'))).toBe('comment');
    expect(reviewAction(key(']'))).toBe('nextComment');
    expect(reviewAction(key('['))).toBe('prevComment');
    expect(reviewAction(key('f'))).toBe('fullscreen');
    expect(reviewAction(key('/'))).toBe('find');
    expect(reviewAction(key('?', { shiftKey: true }))).toBe('help');
  });

  it('leaves keys with Ctrl, Cmd or Alt to the browser', () => {
    expect(reviewAction(key('j', { ctrlKey: true }))).toBeUndefined();
    expect(reviewAction(key('c', { metaKey: true }))).toBeUndefined();
    expect(reviewAction(key('f', { altKey: true }))).toBeUndefined();
    expect(reviewAction(key('x'))).toBeUndefined();
  });

  it('lists every shortcut for the help', () => {
    expect(REVIEW_KEYS.map((k) => k.action)).toContain('next');
    expect(new Set(REVIEW_KEYS.map((k) => k.action)).size).toBe(REVIEW_KEYS.length);
  });

  it('starts a spread of n pages on a multiple of n', () => {
    expect(spreadStart(1, 2)).toBe(1);
    expect(spreadStart(2, 2)).toBe(1);
    expect(spreadStart(3, 2)).toBe(3);
    expect(spreadStart(7, 3)).toBe(7);
    expect(spreadStart(6, 3)).toBe(4);
    expect(spreadStart(5, 1)).toBe(5);
  });
});

describe('REVIEW-001 pages of a text document', async () => {
  const { pageAt, spreadWidth, PAGE } = await import('../src/document/review');
  it('finds the page of a point of the paged content', () => {
    expect(pageAt(0)).toBe(0);
    expect(pageAt(PAGE.marginX + 10)).toBe(0);
    expect(pageAt(PAGE.width - 1)).toBe(0);
    expect(pageAt(PAGE.width + PAGE.gap + PAGE.marginX)).toBe(1);
    expect(pageAt(3 * (PAGE.width + PAGE.gap) + 5)).toBe(3);
  });
  it('measures spreads', () => {
    expect(spreadWidth(1)).toBe(PAGE.width);
    expect(spreadWidth(2)).toBe(2 * PAGE.width + PAGE.gap);
  });
});
