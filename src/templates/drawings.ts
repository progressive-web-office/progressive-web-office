/**
 * FILE-018, DRAW-012: drawings and schematics to start from, and pictures
 * made here (free: CC0), in the template gallery.
 */
import { emptyDrawing, pinsOf, placeSymbol, route, type Drawing, type LineShape, type Pt, type SymbolShape } from '../draw/model';
import { toSvg } from '../draw/svg';
import type { TemplateLang } from './content';

type Texts = Record<string, string>;
const T: Record<TemplateLang, Texts> = {
  en: { rc: 'An RC circuit: a battery charges a capacitor through a resistor.', start: 'Start', stop: 'Stop', motor: 'Motor', latch: 'Start / stop with a latch (self-holding contact)', cycle: 'A two-step cycle: the motor runs from Start until End', end: 'End', cylinder: 'A double-acting cylinder driven by a 5/2 valve', flow: 'A flowchart: is a number positive?', begin: 'Start', read: 'Read x', test: 'x > 0 ?', yes: 'yes', no: 'no', pos: 'Print “positive”', neg: 'Print “not positive”', finish: 'End' },
  fr: { rc: 'Un circuit RC : une pile charge un condensateur à travers une résistance.', start: 'Marche', stop: 'Arrêt', motor: 'Moteur', latch: 'Marche / arrêt avec auto-maintien', cycle: 'Un cycle en deux étapes : le moteur tourne de Marche à Fin', end: 'Fin', cylinder: 'Un vérin double effet commandé par un distributeur 5/2', flow: 'Un organigramme : un nombre est-il positif ?', begin: 'Début', read: 'Lire x', test: 'x > 0 ?', yes: 'oui', no: 'non', pos: 'Afficher « positif »', neg: 'Afficher « non positif »', finish: 'Fin' },
};

let n = 0;
const line = (d: Drawing, points: Pt[], extra: Partial<LineShape> = {}): LineShape => {
  const l: LineShape = { id: `w${++n}`, kind: 'line', points, ...extra };
  d.shapes.push(l);
  return l;
};
/** A wire from a pin of a symbol to a pin of another, in right angles (or along given points). */
const wire = (d: Drawing, a: SymbolShape, pa: number, b: SymbolShape, pb: number, via?: Pt[], horizontalFirst = true): LineShape => {
  const from = pinsOf(a)[pa]!;
  const to = pinsOf(b)[pb]!;
  return line(d, via ? [from, ...via, to] : route(from, to, horizontalFirst), { wire: true, ortho: true, from: { shape: a.id, pin: pa }, to: { shape: b.id, pin: pb } });
};
const sym = (d: Drawing, id: string, x: number, y: number, value?: string, rot: SymbolShape['rot'] = 0): SymbolShape => {
  const s = placeSymbol(d, id, x, y);
  s.rot = rot;
  if (value) s.value = value;
  return s;
};

export function rcCircuit(lang: TemplateLang): string {
  const d = emptyDrawing(420, 260);
  d.alt = T[lang].rc;
  const v = sym(d, 'battery', 100, 150, '9 V');
  const r = sym(d, 'resistor', 200, 80, '1 kΩ');
  const c = sym(d, 'capacitor', 300, 150, '100 µF', 90);
  const g = sym(d, 'ground', 100, 220);
  wire(d, v, 0, r, 0, undefined, false);
  wire(d, r, 1, c, 0);
  wire(d, c, 1, v, 1);
  wire(d, v, 1, g, 0);
  return toSvg(d);
}

export function ladderLatch(lang: TemplateLang): string {
  const L = T[lang];
  const d = emptyDrawing(480, 160);
  d.alt = L.latch;
  const left = sym(d, 'rail-left', 40, 80);
  const right = sym(d, 'rail-right', 440, 80);
  const start = sym(d, 'ld-no', 120, 70, L.start);
  const stop = sym(d, 'ld-nc', 220, 70, L.stop);
  const coil = sym(d, 'ld-coil', 360, 70, L.motor);
  const hold = sym(d, 'ld-no', 120, 110, L.motor);
  wire(d, left, 1, start, 0);
  wire(d, start, 1, stop, 0);
  wire(d, stop, 1, coil, 0);
  wire(d, coil, 1, right, 1);
  wire(d, left, 3, hold, 0);
  // The holding contact joins the rung between Start and Stop.
  const p = pinsOf(hold)[1]!;
  line(d, [p, [170, 110], [170, 70]], { wire: true, ortho: true, from: { shape: hold.id, pin: 1 } });
  return toSvg(d);
}

