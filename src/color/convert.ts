/**
 * Colour values (COLOR-001) and colours for print (COLOR-002): hexadecimal,
 * RGB and device CMYK (in percent) — the conversions office suites make
 * without a colour profile — and CIELAB (D65) to tell, approximately, which
 * screen colours a coated offset press (FOGRA39-like) cannot print, and to
 * show them as they would print. ICC profiles are not used.
 */

export type Rgb = [number, number, number];
/** Cyan, magenta, yellow, black, in percent. */
export type Cmyk = [number, number, number, number];
export type Lab = [number, number, number];

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;

export function hexToRgb(hex: string): Rgb | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToCmyk([r, g, b]: Rgb): Cmyk {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - rr - k) / (1 - k), (1 - gg - k) / (1 - k), (1 - bb - k) / (1 - k), k].map((v) => round1(v * 100) + 0) as Cmyk;
}

export function cmykToRgb([c, m, y, k]: Cmyk): Rgb {
  const kk = 1 - clamp(k, 0, 100) / 100;
  return [c, m, y].map((v) => 255 * (1 - clamp(v, 0, 100) / 100) * kk) as Rgb;
}

export const hexToCmyk = (hex: string): Cmyk => rgbToCmyk(hexToRgb(hex) ?? [0, 0, 0]);
export const cmykToHex = (cmyk: Cmyk): string => rgbToHex(cmykToRgb(cmyk));

/** Total ink coverage, in percent (presses accept about 300 % at most). */
export const totalInk = (cmyk: Cmyk): number => round1(cmyk.reduce((s, v) => s + v, 0));

// --- CIELAB (D65) -----------------------------------------------------------------

const toLinear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number): number => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const WHITE = [0.95047, 1, 1.08883];
const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fInv = (t: number): number => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

export function rgbToLab(rgb: Rgb): Lab {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  const xyz = [0.4124564 * r + 0.3575761 * g + 0.1804375 * b, 0.2126729 * r + 0.7151522 * g + 0.072175 * b, 0.0193339 * r + 0.119192 * g + 0.9503041 * b];
  const [fx, fy, fz] = xyz.map((v, i) => f(v / WHITE[i]!)) as Rgb;
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([l, a, b]: Lab): Rgb {
  const fy = (l + 16) / 116;
  const [x, y, z] = [fInv(fy + a / 500) * WHITE[0]!, fInv(fy) * WHITE[1]!, fInv(fy - b / 200) * WHITE[2]!];
  return [3.2404542 * x - 1.5371385 * y - 0.4985314 * z, -0.969266 * x + 1.8760108 * y + 0.041556 * z, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z].map((c) => fromLinear(clamp(c, 0, 1))) as Rgb;
}

export const hexToLab = (hex: string): Lab => rgbToLab(hexToRgb(hex) ?? [0, 0, 0]);
export const labToHex = (lab: Lab): string => rgbToHex(labToRgb(lab));

// --- the gamut of a coated offset press, approximately ---------------------------------

/** The most vivid colours of the press (inks and their overprints): hue in degrees, chroma, lightness. */
const CUSPS: [number, number, number][] = [
  [35.2, 83.2, 47], // red (M+Y)
  [93.1, 93.1, 89], // yellow
  [157.4, 70.4, 50], // green (C+Y)
  [233.5, 62.2, 55], // cyan
  [295.6, 51, 24], // blue (C+M)
  [357.7, 74.1, 48], // magenta
];
/** The darkest black of the press, and how far the gamut bulges between its corners. */
const BLACK_L = 10;
const TOLERANCE = 4;

function cusp(hue: number): { c: number; l: number } {
  const h = ((hue % 360) + 360) % 360;
  for (let i = 0; i < CUSPS.length; i++) {
    const [h1, c1, l1] = CUSPS[i]!;
    const [h2raw, c2, l2] = CUSPS[(i + 1) % CUSPS.length]!;
    const h2 = h2raw < h1 ? h2raw + 360 : h2raw;
    const hh = h < h1 ? h + 360 : h;
    if (hh >= h1 && hh <= h2) {
      const t = (hh - h1) / (h2 - h1);
      return { c: c1 + t * (c2 - c1), l: l1 + t * (l2 - l1) };
    }
  }
  return { c: CUSPS[0]![1], l: CUSPS[0]![2] };
}

/** The most vivid chroma the press prints at this lightness and hue. */
function maxChroma(l: number, hue: number): number {
  const k = cusp(hue);
  const x = l >= k.l ? (100 - l) / (100 - k.l) : (l - BLACK_L) / (k.l - BLACK_L);
  return k.c * Math.sqrt(clamp(x, 0, 1));
}

const lch = (hex: string): { l: number; c: number; h: number } => {
  const [l, a, b] = hexToLab(hex);
  return { l, c: Math.hypot(a, b), h: (Math.atan2(b, a) * 180) / Math.PI };
};

/** Whether a press prints the colour about as it is shown (approximately). */
export function inPrintGamut(hex: string): boolean {
  const { l, c, h } = lch(hex);
  return c <= maxChroma(l, h) + TOLERANCE;
}

/**
 * The colour as it would print: a colour the press cannot print is moved
 * toward the grey of the press's most vivid colour of that hue, keeping the hue.
 */
export function proofColor(hex: string): string {
  if (!hexToRgb(hex)) return hex;
  if (inPrintGamut(hex)) return rgbToHex(hexToRgb(hex)!);
  const { l, c, h } = lch(hex);
  const target = cusp(h).l;
  const at = (t: number): { l: number; c: number } => ({ l: l + (target - l) * t, c: c * (1 - t) });
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const p = at(mid);
    if (p.c <= maxChroma(p.l, h)) hi = mid;
    else lo = mid;
  }
  const p = at(hi);
  const rad = (h * Math.PI) / 180;
  return labToHex([p.l, p.c * Math.cos(rad), p.c * Math.sin(rad)]);
}

