import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/teach/expr';
import { definitions, draw, random, substitute, substituteText } from '../src/teach/variants';
import type { Paragraph, RichDocument } from '../src/document/model';

describe('TEACH-002 random variants', () => {
  it('evaluates arithmetic without running code', () => {
    expect(evaluate('2 + 3 * 4 ^ 2 / 8', {})).toBe(8);
    expect(evaluate('-(R - 1) * sqrt(16) + round(pi, 2)', { R: 3 })).toBeCloseTo(-4.86 + 0 + 0, 5);
    expect(() => evaluate('alert(1)', {})).toThrow(/Unknown function/);
    expect(() => evaluate('R +', { R: 1 })).toThrow();
  });

  const doc = (): RichDocument => ({
    blocks: [
      { type: 'paragraph', style: 'normal', runs: [{ text: 'A resistor of {{R=rand(10..20)}} Ω carries {{I=rand(0.5..2, 0.5)}} A in a {{C=choice(red, blue)}} wire.' }] },
      { type: 'paragraph', style: 'normal', solution: true, runs: [{ text: 'U = {{R}} × {{I}} = {{=R*I}} V, P = {{=R*I^2|1}} W.' }] },
    ],
    resources: new Map(),
    meta: { language: 'en' },
  });

  it('finds the definitions and draws values within their ranges', () => {
    const defs = definitions(doc());
    expect(defs.map((d) => d.name)).toEqual(['R', 'I', 'C']);
    for (let seed = 1; seed < 50; seed++) {
      const v = draw(defs, random(seed));
      expect(v.R).toBeGreaterThanOrEqual(10);
      expect(v.R).toBeLessThanOrEqual(20);
      expect(Number.isInteger(v.R)).toBe(true);
      expect([0.5, 1, 1.5, 2]).toContain(v.I);
      expect(['red', 'blue']).toContain(v.C);
    }
  });

  it('writes the values and the computed answers', () => {
    const out = substitute(doc(), { R: 12, I: 1.5, C: 'red' });
    expect((out.blocks[0] as Paragraph).runs[0]).toEqual({ text: 'A resistor of 12 Ω carries 1.5 A in a red wire.' });
    expect((out.blocks[1] as Paragraph).runs[0]).toEqual({ text: 'U = 12 × 1.5 = 18 V, P = 27.0 W.' });
    expect(substituteText('{{=X/3|2}} and {{unknown}}', { X: 1 }, 'fr')).toBe('0,33 and {{unknown}}');
  });

  it('draws the same values from the same seed', () => {
    const defs = definitions(doc());
    expect(draw(defs, random(42))).toEqual(draw(defs, random(42)));
  });
});
