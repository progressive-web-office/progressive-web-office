import { describe, expect, it } from 'vitest';
import { emptyDrawing, placeSymbol, type Drawing } from '../src/draw/model';
import { fromSvg, isDrawing, toSvg } from '../src/draw/svg';

const sample = (): Drawing => {
  const d = emptyDrawing(300, 200);
  d.alt = 'A <simple> circuit';
  d.shapes.push(
    { id: 'a', kind: 'rect', x: 10, y: 10, w: 50, h: 30, r: 4, stroke: '#ff0000', fill: '#ffff00', width: 2, dash: 'dash' },
    { id: 'b', kind: 'ellipse', x: 80, y: 10, w: 40, h: 20 },
    { id: 'c', kind: 'line', points: [[0, 100], [100, 100]], end: 'arrow', label: 'flow' },
    { id: 'd', kind: 'free', points: [[0, 0], [5, 5], [10, 3], [20, 8]] },
    { id: 'e', kind: 'text', x: 20, y: 150, text: 'R & <C>\nsecond line' },
  );
  const r = placeSymbol(d, 'resistor', 200, 100);
  r.value = '10 kΩ';
  placeSymbol(d, 'process', 200, 160).value = 'Read x';
  return d;
};

describe('DRAW-003 drawings saved as SVG', () => {
  it('writes a standalone SVG that keeps the editable drawing', () => {
    const d = sample();
    const svg = toSvg(d);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="300" height="200" viewBox="0 0 300 200"/);
    expect(svg).toContain('<title>A &lt;simple&gt; circuit</title>');
    expect(svg).toContain('<rect data-id="a" x="10" y="10" width="50" height="30" rx="4"');
    expect(svg).toContain('stroke-dasharray="8 4"');
    expect(svg).toContain('R &amp; &lt;C&gt;');
    expect(svg).toContain('>R1</text>');
    expect(svg).toContain('>10 kΩ</text>');
    expect(svg).toContain('>Read x</text>');
    expect(isDrawing(svg)).toBe(true);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(fromSvg(svg)).toEqual(d);
  });

  it('draws junction dots on wires (DRAW-006)', () => {
    const d = emptyDrawing();
    d.shapes.push(
      { id: 'a', kind: 'line', wire: true, points: [[0, 0], [100, 0]] },
      { id: 'b', kind: 'line', wire: true, points: [[50, 0], [50, 50]] },
    );
    expect(toSvg(d)).toContain('<circle cx="50" cy="0" r="3" fill="#000000" class="junction"/>');
  });

  it('opens an SVG made elsewhere with its shapes editable', () => {
    const d = fromSvg(`<?xml version="1.0"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
        <rect x="1" y="2" width="30" height="20" style="fill:#00ff00;stroke:blue;stroke-width:3"/>
        <circle cx="60" cy="40" r="10" fill="red"/>
        <line x1="0" y1="0" x2="10" y2="10" stroke="black"/>
        <polygon points="0,0 10,0 5,8"/>
        <path d="M0 0L10 10"/>
        <text x="5" y="70" font-size="12">Hello</text>
        <g transform="rotate(45)"><rect width="5" height="5"/></g>
      </svg>`);
    expect(d.width).toBe(120);
    expect(d.height).toBe(80);
    expect(d.shapes.map((s) => s.kind)).toEqual(['rect', 'ellipse', 'line', 'line', 'path', 'text', 'raw']);
    expect(d.shapes[0]).toMatchObject({ x: 1, y: 2, w: 30, h: 20, fill: '#00ff00', stroke: 'blue', width: 3 });
    expect(d.shapes[1]).toMatchObject({ x: 50, y: 30, w: 20, h: 20, fill: 'red' });
    expect(d.shapes[3]).toMatchObject({ points: [[0, 0], [10, 0], [5, 8]], closed: true });
    expect(d.shapes[5]).toMatchObject({ text: 'Hello', size: 12 });
    expect(toSvg(d)).toContain('rotate(45)');
    expect(isDrawing('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(false);
  });

  it('rejects what is not SVG', () => {
    expect(() => fromSvg('<html/>')).toThrow();
  });
});

describe('DRAW-012 labels of IEC 61131-3 symbols', () => {
  it('writes a ladder variable above, an SFC condition to the right', () => {
    const d = emptyDrawing();
    placeSymbol(d, 'ld-no', 100, 100).value = 'Start';
    placeSymbol(d, 'sfc-transition', 200, 100).value = 'Level > 80';
    const svg = toSvg(d);
    expect(svg).toMatch(/<text x="100" y="86"[^>]*>Start<\/text>/);
    expect(svg).toMatch(/<text x="218" y="104"[^>]*>Level &gt; 80<\/text>/);
  });
});
