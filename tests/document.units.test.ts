import { beforeEach, describe, expect, it } from 'vitest';
import { fromMm, loadLengthUnit, loadRulerSides, saveLengthUnit, saveRulerSides, toMm, RULERS_EVENT } from '../src/document/units';
import { ticks } from '../src/document/rulers';

// DOC-054: the unit of the page and the rulers shown, each on its own.

describe('length units', () => {
  beforeEach(() => localStorage.clear());

  it('converts millimetres to each unit and back', () => {
    expect(fromMm(210, 'cm')).toBe(21);
    expect(fromMm(215.9, 'in')).toBe(8.5);
    expect(fromMm(25.4, 'pt')).toBe(72);
    expect(toMm(8.5, 'in')).toBe(215.9);
    expect(toMm(fromMm(210, 'in'), 'in')).toBe(210);
    expect(toMm(fromMm(297, 'pt'), 'pt')).toBe(297);
  });

  it('keeps the unit chosen', () => {
    saveLengthUnit('mm');
    expect(loadLengthUnit()).toBe('mm');
  });

  it('shows each ruler on its own, and reads the setting of the first versions', () => {
    localStorage.setItem('pwo.doc.rulers', '1');
    expect(loadRulerSides()).toEqual({ horizontal: true, vertical: true });
    let told: unknown;
    addEventListener(RULERS_EVENT, (e) => (told = (e as CustomEvent).detail), { once: true });
    saveRulerSides({ horizontal: true, vertical: false });
    expect(loadRulerSides()).toEqual({ horizontal: true, vertical: false });
    expect(told).toEqual({ horizontal: true, vertical: false });
  });

  it('numbers the rulers in the unit', () => {
    const labels = (unit: Parameters<typeof ticks>[1]) => ticks(210, unit).flatMap((x) => (x.label ? [x.label] : []));
    expect(labels('cm').slice(0, 3)).toEqual(['0', '1', '2']);
    expect(labels('mm').slice(0, 3)).toEqual(['0', '10', '20']);
    expect(labels('in')).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8']);
    expect(labels('pt').slice(0, 3)).toEqual(['0', '72', '144']);
  });
});
