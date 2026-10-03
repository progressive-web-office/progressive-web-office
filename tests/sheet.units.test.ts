import { describe, expect, it } from 'vitest';
import { convertExcel, formatUnit, parseUnit, quantity, sameDim, unitOfFormat, withUnit, mul, div, add, pow, display } from '../src/sheet/units';

const close = (a: number, b: number) => expect(Math.abs(a - b) / Math.max(1e-300, Math.abs(b))).toBeLessThan(1e-12);

describe('UNIT-001 units and dimensions', () => {
  it('reads units with SI prefixes, products, quotients and powers', () => {
    close(parseUnit('mm')!.factor, 1e-3);
    expect(parseUnit('mm')!.dim).toEqual([1, 0, 0, 0, 0, 0, 0]);
    close(parseUnit('kg')!.factor, 1);
    close(parseUnit('km/h')!.factor, 1000 / 3600);
    expect(parseUnit('km/h')!.dim).toEqual([1, 0, -1, 0, 0, 0, 0]);
    expect(parseUnit('N·m')!.dim).toEqual([2, 1, -2, 0, 0, 0, 0]);
    expect(parseUnit('kN*m')!.dim).toEqual([2, 1, -2, 0, 0, 0, 0]);
    expect(parseUnit('m/s²')!.dim).toEqual([1, 0, -2, 0, 0, 0, 0]);
    expect(parseUnit('m.s^-2')!.dim).toEqual([1, 0, -2, 0, 0, 0, 0]);
    close(parseUnit('cm²')!.factor, 1e-4);
    close(parseUnit('m3')!.factor, 1);
    close(parseUnit('µs')!.factor, 1e-6);
    close(parseUnit('us')!.factor, 1e-6);
    close(parseUnit('min')!.factor, 60);
    close(parseUnit('kWh')!.factor, 3.6e6);
    close(parseUnit('mL')!.factor, 1e-6);
    expect(parseUnit('Ω')!.dim).toEqual([2, 1, -3, -2, 0, 0, 0]);
    expect(parseUnit('kΩ')).toBeDefined();
    expect(parseUnit('€')).toBeUndefined();
    expect(parseUnit('items')).toBeUndefined();
    expect(parseUnit('')).toBeUndefined();
  });

  it('finds the unit of a number format', () => {
    expect(unitOfFormat('General" mm"')).toBe('mm');
    expect(unitOfFormat('0.00" kN·m"')).toBe('kN·m');
    expect(unitOfFormat('0.00" €"')).toBeUndefined();
    expect(unitOfFormat('0.00%')).toBeUndefined();
    expect(unitOfFormat(undefined)).toBeUndefined();
    expect(withUnit('mm')).toBe('General" mm"');
  });

  it('adds same dimensions only, and multiplies them into new ones', () => {
    const a = quantity(12, 'mm')!;
    const b = quantity(3, 'm')!;
    const sum = add(a, b)!;
    close(sum.v, 3.012);
    expect(sum.unit).toBe('mm');
    close(display(sum).value, 3012);
    expect(add(a, quantity(2, 's')!)).toBeUndefined();
    const f = quantity(2, 'kN')!;
    const torque = mul(f, quantity(0.5, 'm')!);
    expect(torque.dim).toEqual([2, 1, -2, 0, 0, 0, 0]);
    expect(torque.unit).toBe('kN·m');
    close(display(torque).value, 1);
    const area = mul(a, a);
    expect(area.unit).toBe('mm²');
    close(display(area).value, 144);
    const speed = div(quantity(100, 'km')!, quantity(2, 'h')!);
    expect(speed.unit).toBe('km/h');
    close(display(speed).value, 50);
    // Units that cancel: a pure number.
    const ratio = div(a, b);
    expect(ratio.dim.every((d) => d === 0)).toBe(true);
    expect(ratio.unit).toBe('');
    close(ratio.v, 0.004);
    // Many units of a named dimension: the named unit.
    const n = div(mul(quantity(3, 'kg')!, quantity(2, 'm')!), mul(quantity(1, 's')!, quantity(1, 's')!));
    expect(n.unit).toBe('N');
    close(display(n).value, 6);
    const sq = pow(area, 0.5)!;
    expect(sq.unit).toBe('mm');
    close(display(sq).value, 12);
    expect(sameDim(sq.dim, a.dim)).toBe(true);
  });

  it('writes units with superscripts and middle dots', () => {
    expect(formatUnit([['m', 1], ['s', -2]])).toBe('m/s²');
    expect(formatUnit([['kN', 1], ['m', 1]])).toBe('kN·m');
    expect(formatUnit([['mol', -1], ['L', -1]])).toBe('1/(mol·L)');
    expect(formatUnit([['m', 3]])).toBe('m³');
  });

  it('converts as Excel CONVERT does, temperatures included', () => {
    close(convertExcel(1, 'in', 'cm')!, 2.54);
    close(convertExcel(100, 'C', 'F')!, 212);
    close(convertExcel(0, 'C', 'K')!, 273.15);
    close(convertExcel(32, 'F', 'C')!, 0);
    close(convertExcel(1, 'hr', 'mn')!, 60);
    close(convertExcel(1, 'lbm', 'kg')!, 0.45359237);
    close(convertExcel(1, 'atm', 'Pa')!, 101325);
    close(convertExcel(1, 'm2', 'cm2')!, 10000);
    close(convertExcel(5, 'km', 'mi')!, 3.1068559611866697);
    expect(convertExcel(1, 'm', 'kg')).toBeUndefined();
    expect(convertExcel(1, 'zz', 'm')).toBeUndefined();
  });
});
