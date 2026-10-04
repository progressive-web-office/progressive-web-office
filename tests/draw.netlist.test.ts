import { describe, expect, it } from 'vitest';
import { emptyDrawing, pinsOf, placeSymbol, type Drawing, type Pt } from '../src/draw/model';
import { billOfMaterials, bomCsv, nets, spiceNetlist, spiceValue } from '../src/draw/netlist';

const wire = (d: Drawing, ...points: Pt[]): void => void d.shapes.push({ id: `w${d.shapes.length}`, kind: 'line', wire: true, ortho: true, points });

/** A battery feeding a resistor then a LED, back to ground. */
function circuit(): Drawing {
  const d = emptyDrawing();
  const b = placeSymbol(d, 'battery', 100, 100); // pins (100,70) + and (100,130)
  b.value = '9 V';
  const r = placeSymbol(d, 'resistor', 200, 40); // pins (170,40) (230,40)
  r.value = '470 Ω';
  placeSymbol(d, 'led', 300, 40); // pins (270,40) (330,40)
  const g = placeSymbol(d, 'ground', 100, 170); // pin (100,160)
  wire(d, [100, 70], [100, 40], [170, 40]);
  wire(d, [230, 40], [270, 40]);
  wire(d, [330, 40], [360, 40], [360, 150], [100, 150]);
  wire(d, [100, 130], [100, 160]);
  expect(pinsOf(g)).toEqual([[100, 160]]);
  return d;
}

describe('DRAW-009 netlist and bill of materials', () => {
  it('finds the nets, ground as 0, joined at T but not at crossings', () => {
    const d = circuit();
    const byPin = nets(d);
    const [battery, resistor, led] = d.shapes.slice(0, 3).map((s) => byPin.get(s.id)!);
    expect(battery![1]).toBe('0');
    expect(battery![0]).toBe(resistor![0]);
    expect(resistor![1]).toBe(led![0]);
    expect(led![1]).toBe('0');
    // A wire crossing another without a junction stays apart.
    wire(d, [200, 0], [200, 100]);
    const p = placeSymbol(d, 'resistor', 200, 130);
    expect(nets(d).get(p.id)).not.toContain(resistor![0]);
  });

  it('writes a SPICE netlist', () => {
    const net = spiceNetlist(circuit(), 'LED');
    expect(net).toBe(['* LED', 'B1 N1 0 DC 9', 'R1 N1 N2 470', 'D1 N2 0 LED', '.model LED D', '.op', '.end', ''].join('\n').replace('B1 N1 0 DC 9', 'VB1 N1 0 DC 9'));
  });

  it('writes values the SPICE way', () => {
    expect(spiceValue('4.7 kΩ')).toBe('4.7k');
    expect(spiceValue('100 nF')).toBe('100n');
    expect(spiceValue('22 µF')).toBe('22u');
    expect(spiceValue('1 MΩ')).toBe('1Meg');
    expect(spiceValue(undefined, '1k')).toBe('1k');
    expect(spiceValue('BC547')).toBe('BC547');
  });

  it('groups the parts by kind and value', () => {
    const d = circuit();
    const r2 = placeSymbol(d, 'resistor', 0, 300);
    r2.value = '470 Ω';
    placeSymbol(d, 'resistor', 0, 400).value = '1 kΩ';
    const bom = billOfMaterials(d);
    expect(bom).toEqual([
      { quantity: 1, references: ['B1'], component: 'Battery', value: '9 V' },
      { quantity: 1, references: ['D1'], component: 'Light-emitting diode (LED)', value: '' },
      { quantity: 2, references: ['R1', 'R2'], component: 'Resistor', value: '470 Ω' },
      { quantity: 1, references: ['R3'], component: 'Resistor', value: '1 kΩ' },
    ]);
    expect(bomCsv(bom).split('\n')[3]).toBe('2,R1 R2,Resistor,470 Ω');
  });
});
