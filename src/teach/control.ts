/**
 * TEACH-004: Bode and Nyquist plots of a transfer function, as pictures for a
 * document. H(s) is written as on the board — `10/((s+1)(s+10))`,
 * `K*(1+0.5s)/(s(1+2s)^2)` with K given a value, `p` for the Laplace
 * variable as in French courses — and becomes a ratio of polynomials; its
 * poles and zeros set the frequencies shown, and the gain and phase margins
 * are worked out.
 */

/** A polynomial, its coefficients from the constant up. */
export type Poly = number[];
export interface Rational {
  num: Poly;
  den: Poly;
}

const trim = (p: Poly): Poly => {
  const out = [...p];
  while (out.length > 1 && Math.abs(out[out.length - 1]!) < 1e-300) out.pop();
  return out.length ? out : [0];
};
const add = (a: Poly, b: Poly): Poly => trim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0)));
const mul = (a: Poly, b: Poly): Poly => {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => (out[i + j]! += x * y)));
  return trim(out);
};
const scale = (a: Poly, k: number): Poly => trim(a.map((x) => x * k));
const isZero = (p: Poly): boolean => p.every((x) => x === 0);

const rAdd = (a: Rational, b: Rational): Rational => ({ num: add(mul(a.num, b.den), mul(b.num, a.den)), den: mul(a.den, b.den) });
const rMul = (a: Rational, b: Rational): Rational => ({ num: mul(a.num, b.num), den: mul(a.den, b.den) });
const rDiv = (a: Rational, b: Rational): Rational => {
  if (isZero(b.num)) throw new Error('division by zero');
  return { num: mul(a.num, b.den), den: mul(a.den, b.num) };
};
const rNeg = (a: Rational): Rational => ({ num: scale(a.num, -1), den: a.den });
const constant = (k: number): Rational => ({ num: [k], den: [1] });

/**
 * H(s) from its text: numbers, `s` (or `p`), + − × / ^ (whole powers),
 * brackets, products written side by side (`2s`, `(s+1)(s+2)`), and named
 * values (`K`, `tau`…) from `values`.
 */
export function parseTransfer(text: string, values: Record<string, number> = {}): Rational {
  const src = text.replace(/^\s*[A-Za-z]\s*\(\s*[sp]\s*\)\s*=/, '').replace(/[×·]/g, '*').replace(/[−–]/g, '-').replace(/,/g, '.');
  const tokens = src.match(/\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+|[A-Za-z_][A-Za-z_0-9]*|[-+*/^()]|\S/g) ?? [];
  let i = 0;
  const peek = (): string | undefined => tokens[i];
  const next = (): string => {
    const t = tokens[i++];
    if (t === undefined) throw new Error('unexpected end');
    return t;
  };
  const startsPrimary = (t: string | undefined): boolean => !!t && (/^[\d.]/.test(t) || /^[A-Za-z_]/.test(t) || t === '(');
  const primary = (): Rational => {
    const t = next();
    if (/^[\d.]/.test(t)) return constant(Number(t));
    if (t === 's' || t === 'p') return { num: [0, 1], den: [1] };
    if (/^[A-Za-z_]/.test(t)) {
      if (!(t in values)) throw new Error(`unknown value ${t}`);
      return constant(values[t]!);
    }
    if (t === '(') {
      const v = expr();
      if (next() !== ')') throw new Error('missing )');
      return v;
    }
    throw new Error(`unexpected ${t}`);
  };
  const power = (): Rational => {
    const base = primary();
    if (peek() !== '^') return base;
    next();
    let sign = 1;
    if (peek() === '-') {
      next();
      sign = -1;
    }
    const n = Number(next());
    if (!Number.isInteger(n) || n > 20) throw new Error('powers must be whole numbers up to 20');
    let out = constant(1);
    for (let k = 0; k < n; k++) out = rMul(out, base);
    return sign < 0 ? rDiv(constant(1), out) : out;
  };
  const unary = (): Rational => {
    if (peek() === '-') {
      next();
      return rNeg(unary());
    }
    if (peek() === '+') next();
    return power();
  };
  const term = (): Rational => {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t === '*') {
        next();
        v = rMul(v, unary());
      } else if (t === '/') {
        next();
        v = rDiv(v, unary());
      } else if (startsPrimary(t)) v = rMul(v, power());
      else return v;
    }
  };
  function expr(): Rational {
    let v = term();
    for (;;) {
      const t = peek();
      if (t === '+') {
        next();
        v = rAdd(v, term());
      } else if (t === '-') {
        next();
        v = rAdd(v, rNeg(term()));
      } else return v;
    }
  }
  if (!tokens.length) throw new Error('empty');
  const result = expr();
  if (i < tokens.length) throw new Error(`unexpected ${tokens[i]}`);
  if (isZero(result.den)) throw new Error('division by zero');
  return result;
}