// --- LaTeX (xcolor) ---------------------------------------------------------------

/** The base colours of xcolor. */
const XCOLOR: Record<string, string> = {
  red: '#ff0000', green: '#00ff00', blue: '#0000ff', cyan: '#00ffff', magenta: '#ff00ff', yellow: '#ffff00', black: '#000000', white: '#ffffff',
  gray: '#808080', darkgray: '#404040', lightgray: '#bfbfbf', brown: '#bf8040', lime: '#bfff00', olive: '#808000', orange: '#ff8000',
  pink: '#ffbfbf', purple: '#bf0040', teal: '#008080', violet: '#800080',
};

/** The colour of xcolor's `[model]{spec}`: HTML, rgb, RGB, cmyk, gray, or a base colour mixed with white (`red!40`). */
export function latexColor(model: string | undefined, spec: string): string | undefined {
  const values = spec.split(',').map((v) => Number(v.trim()));
  const ok = (n: number): boolean => values.length === n && values.every((v) => Number.isFinite(v));
  switch (model?.trim()) {
    case 'HTML':
      return hexToRgb(`#${spec.trim()}`) ? rgbToHex(hexToRgb(`#${spec.trim()}`)!) : undefined;
    case 'rgb':
      return ok(3) ? rgbToHex(values.map((v) => v * 255) as Rgb) : undefined;
    case 'RGB':
      return ok(3) ? rgbToHex(values as Rgb) : undefined;
    case 'cmyk':
      return ok(4) ? cmykToHex(values.map((v) => v * 100) as Cmyk) : undefined;
    case 'gray':
      return ok(1) ? rgbToHex([values[0]! * 255, values[0]! * 255, values[0]! * 255]) : undefined;
    case undefined:
    case '': {
      const m = /^([a-z]+)(?:!(\d+(?:\.\d+)?))?$/i.exec(spec.trim());
      const base = m ? XCOLOR[m[1]!.toLowerCase()] : undefined;
      if (!base) return undefined;
      const share = m![2] !== undefined ? Number(m![2]) / 100 : 1;
      return rgbToHex(hexToRgb(base)!.map((v) => v * share + 255 * (1 - share)) as Rgb);
    }
    default:
      return undefined;
  }
}

/** xcolor's `[HTML]{C00000}`. */
export const latexHtmlColor = (hex: string): string => `[HTML]{${(rgbToHex(hexToRgb(hex) ?? [0, 0, 0])).slice(1).toUpperCase()}}`;