export function grafcetCycle(lang: TemplateLang): string {
  const L = T[lang];
  const d = emptyDrawing(320, 300);
  d.alt = L.cycle;
  const s0 = sym(d, 'sfc-initial', 100, 60, '0');
  const t1 = sym(d, 'sfc-transition', 100, 120, L.start);
  const s1 = sym(d, 'sfc-step', 100, 180, '1');
  const a1 = sym(d, 'sfc-action', 190, 180, `N  ${L.motor}`);
  const t2 = sym(d, 'sfc-transition', 100, 240, L.end);
  wire(d, s0, 1, t1, 0);
  wire(d, t1, 1, s1, 0);
  wire(d, s1, 2, a1, 0);
  wire(d, s1, 1, t2, 0);
  // Back to the initial step.
  line(d, [pinsOf(t2)[1]!, [100, 280], [40, 280], [40, 10], [100, 10], pinsOf(s0)[0]!], { wire: true, ortho: true, end: 'arrow', from: { shape: t2.id, pin: 1 }, to: { shape: s0.id, pin: 0 } });
  return toSvg(d);
}

export function pneumaticCylinder(lang: TemplateLang): string {
  const d = emptyDrawing(360, 300);
  d.alt = T[lang].cylinder;
  const cyl = sym(d, 'cylinder-double', 220, 60);
  const valve = sym(d, 'valve-52', 200, 200);
  const source = sym(d, 'pressure-source', 220, 270);
  sym(d, 'exhaust', 210, 240);
  sym(d, 'exhaust', 230, 240);
  wire(d, valve, 0, cyl, 0, [[210, 120], [190, 120]]);
  wire(d, valve, 1, cyl, 1, [[230, 130], [250, 130]]);
  wire(d, source, 0, valve, 3);
  return toSvg(d);
}

export function flowchart(lang: TemplateLang): string {
  const L = T[lang];
  const d = emptyDrawing(440, 400);
  d.alt = L.flow;
  const begin = sym(d, 'terminal', 200, 40, L.begin);
  const read = sym(d, 'io', 200, 110, L.read);
  const test = sym(d, 'decision', 200, 190, L.test);
  const pos = sym(d, 'process', 200, 270, L.pos);
  const neg = sym(d, 'process', 340, 270, L.neg);
  const end = sym(d, 'terminal', 200, 360, L.finish);
  const arrow = (a: SymbolShape, pa: number, b: SymbolShape, pb: number, label?: string, via?: Pt[]): void => {
    const l = wire(d, a, pa, b, pb, via);
    delete l.wire;
    l.end = 'arrow';
    if (label) l.label = label;
  };
  arrow(begin, 2, read, 0);
  arrow(read, 2, test, 0);
  arrow(test, 2, pos, 0, L.yes);
  arrow(test, 1, neg, 0, L.no, [[340, 190]]);
  arrow(pos, 2, end, 0);
  arrow(neg, 2, end, 0, undefined, [[340, 310], [200, 310]]);
  return toSvg(d);
}

/* Pictures made here (CC0): graph paper, a colour wheel, a pixel-art canvas. */

async function png(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('The picture could not be made.');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Graph paper: a 5 mm grid on an A4 page at 96 dpi, every 10 mm thicker. */
export function graphPaper(): Promise<Uint8Array> {
  const mm = 96 / 25.4;
  const [w, h] = [Math.round(210 * mm), Math.round(297 * mm)];
  return png(w, h, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i * 5 * mm <= Math.max(w, h); i++) {
      const p = Math.round(i * 5 * mm) + 0.5;
      c.strokeStyle = i % 2 ? '#c9dcef' : '#8fb5dd';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(p, 0);
      c.lineTo(p, h);
      c.moveTo(0, p);
      c.lineTo(w, p);
      c.stroke();
    }
  });
}

