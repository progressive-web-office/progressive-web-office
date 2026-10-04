import { describe, expect, it } from 'vitest';
import { along, floodFill, hexToRgba, keepsAlpha, pixelAt, rectBetween, rgbaToHex } from '../src/paint/pixels';

/** A w×h white picture with a black vertical line at column `wall`. */
function picture(w: number, h: number, wall: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) d.set([0, 0, 0, 255], (y * w + wall) * 4);
  return d;
}

describe('DRAW-008 bitmap painting', () => {
  it('converts colours', () => {
    expect(hexToRgba('#ff8000')).toEqual([255, 128, 0, 255]);
    expect(hexToRgba('#000000', 0.5)).toEqual([0, 0, 0, 128]);
    expect(rgbaToHex([255, 128, 0, 255])).toBe('#ff8000');
  });

  it('fills the region around a point, stopped by lines of another colour', () => {
    const d = picture(6, 4, 3);
    expect(floodFill(d, 6, 4, 0, 0, [255, 0, 0, 255])).toBe(12);
    expect(pixelAt(d, 6, 2, 3)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(d, 6, 3, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(d, 6, 4, 0)).toEqual([255, 255, 255, 255]);
    // Filling with the same colour again changes the same region, not more.
    expect(floodFill(d, 6, 4, 0, 0, [255, 0, 0, 255])).toBe(12);
    expect(floodFill(d, 6, 4, 9, 9, [0, 0, 0, 255])).toBe(0);
  });

  it('fills within a tolerance and blends a translucent colour', () => {
    const d = picture(4, 1, 3);
    d.set([250, 250, 250, 255], 4);
    expect(floodFill(d, 4, 1, 0, 0, [0, 0, 255, 128], 10)).toBe(3);
    expect(pixelAt(d, 4, 0, 0)).toEqual([127, 127, 255, 255]);
    expect(floodFill(picture(4, 1, 3), 4, 1, 0, 0, [0, 0, 255, 255], 0)).toBe(3);
  });

  it('fills a large picture without running out of stack', () => {
    const d = new Uint8ClampedArray(800 * 600 * 4);
    expect(floodFill(d, 800, 600, 400, 300, [0, 128, 0, 255])).toBe(800 * 600);
  });

  it('gives rectangles inside the canvas and stamps along a stroke', () => {
    expect(rectBetween([10.5, 8], [2, -3], 9, 9)).toEqual({ x: 2, y: 0, w: 7, h: 8 });
    expect(along([0, 0], [10, 0], 4)).toEqual([[10 / 3, 0], [20 / 3, 0], [10, 0]]);
    expect(keepsAlpha('image/jpeg')).toBe(false);
    expect(keepsAlpha('image/png')).toBe(true);
  });
});