// --- complex numbers ---------------------------------------------------------------

export interface Complex {
  re: number;
  im: number;
}
const c = (re: number, im = 0): Complex => ({ re, im });
const cAdd = (a: Complex, b: Complex): Complex => c(a.re + b.re, a.im + b.im);
const cSub = (a: Complex, b: Complex): Complex => c(a.re - b.re, a.im - b.im);
const cMul = (a: Complex, b: Complex): Complex => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cDiv = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const cAbs = (a: Complex): number => Math.hypot(a.re, a.im);

/** The value of a polynomial at a complex point (Horner). */
export function evalPoly(p: Poly, z: Complex): Complex {
  let out = c(0);
  for (let i = p.length - 1; i >= 0; i--) out = cAdd(cMul(out, z), c(p[i]!));
  return out;
}

/** The roots of a polynomial (Durand–Kerner). */
export function roots(p: Poly): Complex[] {
  const q = trim(p);
  const n = q.length - 1;
  if (n < 1) return [];
  const lead = q[n]!;
  const monic = q.map((x) => x / lead);
  let z = Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n + 0.4;
    return c(0.9 * Math.cos(a), 0.9 * Math.sin(a));
  });
  // Roots at zero first: they slow the iteration.
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    z = z.map((zi, i) => {
      let den = c(1);
      z.forEach((zj, j) => {
        if (j !== i) den = cMul(den, cSub(zi, zj));
      });
      const step = cDiv(evalPoly(monic, zi), den);
      moved = Math.max(moved, cAbs(step));
      return cSub(zi, step);
    });
    if (moved < 1e-12) break;
  }
  return z.map((r) => c(Math.abs(r.re) < 1e-9 ? 0 : r.re, Math.abs(r.im) < 1e-9 ? 0 : r.im));
}

// --- frequency response ------------------------------------------------------------

export interface FrequencyPoint {
  w: number;
  h: Complex;
  db: number;
  /** Phase in degrees, unwrapped (continuous). */
  phase: number;
}

/** The decades shown: two around the poles and zeros, from 10^lo to 10^hi rad/s. */
export function autoRange(tf: Rational): [number, number] {
  const corners = [...roots(tf.num), ...roots(tf.den)].map(cAbs).filter((x) => x > 1e-9);
  if (!corners.length) return [-2, 2];
  const lo = Math.floor(Math.log10(Math.min(...corners))) - 1;
  const hi = Math.ceil(Math.log10(Math.max(...corners))) + 1;
  return [lo, Math.max(hi, lo + 2)];
}

export function frequencyResponse(tf: Rational, decades: [number, number], perDecade = 100): FrequencyPoint[] {
  const [lo, hi] = decades;
  const n = Math.max(2, Math.round((hi - lo) * perDecade) + 1);
  const out: FrequencyPoint[] = [];
  let prev: number | undefined;
  let offset = 0;
  // The phase at the lowest frequency, from the integrators and differentiators (s^k factors).
  const lowNum = tf.num.findIndex((x) => x !== 0);
  const lowDen = tf.den.findIndex((x) => x !== 0);
  for (let k = 0; k < n; k++) {
    const w = 10 ** (lo + ((hi - lo) * k) / (n - 1));
    const jw = c(0, w);
    const h = cDiv(evalPoly(tf.num, jw), evalPoly(tf.den, jw));
    let phase = (Math.atan2(h.im, h.re) * 180) / Math.PI;
    if (prev === undefined) {
      // Start near what the low-frequency asymptote gives: -90° per integrator, and the sign of the gain.
      const expected = (lowNum - lowDen) * 90 + ((tf.num[lowNum] ?? 1) / (tf.den[lowDen] ?? 1) < 0 ? -180 : 0);
      offset = Math.round((expected - phase) / 360) * 360;
    } else {
      const raw = phase + offset;
      if (raw - prev > 180) offset -= 360;
      else if (raw - prev < -180) offset += 360;
    }
    phase += offset;
    prev = phase;
    out.push({ w, h, db: 20 * Math.log10(Math.max(cAbs(h), 1e-300)), phase });
  }
  return out;
}

export interface Margins {
  /** Gain crossover (|H| = 1) and the phase margin there, in degrees. */
  crossover?: number;
  phaseMargin?: number;
  /** Phase crossover (−180°) and the gain margin there, in dB. */
  phaseCrossover?: number;
  gainMargin?: number;
}

