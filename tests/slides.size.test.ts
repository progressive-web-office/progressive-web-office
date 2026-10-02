import { describe, expect, it } from 'vitest';
import { emptyPresentation, resizePresentation, SLIDE_SIZES, slideOrientation, slideSizeFor, textShape } from '../src/slides/model';
import { readPresentation, writePresentation } from '../src/slides/io';
import { readZip, readZipText } from '../src/core/zip';
import { TEMPLATES, type Built } from '../src/templates/catalog';
import { fitFontSize } from '../src/templates/catalog';

describe('PRES-013 slide size and orientation', () => {
  it('names the sizes and their orientation', () => {
    expect(SLIDE_SIZES.map((s) => s.id)).toEqual(['16:9', '4:3', 'A4', 'Letter']);
    expect(slideSizeFor('A4', 'portrait')).toEqual({ width: 794, height: 1123 });
    expect(slideSizeFor('A4', 'landscape')).toEqual({ width: 1123, height: 794 });
    expect(slideOrientation({ width: 794, height: 1123 })).toBe('portrait');
    expect(slideOrientation(emptyPresentation())).toBe('landscape');
  });

  it('scales shapes and text to the new size, keeping them on the slide', () => {
    const pres = { ...emptyPresentation(), width: 1123, height: 794 };
    pres.slides = [{ shapes: [textShape('GO', { x: 40, y: 40, width: 1043, height: 714, fontSize: 400, paragraphs: [{ type: 'paragraph', style: 'normal', runs: [{ text: 'GO', size: 300 }] }] })] }];
    resizePresentation(pres, 794, 1123);
    const s = pres.slides[0]!.shapes[0]!;
    expect([pres.width, pres.height]).toEqual([794, 1123]);
    expect(s.x + s.width).toBeLessThanOrEqual(794);
    expect(s.y + s.height).toBeLessThanOrEqual(1123);
    expect(s.fontSize).toBe(Math.round(400 * (794 / 1123)));
    expect((s.paragraphs[0]!.runs[0] as { size: number }).size).toBe(Math.round(300 * (794 / 1123)));
  });

  it('declares the orientation in OpenDocument and keeps the size in both formats', () => {
    const pres = { ...emptyPresentation() };
    resizePresentation(pres, 794, 1123);
    const odp = writePresentation(pres, 'odp');
    expect(readZipText(readZip(odp), 'styles.xml')).toContain('style:print-orientation="portrait"');
    for (const f of ['odp', 'pptx'] as const) {
      const back = readPresentation(f, writePresentation(pres, f));
      expect([Math.round(back.width), Math.round(back.height)]).toEqual([794, 1123]);
    }
  });
});

describe('FILE-018 race signs', () => {
  it('fits each word in very large letters on an A4 landscape page', () => {
    const pres = (TEMPLATES.find((t) => t.id === 'race-signs')!.build('fr') as Extract<Built, { kind: 'presentation' }>).pres;
    expect([pres.width, pres.height]).toEqual([1123, 794]);
    expect(pres.slides.length).toBeGreaterThanOrEqual(6);
    const sizes = pres.slides.map((s) => s.shapes[0]!.fontSize);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(120);
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(400);
    expect(fitFontSize('ARRIVÉE', 1043, 570)).toBeLessThan(fitFontSize('→', 1043, 570));
  });
});
