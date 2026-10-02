import { describe, expect, it } from 'vitest';
import { blocksToPm } from '../src/document/pm/convert';
import { checkAccessibility, contrast } from '../src/document/a11y';
import type { Block } from '../src/document/model';

describe('DOC-030 accessibility check', () => {
  it('finds pictures without alt text, skipped and empty headings, vague links, low contrast, tables without header', () => {
    const blocks: Block[] = [
      { type: 'paragraph', style: 'h1', runs: [{ text: 'Title' }] },
      { type: 'paragraph', style: 'h3', runs: [{ text: 'Too deep' }] },
      { type: 'paragraph', style: 'h2', runs: [] },
      { type: 'paragraph', style: 'normal', runs: [{ image: 'a' }, { image: 'b', alt: 'IMG_2041.jpg' }, { image: 'c', alt: '' }, { image: 'd', alt: 'A bridge' }] },
      { type: 'paragraph', style: 'normal', runs: [{ text: 'See ' }, { text: 'click here', link: 'https://example.org' }, { text: ' or ' }, { text: 'the report', link: 'https://example.org/r' }] },
      { type: 'paragraph', style: 'normal', runs: [{ text: 'pale', color: '#cccccc' }, { text: 'dark', color: '#1c2430' }] },
      { type: 'table', rows: [[{ blocks: [{ type: 'paragraph', style: 'normal', runs: [{ text: 'x' }] }] }]] },
    ];
    const issues = checkAccessibility(blocksToPm(blocks), { title: 'Report' });
    expect(issues.map((i) => [i.kind, i.detail])).toEqual([
      ['language', undefined],
      ['headingSkip', 'H1 → H3'],
      ['headingEmpty', undefined],
      ['alt', undefined],
      ['altFileName', 'IMG_2041.jpg'],
      ['linkText', 'click here'],
      ['contrast', '1.6:1'],
      ['tableHeader', undefined],
    ]);
    expect(issues.every((i) => i.kind === 'language' || typeof i.pos === 'number')).toBe(true);
  });

  it('computes WCAG contrast ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});