/** The margins of the open loop, where the curves cross 0 dB and −180°. */
export function margins(points: FrequencyPoint[]): Margins {
  const out: Margins = {};
  const at = (a: FrequencyPoint, b: FrequencyPoint, t: number): { w: number; db: number; phase: number } => ({
    w: 10 ** (Math.log10(a.w) + (Math.log10(b.w) - Math.log10(a.w)) * t),
    db: a.db + (b.db - a.db) * t,
    phase: a.phase + (b.phase - a.phase) * t,
  });
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    if (out.crossover === undefined && a.db >= 0 && b.db < 0) {
      const p = at(a, b, a.db / (a.db - b.db));
      out.crossover = p.w;
      // The margin to the nearest odd multiple of −180°.
      out.phaseMargin = p.phase - (Math.round((p.phase + 180) / 360) * 360 - 180);
    }
    // −180° and its odd multiples, crossed going down.
    const turns = (x: number): number => Math.floor((x + 180) / 360);
    if (out.phaseCrossover === undefined && turns(a.phase) !== turns(b.phase) && b.phase < a.phase) {
      const target = turns(a.phase) * 360 - 180;
      const p = at(a, b, (a.phase - target) / (a.phase - b.phase));
      out.phaseCrossover = p.w;
      out.gainMargin = -p.db;
    }
  }
  return out;
}

// --- pictures ----------------------------------------------------------------------

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (x: number): string => (Math.abs(x) >= 1000 || (Math.abs(x) < 0.01 && x !== 0) ? x.toExponential(1) : String(+x.toPrecision(3)));

/** Round steps for an axis: 1, 2 or 5 times a power of ten. */
function niceStep(span: number, ticks: number): number {
  const raw = span / ticks;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
}

interface Panel {
  x: number;
  y: number;
  w: number;
  h: number;
}

function logAxis(panel: Panel, decades: [number, number], label: boolean, xLabel: string): string {
  const [lo, hi] = decades;
  const X = (e: number): number => panel.x + ((e - lo) / (hi - lo)) * panel.w;
  let out = '';
  for (let d = lo; d <= hi; d++) {
    out += `<line x1="${X(d)}" y1="${panel.y}" x2="${X(d)}" y2="${panel.y + panel.h}" stroke="#bbb" stroke-width="0.8"/>`;
    if (d < hi) for (let m = 2; m < 10; m++) out += `<line x1="${X(d + Math.log10(m))}" y1="${panel.y}" x2="${X(d + Math.log10(m))}" y2="${panel.y + panel.h}" stroke="#e4e4e4" stroke-width="0.6"/>`;
    if (label) out += `<text x="${X(d)}" y="${panel.y + panel.h + 14}" text-anchor="middle" font-size="11">10<tspan dy="-5" font-size="8">${d}</tspan></text>`;
  }
  if (label) out += `<text x="${panel.x + panel.w / 2}" y="${panel.y + panel.h + 30}" text-anchor="middle" font-size="11">${esc(xLabel)}</text>`;
  return out;
}

function linAxis(panel: Panel, lo: number, hi: number, step: number, unit: string, yLabel: string): { Y: (v: number) => number; svg: string } {
  const Y = (v: number): number => panel.y + panel.h - ((v - lo) / (hi - lo)) * panel.h;
  let svg = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    svg += `<line x1="${panel.x}" y1="${Y(v)}" x2="${panel.x + panel.w}" y2="${Y(v)}" stroke="${Math.abs(v) < 1e-9 ? '#888' : '#ddd'}" stroke-width="0.8"/>`;
    svg += `<text x="${panel.x - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11">${fmt(v)}${unit}</text>`;
  }
  svg += `<text transform="translate(${panel.x - 46} ${panel.y + panel.h / 2}) rotate(-90)" text-anchor="middle" font-size="11">${esc(yLabel)}</text>`;
  return { Y, svg };
}

export interface PlotLabels {
  title: string;
  frequency: string;
  magnitude: string;
  phase: string;
  real: string;
  imaginary: string;
  gainMargin: (db: string, w: string) => string;
  phaseMargin: (deg: string, w: string) => string;
}

