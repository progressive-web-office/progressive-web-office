import { describe, expect, it } from 'vitest';
import { autoRange, bodeSvg, frequencyResponse, margins, nyquistSvg, parseTransfer, roots, type PlotLabels } from '../src/teach/control';

const labels: PlotLabels = { title: 'H(s) = <test>', frequency: 'ω (rad/s)', magnitude: '|H| (dB)', phase: 'φ', real: 'Re', imaginary: 'Im', gainMargin: (d, w) => `GM ${d} dB at ${w}`, phaseMargin: (d, w) => `PM ${d}° at ${w}` };

describe('TEACH-004 Bode and Nyquist', () => {
  it('reads transfer functions as written on the board', () => {
    expect(parseTransfer('10/((s+1)(s+10))')).toEqual({ num: [10], den: [10, 11, 1] });
    expect(parseTransfer('H(p) = 2p / (1 + 0,5p)^2')).toEqual({ num: [0, 2], den: [1, 1, 0.25] });
    expect(parseTransfer('K*(1+tau s)/s', { K: 3, tau: 2 })).toEqual({ num: [3, 6], den: [0, 1] });
    expect(() => parseTransfer('1/(s+')).toThrow();
    expect(() => parseTransfer('K/s')).toThrow(/unknown value K/);
    expect(() => parseTransfer('1/0')).toThrow(/division by zero/);
  });

  it('finds poles and zeros', () => {
    const r = roots([10, 11, 1]).map((z) => +z.re.toFixed(6)).sort((a, b) => a - b);
    expect(r).toEqual([-10, -1]);
    const im = roots([1, 0, 1]).map((z) => +Math.abs(z.im).toFixed(6));
    expect(im).toEqual([1, 1]);
    expect(autoRange(parseTransfer('10/((s+1)(s+10))'))).toEqual([-1, 2]);
  });

  it('works out the response and the margins', () => {
    // A first order: -3 dB and -45° at the corner.
    const first = frequencyResponse(parseTransfer('1/(1+s)'), [-2, 2], 100);
    const corner = first.find((p) => Math.abs(p.w - 1) < 1e-9)!;
    expect(corner.db).toBeCloseTo(-3.0103, 3);
    expect(corner.phase).toBeCloseTo(-45, 6);
    // An integrator starts at -90°, and the phase goes on below -180° without jumping.
    const third = frequencyResponse(parseTransfer('1/(s(s+1)^2)'), [-3, 3], 100);
    expect(third[0]!.phase).toBeCloseTo(-90, 0);
    expect(third[third.length - 1]!.phase).toBeCloseTo(-270, 0);
    // K/(s(s+1)^2): phase crossover at ω = 1, gain margin 20·log10(2/K).
    const m = margins(frequencyResponse(parseTransfer('0.5/(s(s+1)^2)'), [-3, 3], 400));
    expect(m.phaseCrossover).toBeCloseTo(1, 2);
    expect(m.gainMargin).toBeCloseTo(20 * Math.log10(4), 1);
    expect(m.phaseMargin).toBeGreaterThan(0);
  });

  it('draws the pictures as SVG, the title escaped', () => {
    const tf = parseTransfer('10/((s+1)(s+10))');
    const pts = frequencyResponse(tf, autoRange(tf));
    const bode = bodeSvg(pts, autoRange(tf), margins(pts), labels);
    expect(bode).toContain('H(s) = &lt;test&gt;');
    const doc = new DOMParser().parseFromString(bode, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('path').length).toBe(2);
    const ny = new DOMParser().parseFromString(nyquistSvg(pts, labels), 'image/svg+xml');
    expect(ny.querySelector('parsererror')).toBeNull();
    expect(ny.querySelector('path[stroke-dasharray]')?.getAttribute('d')).toMatch(/^M/);
  });
});
