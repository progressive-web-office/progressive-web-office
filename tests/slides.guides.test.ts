import { describe, expect, it } from 'vitest';
import { snapMove, snapResize } from '../src/slides/guides';
import { layoutSlide, SLIDE_LAYOUTS } from '../src/slides/model';

const slide = { width: 960, height: 540 };

describe('PRES-015 alignment guides', () => {
  it('snaps a moved shape onto the edges and centre of another shape', () => {
    const other = { x: 100, y: 100, width: 200, height: 100 };
    const r = snapMove({ x: 104, y: 300, width: 80, height: 40 }, [other], slide, 6);
    expect([r.x, r.y]).toEqual([100, 300]);
    expect(r.guides).toEqual([{ axis: 'x', at: 100, from: 100, to: 340 }]);
    // Centre on centre.
    const c = snapMove({ x: 158, y: 400, width: 80, height: 40 }, [other], slide, 6);
    expect(c.x).toBe(160);
  });

  it('snaps to the slide, and not beyond the threshold', () => {
    const r = snapMove({ x: 437, y: 3, width: 80, height: 40 }, [], slide, 6);
    expect([r.x, r.y]).toEqual([440, 0]);
    expect(r.guides.map((g) => g.axis)).toEqual(['x', 'y']);
    const free = snapMove({ x: 420, y: 30, width: 80, height: 40 }, [], slide, 6);
    expect([free.x, free.y, free.guides]).toEqual([420, 30, []]);
    // A negative threshold (Alt held) never snaps.
    expect(snapMove({ x: 1, y: 1, width: 10, height: 10 }, [], slide, -1).guides).toEqual([]);
  });

  it('snaps the right and bottom edges of a resized shape', () => {
    const r = snapResize({ x: 100, y: 100, width: 196, height: 103 }, [{ x: 0, y: 0, width: 300, height: 200 }], slide, 6);
    expect([r.width, r.height]).toEqual([200, 100]);
  });
});

describe('PRES-016 layouts', () => {
  it('places the placeholders of each layout inside the slide', () => {
    for (const layout of SLIDE_LAYOUTS) {
      const s = layoutSlide(layout, 960, 540);
      for (const shape of s.shapes) {
        expect(shape.x).toBeGreaterThanOrEqual(0);
        expect(shape.x + shape.width).toBeLessThanOrEqual(960);
        expect(shape.y + shape.height).toBeLessThanOrEqual(540);
      }
    }
    expect(layoutSlide('blank').shapes).toEqual([]);
    expect(layoutSlide('twoContent').shapes.map((s) => s.placeholder)).toEqual(['title', 'body', 'body']);
    expect(layoutSlide('comparison').shapes).toHaveLength(5);
  });
});
