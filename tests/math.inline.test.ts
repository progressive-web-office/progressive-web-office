import { describe, expect, it } from 'vitest';
import { expandMathRuns, findTypedMath, hasDollarMath, splitDollarMath } from '../src/math/inline';

describe('TEX-006 $…$ in plain text', () => {
  it('splits inline and display math', () => {
    expect(splitDollarMath('Area $\\pi r^2$ and $$E=mc^2$$.')).toEqual([
      { text: 'Area ' },
      { math: '\\pi r^2', display: false },
      { text: ' and ' },
      { math: 'E=mc^2', display: true },
      { text: '.' },
    ]);
  });

  it('ignores prices, escaped and unbalanced dollars', () => {
    expect(splitDollarMath('Costs $5 and $10')).toEqual([{ text: 'Costs $5 and $10' }]);
    expect(splitDollarMath('\\$x\\$ stays')).toEqual([{ text: '$x$ stays' }]);
    expect(splitDollarMath('a $ b')).toEqual([{ text: 'a $ b' }]);
    expect(hasDollarMath('Costs $5 and $10')).toBe(false);
    expect(hasDollarMath('$x^2$')).toBe(true);
  });

  it('expands text runs into math runs keeping formatting', () => {
    expect(expandMathRuns([{ text: 'Let $x$ be', bold: true }, { math: 'y' }])).toEqual([
      { text: 'Let ', bold: true },
      { math: 'x' },
      { text: ' be', bold: true },
      { math: 'y' },
    ]);
  });
});

describe('TEX-005 typing $…$', () => {
  it('detects a just-closed inline equation', () => {
    expect(findTypedMath('The formula $a^2+b^2$')).toEqual({ start: 12, latex: 'a^2+b^2', display: false });
    expect(findTypedMath('Display $$\\sum_i x_i$$')).toEqual({ start: 8, latex: '\\sum_i x_i', display: true });
  });

  it('does not trigger on prices or incomplete input', () => {
    expect(findTypedMath('costs $5 or $')).toBeNull();
    expect(findTypedMath('just $')).toBeNull();
    expect(findTypedMath('$ x$')).toBeNull();
    expect(findTypedMath('escaped \\$x$')).toBeNull();
    expect(findTypedMath('open $$x$')).toBeNull();
  });
});

describe('fillWithMath', () => {
  it('creates equation placeholders only when needed', async () => {
    const { fillWithMath } = await import('../src/math/inline');
    const el = document.createElement('td');
    expect(fillWithMath(el, '$5')).toBe(false);
    expect(el.textContent).toBe('$5');
    expect(fillWithMath(el, 'v = $\\frac{d}{t}$')).toBe(true);
    const span = el.querySelector<HTMLElement>('span.math')!;
    expect(span.dataset.latex).toBe('\\frac{d}{t}');
    expect(span.dataset.display).toBeUndefined();
  });
});
