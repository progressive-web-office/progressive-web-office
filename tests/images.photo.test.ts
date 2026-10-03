import { describe, expect, it } from 'vitest';
import { flipRect, isUnchanged, NO_EDIT, outputSize, rectBetween, turnedSize, turnRect } from '../src/images/photo';

describe('IMG-001 picture editing', () => {
  it('turns sizes and keeps rectangles inside the picture', () => {
    expect(turnedSize(400, 300, 90)).toEqual({ w: 300, h: 400 });
    expect(turnedSize(400, 300, 180)).toEqual({ w: 400, h: 300 });
    expect(rectBetween([350, 250], [-20, 100.4], 400, 300)).toEqual({ x: 0, y: 100, w: 350, h: 150 });
    expect(rectBetween([10.6, 5.2], [20.2, 30.9], 400, 300)).toEqual({ x: 10, y: 5, w: 11, h: 26 });
  });

  it('sizes the result: turned, cropped, resized', () => {
    expect(outputSize(400, 300, NO_EDIT)).toEqual({ w: 400, h: 300 });
    expect(outputSize(400, 300, { ...NO_EDIT, rotate: 270 })).toEqual({ w: 300, h: 400 });
    expect(outputSize(400, 300, { ...NO_EDIT, crop: { x: 10, y: 10, w: 200, h: 100 }, scale: 0.5 })).toEqual({ w: 100, h: 50 });
    expect(isUnchanged(NO_EDIT)).toBe(true);
    expect(isUnchanged({ ...NO_EDIT, brightness: 110 })).toBe(false);
  });

  it('moves a crop with the picture when it is turned or mirrored', () => {
    // A 400×300 picture, a 100×50 region at (10, 20).
    const r = { x: 10, y: 20, w: 100, h: 50 };
    // Turned clockwise: 300×400; the region's top-left corner goes to the right.
    expect(turnRect(r, 400, 300, 90)).toEqual({ x: 230, y: 10, w: 50, h: 100 });
    // Back again.
    expect(turnRect(turnRect(r, 400, 300, 90), 300, 400, 270)).toEqual(r);
    expect(flipRect(r, 400)).toEqual({ x: 290, y: 20, w: 100, h: 50 });
  });
});
