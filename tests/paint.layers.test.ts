import { describe, expect, it } from 'vitest';
import { readZip } from '../src/core/zip';
import { isOra, oraMerged, readOra, writeOra } from '../src/paint/ora';
import { bounds, cleanShapes, hits, moved, shapeAt, type VectorShape } from '../src/paint/vector';

const png = (n: number): Uint8Array => new Uint8Array([0x89, 0x50, 0x4e, 0x47, n]);

describe('DRAW-013 a layered painting as an OpenRaster file', () => {
  const shapes: VectorShape[] = [{ kind: 'text', x: 10, y: 20, text: 'Hello', size: 24, color: '#ff0000', opacity: 1 }];
  const image = {
    width: 320,
    height: 200,
    layers: [
      { name: 'Background', png: png(1), x: 0, y: 0, opacity: 1, visible: true },
      { name: 'Sketch <1>', png: png(2), x: 4, y: 6, opacity: 0.5, visible: false },
      { name: 'Titles', png: png(3), x: 0, y: 0, opacity: 1, visible: true, shapes },
    ],
  };

  it('writes the files other applications read, mimetype first and stored', () => {
    const bytes = writeOra(image, png(9), png(8));
    expect(isOra(bytes)).toBe(true);
    const zip = readZip(bytes);
    expect(Object.keys(zip)[0]).toBe('mimetype');
    expect(new TextDecoder().decode(zip['mimetype'])).toBe('image/openraster');
    const stack = new TextDecoder().decode(zip['stack.xml']);
    // From the top in stack.xml.
    expect(stack.indexOf('Titles')).toBeLessThan(stack.indexOf('Background'));
    expect(stack).toContain('name="Sketch &lt;1&gt;"');
    expect(stack).toContain('visibility="hidden"');
    expect(oraMerged(bytes)).toEqual(png(9));
    expect(zip['Thumbnails/thumbnail.png']).toEqual(png(8));
  });

  it('reads the layers back, from the bottom, with the shapes of the vector layer', () => {
    const back = readOra(writeOra(image, png(9), png(8)));
    expect(back.width).toBe(320);
    expect(back.layers.map((l) => [l.name, l.opacity, l.visible, l.x, l.y])).toEqual([
      ['Background', 1, true, 0, 0],
      ['Sketch <1>', 0.5, false, 4, 6],
      ['Titles', 1, true, 0, 0],
    ]);
    expect(back.layers[0]!.png).toEqual(png(1));
    expect(back.layers[2]!.shapes).toEqual(shapes);
    expect(back.layers[0]!.shapes).toBeUndefined();
  });

  it('tells an OpenRaster file from another ZIP', () => {
    expect(isOra(png(1))).toBe(false);
    expect(isOra(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(false);
  });
});

describe('DRAW-014 the shapes of a vector layer', () => {
  const rect: VectorShape = { kind: 'rect', x: 10, y: 10, w: 100, h: 50, color: '#000000', width: 4, opacity: 1, filled: false };
  const line: VectorShape = { kind: 'line', x1: 0, y1: 0, x2: 100, y2: 100, color: '#000000', width: 2, opacity: 1 };

  it('finds the shape under the pointer: the outline of an unfilled rectangle, near a line', () => {
    expect(hits(rect, 10, 30)).toBe(true);
    expect(hits(rect, 60, 35)).toBe(false);
    expect(hits({ ...rect, filled: true }, 60, 35)).toBe(true);
    expect(hits(line, 50, 52)).toBe(true);
    expect(hits(line, 50, 70)).toBe(false);
    expect(shapeAt([line, rect], 10, 12)).toBe(1);
  });

  it('moves and measures shapes, and keeps only well-formed ones from a file', () => {
    expect(moved(line, 5, -5)).toMatchObject({ x1: 5, y1: -5, x2: 105, y2: 95 });
    expect(bounds(rect)).toEqual({ x: 8, y: 8, w: 104, h: 54 });
    expect(cleanShapes([rect, { kind: 'rect', x: 'a' }, { kind: 'script', color: '#000' }, null])).toEqual([rect]);
  });
});
