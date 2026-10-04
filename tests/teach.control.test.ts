import { describe, expect, it } from 'vitest';
import { autoRange, bodeSvg, closedLoop, frequencyResponse, margins, nyquistSvg, parseTransfer, poleZeroSvg, roots, stepResponse, stepSvg, type PlotLabels } from '../src/teach/control';

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

describe('TEACH-006 step response and poles', () => {
  const at = (r: ReturnType<typeof stepResponse>, time: number) => r.y[r.t.findIndex((x) => x >= time - 1e-9)]!;
  it('integrates a first order and gives its times', () => {
    const r = stepResponse(parseTransfer('2/(1+s)'), 10, 1000);
    expect(at(r, 1)).toBeCloseTo(2 * (1 - Math.exp(-1)), 4);
    expect(r.final).toBe(2);
    expect(r.overshoot).toBeCloseTo(0, 3);
    expect(r.riseTime).toBeCloseTo(Math.log(9), 2);
    expect(r.settlingTime).toBeCloseTo(-Math.log(0.05), 1);
  });

  it('closes the loop and finds the overshoot of a second order', () => {
    const t = closedLoop(parseTransfer('1/(s(s+1))'));
    expect(t).toEqual({ num: [1], den: [1, 1, 1] });
    const r = stepResponse(t);
    const zeta = 0.5;
    expect(r.overshoot).toBeCloseTo(100 * Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta)), 0);
    expect(r.final).toBe(1);
    // A zero over the poles' degree: a direct term at t = 0.
    expect(stepResponse(parseTransfer('(s+2)/(s+1)')).y[0]).toBeCloseTo(1, 9);
    expect(() => stepResponse(parseTransfer('s^2/(s+1)'))).toThrow(/more zeros/);
    // An integrator does not settle.
    expect(stepResponse(parseTransfer('1/s')).final).toBeUndefined();
  });

  it('draws the step response and the poles and zeros', () => {
    const r = stepResponse(parseTransfer('1/(s^2+s+1)'));
    const svg = stepSvg(r, { title: 'Step <1>', time: 't (s)', output: 'y', final: (v) => `final ${v}`, overshoot: (v) => `overshoot ${v} %`, rise: (v) => `rise ${v}`, settling: (v) => `settling ${v}` });
    expect(svg).toContain('Step &lt;1&gt;');
    expect(svg).toContain('overshoot 16.3 %');
    expect(new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')).toBeNull();
    const pz = new DOMParser().parseFromString(poleZeroSvg(parseTransfer('(s+3)/(s^2+2s+5)'), { title: 'PZ', real: 'Re', imaginary: 'Im' }), 'image/svg+xml');
    expect(pz.querySelectorAll('circle')).toHaveLength(1);
    expect(pz.querySelectorAll('path')).toHaveLength(2);
  });
});