/** A colour wheel: hues around, lighter towards the centre. */
export function colourWheel(): Promise<Uint8Array> {
  const size = 512;
  return png(size, size, (c) => {
    const r = size / 2 - 8;
    for (let a = 0; a < 360; a += 0.5) {
      const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, `hsl(${a} 100% 50%)`);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(size / 2, size / 2);
      c.arc(size / 2, size / 2, r, ((a - 0.6) * Math.PI) / 180, ((a + 0.6) * Math.PI) / 180);
      c.closePath();
      c.fill();
    }
  });
}

/** A 32 × 32 canvas for pixel art, white. */
export function pixelCanvas(): Promise<Uint8Array> {
  return png(32, 32, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 32, 32);
  });
}

/**
 * DRAW-013: a poster in layers (OpenRaster) — a sky in a gradient, a sun,
 * hills half transparent, and a vector layer holding the title and its
 * frame, which stay shapes: hide a layer, change its opacity, move the title.
 */
export async function layeredPoster(lang: TemplateLang): Promise<Uint8Array> {
  const { writeOra } = await import('../paint/ora');
  const { drawShapes } = await import('../paint/vector');
  const [w, h] = [800, 500];
  const shapes = [
    { kind: 'rect' as const, x: 150, y: 40, w: 500, h: 110, color: '#ffffff', width: 6, opacity: 0.9, filled: false },
    { kind: 'text' as const, x: 190, y: 62, text: lang === 'fr' ? 'Fête du printemps' : 'Spring fair', size: 56, color: '#1f2937', opacity: 1 },
    { kind: 'text' as const, x: 300, y: 430, text: lang === 'fr' ? 'Samedi, 14 h — place du marché' : 'Saturday, 2 pm — market square', size: 24, color: '#ffffff', opacity: 1 },
  ];
  const draws: [string, (c: CanvasRenderingContext2D) => void, number][] = [
    [
      lang === 'fr' ? 'Ciel' : 'Sky',
      (c) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#7cc4f2');
        g.addColorStop(1, '#fdf1d6');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      },
      1,
    ],
    [
      lang === 'fr' ? 'Soleil' : 'Sun',
      (c) => {
        const g = c.createRadialGradient(640, 150, 0, 640, 150, 110);
        g.addColorStop(0, '#fff3a0');
        g.addColorStop(0.45, '#ffcf3f');
        g.addColorStop(1, 'rgba(255, 207, 63, 0)');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      },
      1,
    ],
    [
      lang === 'fr' ? 'Collines' : 'Hills',
      (c) => {
        c.fillStyle = '#2f9e57';
        c.beginPath();
        c.ellipse(220, 520, 420, 190, 0, 0, 2 * Math.PI);
        c.fill();
        c.fillStyle = '#237a43';
        c.beginPath();
        c.ellipse(660, 540, 380, 170, 0, 0, 2 * Math.PI);
        c.fill();
      },
      0.85,
    ],
    [lang === 'fr' ? 'Titre' : 'Title', (c) => drawShapes(c, shapes), 1],
  ];
  const layers = await Promise.all(
    draws.map(async ([name, draw, opacity], i) => ({ name, png: await png(w, h, draw), x: 0, y: 0, opacity, visible: true, ...(i === draws.length - 1 ? { shapes } : {}) })),
  );
  const flat = (scale: number): Promise<Uint8Array> =>
    png(Math.round(w * scale), Math.round(h * scale), (c) => {
      c.scale(scale, scale);
      for (const [, draw, opacity] of draws) {
        const layer = document.createElement('canvas');
        layer.width = w;
        layer.height = h;
        draw(layer.getContext('2d')!);
        c.globalAlpha = opacity;
        c.drawImage(layer, 0, 0);
      }
    });
  return writeOra({ width: w, height: h, layers }, await flat(1), await flat(0.32));
}
