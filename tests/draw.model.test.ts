import { describe, expect, it } from 'vitest';
import { attachedTo, connectionPoints, duplicate, emptyDrawing, formatValue, junctions, mirror, moveShapes, nextRef, pinsOf, placeSymbol, reconnect, rotate, route, snap, type Drawing, type LineShape } from '../src/draw/model';
import { searchSymbols, SYMBOLS, symbolDef } from '../src/draw/symbols';

describe('DRAW-005 symbol libraries', () => {
  it('has pins on the grid for every symbol, and unique ids', () => {
    expect(new Set(SYMBOLS.map((s) => s.id)).size).toBe(SYMBOLS.length);
    for (const s of SYMBOLS) for (const [x, y] of s.pins) expect([s.id, Math.abs(x % 10), Math.abs(y % 10)]).toEqual([s.id, 0, 0]);
  });
  it('covers each library', () => {
    for (const c of ['electrical', 'logic', 'block', 'fluid', 'flowchart'] as const) expect(SYMBOLS.filter((s) => s.category === c).length).toBeGreaterThan(3);
  });
  it('finds symbols by name, keywords or standard, ignoring case and accents', () => {
    expect(searchSymbols('resist').map((s) => s.id)).toEqual(['resistor', 'potentiometer']);
    expect(searchSymbols('ISO 1219 valve').map((s) => s.id)).toContain('valve-52');
    expect(searchSymbols('npn').map((s) => s.id)).toEqual(['npn']);
    expect(searchSymbols('gate', 'logic')).toHaveLength(12);
    expect(searchSymbols('DÉCISION').map((s) => s.id)).toEqual(['decision']);
  });
});

describe('DRAW-006 schematics', () => {
  it('turns and mirrors the pins with the symbol', () => {
    const d = emptyDrawing();
    const q = placeSymbol(d, 'npn', 100, 100);
    expect(pinsOf(q)).toEqual([[70, 100], [110, 70], [110, 130]]);
    rotate(d, [q.id]);
    expect(pinsOf(q)).toEqual([[100, 70], [130, 110], [70, 110]]);
    mirror(d, [q.id]);
    expect(q.mirror).toBe(true);
    expect(pinsOf(q).every(([x, y]) => x % 10 === 0 && y % 10 === 0)).toBe(true);
  });

  it('numbers the references by kind', () => {
    const d = emptyDrawing();
    expect(placeSymbol(d, 'resistor', 0, 0).ref).toBe('R1');
    expect(placeSymbol(d, 'potentiometer', 0, 0).ref).toBe('R2');
    expect(placeSymbol(d, 'capacitor', 0, 0).ref).toBe('C1');
    expect(placeSymbol(d, 'ground', 0, 0).ref).toBeUndefined();
    d.shapes.push({ id: 'x', kind: 'symbol', sym: 'resistor', x: 0, y: 0, rot: 0, ref: 'R7' });
    expect(nextRef(d, 'R')).toBe('R8');
  });

  it('writes values with prefixes and the unit of the symbol (UNIT-001)', () => {
    expect(formatValue('10k', 'Ω')).toBe('10 kΩ');
    expect(formatValue('4k7', 'Ω')).toBe('4.7 kΩ');
    expect(formatValue('100n', 'F')).toBe('100 nF');
    expect(formatValue('22u', 'F')).toBe('22 µF');
    expect(formatValue('2.2 mH', 'H')).toBe('2.2 mH');
    expect(formatValue('12', 'V')).toBe('12 V');
    expect(formatValue('1M', 'Ω')).toBe('1 MΩ');
    expect(formatValue('BC547', undefined)).toBe('BC547');
    expect(formatValue('Kp', undefined)).toBe('Kp');
  });

  it('routes wires in right angles', () => {
    expect(route([0, 0], [30, 20])).toEqual([[0, 0], [30, 0], [30, 20]]);
    expect(route([0, 0], [30, 20], false)).toEqual([[0, 0], [0, 20], [30, 20]]);
    expect(route([0, 0], [30, 0])).toEqual([[0, 0], [30, 0]]);
  });

  it('keeps wires connected when a symbol moves', () => {
    const d = emptyDrawing();
    const r = placeSymbol(d, 'resistor', 100, 100);
    const c = placeSymbol(d, 'capacitor', 200, 100);
    const w: LineShape = { id: 'w', kind: 'line', wire: true, ortho: true, points: [[130, 100], [170, 100]], from: { shape: r.id, pin: 1 }, to: { shape: c.id, pin: 0 } };
    d.shapes.push(w);
    moveShapes(d, [c.id], 0, 40);
    expect(w.points).toEqual([[130, 100], [170, 100], [170, 140]]);
    expect(w.points.every(([x, y], i, a) => i === 0 || x === a[i - 1]![0] || y === a[i - 1]![1])).toBe(true);
    // Moving the wire along with both of its ends shifts it.
    moveShapes(d, [r.id, c.id, w.id], 10, 0);
    expect(w.points[0]).toEqual([140, 100]);
    expect(attachedTo(d, c.id)).toEqual([w]);
  });

  it('keeps a hand-routed wire and only stretches its end segments', () => {
    const d = emptyDrawing();
    const a = placeSymbol(d, 'resistor', 0, 0);
    const w: LineShape = { id: 'w', kind: 'line', wire: true, ortho: true, points: [[30, 0], [50, 0], [50, 60], [90, 60]], from: { shape: a.id, pin: 1 } };
    d.shapes.push(w);
    moveShapes(d, [a.id], 0, -10);
    reconnect(d);
    expect(w.points).toEqual([[30, -10], [50, -10], [50, 60], [90, 60]]);
  });

  it('puts a junction dot where three wires meet, none where they only cross', () => {
    const wire = (id: string, ...points: [number, number][]): LineShape => ({ id, kind: 'line', wire: true, points });
    const d: Drawing = { ...emptyDrawing(), shapes: [wire('a', [0, 0], [100, 0]), wire('b', [50, 0], [50, 50]), wire('c', [80, -20], [80, 20])] };
    expect(junctions(d)).toEqual([[50, 0]]);
    d.shapes.push(wire('d', [100, 0], [100, 40]), wire('e', [100, 0], [140, 0]));
    expect(junctions(d)).toEqual([[50, 0], [100, 0]]);
  });

  it('gives connection points to shapes and symbols, for connectors (DRAW-004)', () => {
    const d = emptyDrawing();
    d.shapes.push({ id: 'r', kind: 'rect', x: 0, y: 0, w: 40, h: 20 });
    expect(connectionPoints(d.shapes[0]!)).toEqual([[20, 0], [40, 10], [20, 20], [0, 10]]);
    const s = placeSymbol(d, 'process', 100, 100);
    expect(connectionPoints(s)).toEqual([[100, 80], [140, 100], [100, 120], [60, 100]]);
  });

  it('snaps to the grid', () => {
    expect(snap(14, 10)).toBe(10);
    expect(snap(16, 10)).toBe(20);
    expect(snap(16, 0)).toBe(16);
  });

  it('duplicates shapes with new ids, references and the wires between them', () => {
    const d = emptyDrawing();
    const r = placeSymbol(d, 'resistor', 0, 0);
    const copies = duplicate(d, [r.id], 20, 20);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ kind: 'symbol', x: 20, y: 20, ref: 'R2' });
    expect(copies[0]!.id).not.toBe(r.id);
    expect(symbolDef('resistor')!.unit).toBe('Ω');
  });
});