/** The Bode diagram: magnitude in dB and phase in degrees, against ω on a log scale. */
export function bodeSvg(points: FrequencyPoint[], decades: [number, number], m: Margins, labels: PlotLabels, showMargins = true): string {
  const W = 640;
  const top: Panel = { x: 70, y: 40, w: 540, h: 170 };
  const bottom: Panel = { x: 70, y: 250, w: 540, h: 170 };
  const H = 470;
  const [lo, hi] = decades;
  const X = (w: number): number => top.x + ((Math.log10(w) - lo) / (hi - lo)) * top.w;
  const dbs = points.map((p) => p.db).filter(Number.isFinite);
  let dbLo = Math.min(...dbs, 0);
  let dbHi = Math.max(...dbs, 0);
  if (dbHi - dbLo < 20) dbHi = dbLo + 20;
  dbLo = Math.max(dbLo, dbHi - 200);
  const dbStep = niceStep(dbHi - dbLo, 6);
  dbLo = Math.floor(dbLo / dbStep) * dbStep;
  dbHi = Math.ceil(dbHi / dbStep) * dbStep;
  const phs = points.map((p) => p.phase);
  let phLo = Math.floor(Math.min(...phs, 0) / 45) * 45;
  let phHi = Math.ceil(Math.max(...phs, 0) / 45) * 45;
  if (phHi - phLo < 90) phLo = phHi - 90;
  const phStep = phHi - phLo > 360 ? 90 : 45;
  const mag = linAxis(top, dbLo, dbHi, dbStep, '', labels.magnitude);
  const ph = linAxis(bottom, phLo, phHi, phStep, '°', labels.phase);
  const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
  const path = (Y: (v: number) => number, value: (p: FrequencyPoint) => number, a: number, b: number): string => points.map((p, k) => `${k ? 'L' : 'M'}${X(p.w).toFixed(1)} ${Y(clamp(value(p), a, b)).toFixed(1)}`).join('');
  let marks = '';
  if (showMargins) {
    if (m.crossover !== undefined && m.phaseMargin !== undefined) {
      const x = X(m.crossover);
      const phAt = m.phaseMargin - 180;
      marks += `<line x1="${x}" y1="${top.y}" x2="${x}" y2="${bottom.y + bottom.h}" stroke="#2e7d32" stroke-dasharray="4 3"/>`;
      marks += `<line x1="${x}" y1="${ph.Y(clamp(-180, phLo, phHi))}" x2="${x}" y2="${ph.Y(clamp(phAt, phLo, phHi))}" stroke="#2e7d32" stroke-width="2.5"/>`;
      marks += `<text x="${x + 4}" y="${bottom.y + bottom.h - 6}" font-size="11" fill="#2e7d32">${esc(labels.phaseMargin(fmt(m.phaseMargin), fmt(m.crossover)))}</text>`;
    }
    if (m.phaseCrossover !== undefined && m.gainMargin !== undefined && Number.isFinite(m.gainMargin)) {
      const x = X(m.phaseCrossover);
      marks += `<line x1="${x}" y1="${top.y}" x2="${x}" y2="${bottom.y + bottom.h}" stroke="#c62828" stroke-dasharray="4 3"/>`;
      marks += `<line x1="${x}" y1="${mag.Y(clamp(0, dbLo, dbHi))}" x2="${x}" y2="${mag.Y(clamp(-m.gainMargin, dbLo, dbHi))}" stroke="#c62828" stroke-width="2.5"/>`;
      marks += `<text x="${x + 4}" y="${top.y + 14}" font-size="11" fill="#c62828">${esc(labels.gainMargin(fmt(m.gainMargin), fmt(m.phaseCrossover)))}</text>`;
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif" role="img" aria-label="${esc(labels.title)}">`,
    `<rect width="${W}" height="${H}" fill="#fff"/>`,
    `<text x="${W / 2}" y="22" text-anchor="middle" font-size="14" font-weight="bold">${esc(labels.title)}</text>`,
    logAxis(top, decades, false, labels.frequency),
    logAxis(bottom, decades, true, labels.frequency),
    mag.svg,
    ph.svg,
    `<rect x="${top.x}" y="${top.y}" width="${top.w}" height="${top.h}" fill="none" stroke="#444"/>`,
    `<rect x="${bottom.x}" y="${bottom.y}" width="${bottom.w}" height="${bottom.h}" fill="none" stroke="#444"/>`,
    `<path d="${path(mag.Y, (p) => p.db, dbLo, dbHi)}" fill="none" stroke="#1565c0" stroke-width="2"/>`,
    `<path d="${path(ph.Y, (p) => p.phase, phLo, phHi)}" fill="none" stroke="#1565c0" stroke-width="2"/>`,
    marks,
    '</svg>',
  ].join('');
}

/** The Nyquist diagram: H(jω) in the complex plane, ω > 0 solid, ω < 0 dashed, the point −1 marked. */
export function nyquistSvg(points: FrequencyPoint[], labels: PlotLabels): string {
  const S = 480;
  const panel: Panel = { x: 60, y: 40, w: 390, h: 390 };
  // Far points (integrators at low frequency) are left out of the frame.
  const mags = points.map((p) => cAbs(p.h)).sort((a, b) => a - b);
  const median = mags[mags.length >> 1] ?? 1;
  const limit = Math.max(2, 6 * median);
  const shown = points.filter((p) => cAbs(p.h) <= limit);
  const xs = [...shown.map((p) => p.h.re), -1, 0];
  const ys = [...shown.flatMap((p) => [p.h.im, -p.h.im]), 0];
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0.5) * 1.1;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const X = (re: number): number => panel.x + panel.w / 2 + ((re - cx) / span) * panel.w;
  const Y = (im: number): number => panel.y + panel.h / 2 - ((im - cy) / span) * panel.h;
  const step = niceStep(span, 6);
  let grid = '';
  for (let v = Math.ceil((cx - span / 2) / step) * step; v <= cx + span / 2; v += step) {
    grid += `<line x1="${X(v)}" y1="${panel.y}" x2="${X(v)}" y2="${panel.y + panel.h}" stroke="${Math.abs(v) < 1e-9 ? '#888' : '#e2e2e2'}"/>`;
    grid += `<text x="${X(v)}" y="${panel.y + panel.h + 14}" text-anchor="middle" font-size="11">${fmt(v)}</text>`;
  }
  for (let v = Math.ceil((cy - span / 2) / step) * step; v <= cy + span / 2; v += step) {
    grid += `<line x1="${panel.x}" y1="${Y(v)}" x2="${panel.x + panel.w}" y2="${Y(v)}" stroke="${Math.abs(v) < 1e-9 ? '#888' : '#e2e2e2'}"/>`;
    grid += `<text x="${panel.x - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11">${fmt(v)}</text>`;
  }
  const curve = (sign: 1 | -1): string => {
    let d = '';
    let pen = false;
    for (const p of points) {
      if (cAbs(p.h) > limit) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${X(p.h.re).toFixed(1)} ${Y(sign * p.h.im).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  // An arrow on the solid curve, in the direction of growing ω.
  const mid = shown[Math.floor(shown.length / 2)];
  const after = shown[Math.min(shown.length - 1, Math.floor(shown.length / 2) + 3)];
  let arrow = '';
  if (mid && after && (mid.h.re !== after.h.re || mid.h.im !== after.h.im)) {
    const a = Math.atan2(Y(after.h.im) - Y(mid.h.im), X(after.h.re) - X(mid.h.re));
    const [x, y] = [X(mid.h.re), Y(mid.h.im)];
    const pt = (r: number, t: number): string => `${(x + r * Math.cos(t)).toFixed(1)},${(y + r * Math.sin(t)).toFixed(1)}`;
    arrow = `<polygon points="${pt(8, a)} ${pt(8, a + 2.5)} ${pt(8, a - 2.5)}" fill="#1565c0"/>`;
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S + 20}" viewBox="0 0 ${S} ${S + 20}" font-family="sans-serif" role="img" aria-label="${esc(labels.title)}">`,
    `<rect width="${S}" height="${S + 20}" fill="#fff"/>`,
    `<text x="${S / 2}" y="22" text-anchor="middle" font-size="14" font-weight="bold">${esc(labels.title)}</text>`,
    grid,
    `<rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" fill="none" stroke="#444"/>`,
    `<path d="${curve(-1)}" fill="none" stroke="#1565c0" stroke-width="1.5" stroke-dasharray="5 4"/>`,
    `<path d="${curve(1)}" fill="none" stroke="#1565c0" stroke-width="2"/>`,
    arrow,
    `<path d="M${X(-1) - 6} ${Y(0)}h12M${X(-1)} ${Y(0) - 6}v12" stroke="#c62828" stroke-width="2"/>`,
    `<text x="${X(-1) + 6}" y="${Y(0) - 6}" font-size="11" fill="#c62828">−1</text>`,
    `<text x="${panel.x + panel.w / 2}" y="${panel.y + panel.h + 32}" text-anchor="middle" font-size="11">${esc(labels.real)}</text>`,
    `<text transform="translate(${panel.x - 44} ${panel.y + panel.h / 2}) rotate(-90)" text-anchor="middle" font-size="11">${esc(labels.imaginary)}</text>`,
    '</svg>',
  ].join('');
}