describe('DRAW-011 accessible drawing editor', () => {
  it('names the shapes for screen readers', async () => {
    const { shapeName, simplify } = await import('../src/draw/editor');
    const d = emptyDrawing();
    const r = placeSymbol(d, 'resistor', 0, 0);
    r.value = '10 kΩ';
    expect(shapeName(r)).toBe('Resistor R1 10 kΩ');
    expect(shapeName({ id: 't', kind: 'text', x: 0, y: 0, text: 'Hi' })).toBe('Text: Hi');
    expect(shapeName({ id: 'w', kind: 'line', wire: true, points: [] })).toBe('Wire');
    expect(shapeName({ id: 'a', kind: 'line', end: 'arrow', points: [], label: 'yes' })).toBe('Arrow yes');
    // Freehand strokes keep their shape with fewer points.
    expect(simplify([[0, 0], [1, 0.1], [2, 0], [3, 5], [4, 0]], 0.5)).toEqual([[0, 0], [2, 0], [3, 5], [4, 0]]);
  });
});

describe('DRAW-012 IEC 61131-3 graphical languages', () => {
  it('has the ladder, function block and SFC libraries, found by their usual names', () => {
    for (const c of ['ladder', 'fbd', 'sfc'] as const) expect(SYMBOLS.filter((s) => s.category === c).length).toBeGreaterThan(8);
    expect(searchSymbols('TON').map((s) => s.id)).toContain('fb-ton');
    expect(searchSymbols('grafcet étape').map((s) => s.id)).toEqual(['sfc-step', 'sfc-initial']);
    expect(searchSymbols('ladder coil set').map((s) => s.id)).toEqual(['ld-set', 'ld-reset']);
  });

  it('gives function blocks their named pins on the grid, inputs left and outputs right', () => {
    const ton = symbolDef('fb-ton')!;
    expect(ton.pins).toEqual([[-40, -10], [-40, 10], [40, -10], [40, 10]]);
    expect(ton.body).toContain('>IN<');
    expect(ton.body).toContain('>ET<');
    const ctud = symbolDef('fb-ctud')!;
    expect(ctud.pins).toHaveLength(8);
    expect(ctud.pins.every(([x, y]) => x % 10 === 0 && y % 10 === 0)).toBe(true);
    const d = emptyDrawing();
    expect(placeSymbol(d, 'fb-ton', 0, 0).ref).toBe('TON1');
    expect(placeSymbol(d, 'ld-no', 0, 0).ref).toBeUndefined();
  });
});
