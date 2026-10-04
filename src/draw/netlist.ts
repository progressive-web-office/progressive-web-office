/**
 * DRAW-009: the electrical nets of a schematic, written as a SPICE netlist,
 * and its bill of materials.
 */
import { pinsOf, type Drawing, type LineShape, type Pt, type SymbolShape } from './model';
import { symbolDef } from './symbols';

const key = (p: Pt): string => `${p[0]},${p[1]}`;

const onSegment = (p: Pt, a: Pt, b: Pt): boolean => {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  return Math.abs(cross) < 1e-6 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
};

/** The net name of each pin of each symbol: ground is 0, others N1, N2… or the value of a terminal on them. */
export function nets(d: Drawing): Map<string, string[]> {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  const add = (k: string): void => void (parent.has(k) || parent.set(k, k));
  const union = (a: string, b: string): void => {
    add(a);
    add(b);
    parent.set(find(a), find(b));
  };
  const wires = d.shapes.filter((s): s is LineShape => s.kind === 'line' && !!s.wire);
  const symbols = d.shapes.filter((s): s is SymbolShape => s.kind === 'symbol' && !!symbolDef(s.sym));
  for (const w of wires) {
    w.points.forEach((p) => add(key(p)));
    for (let i = 1; i < w.points.length; i++) union(key(w.points[i - 1]!), key(w.points[i]!));
  }
  // An end of a wire, or a pin, on another wire joins it (a T); plain crossings do not.
  const ends: Pt[] = [...wires.flatMap((w) => [w.points[0]!, w.points[w.points.length - 1]!]), ...symbols.flatMap(pinsOf)];
  for (const p of ends) {
    add(key(p));
    for (const w of wires) for (let i = 1; i < w.points.length; i++) if (onSegment(p, w.points[i - 1]!, w.points[i]!)) union(key(p), key(w.points[0]!));
  }
  // Names: ground first, then labels of terminals, then numbers in reading order.
  const names = new Map<string, string>();
  for (const s of symbols) {
    if (s.sym === 'ground' || s.sym === 'protective-earth') for (const p of pinsOf(s)) names.set(find(key(p)), '0');
  }
  for (const s of symbols) {
    if (s.sym === 'connection' && s.value?.trim()) {
      const root = find(key(pinsOf(s)[0]!));
      if (!names.has(root)) names.set(root, s.value.trim().replace(/\s+/g, '_'));
    }
  }
  let n = 0;
  const out = new Map<string, string[]>();
  const ordered = [...symbols].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const s of ordered) {
    out.set(
      s.id,
      pinsOf(s).map((p) => {
        const root = find(key(p));
        if (!names.has(root)) names.set(root, `N${++n}`);
        return names.get(root)!;
      }),
    );
  }
  return out;
}

const SI: Record<string, string> = { p: 'p', n: 'n', µ: 'u', u: 'u', m: 'm', k: 'k', M: 'Meg', G: 'G' };

/** A value as SPICE writes it: "4.7 kΩ" → 4.7k, "100 nF" → 100n, "1 MΩ" → 1Meg. */
export function spiceValue(value: string | undefined, fallback = '1'): string {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([pnµumkMG]?)/.exec(value ?? '');
  if (!m) return value?.trim().replace(/\s+/g, '_') || fallback;
  return `${m[1]!.replace(',', '.')}${m[2] ? SI[m[2]] : ''}`;
}

/** SPICE card of a symbol: its letter, and the order of its pins. */
const CARDS: Record<string, { letter: string; order: number[]; value: (v: string | undefined) => string }> = {
  resistor: { letter: 'R', order: [0, 1], value: (v) => spiceValue(v, '1k') },
  capacitor: { letter: 'C', order: [0, 1], value: (v) => spiceValue(v, '1u') },
  'capacitor-polarised': { letter: 'C', order: [0, 1], value: (v) => spiceValue(v, '1u') },
  inductor: { letter: 'L', order: [0, 1], value: (v) => spiceValue(v, '1m') },
  vdc: { letter: 'V', order: [0, 1], value: (v) => `DC ${spiceValue(v, '5')}` },
  battery: { letter: 'V', order: [0, 1], value: (v) => `DC ${spiceValue(v, '9')}` },
  vac: { letter: 'V', order: [0, 1], value: (v) => `AC ${spiceValue(v, '1')} SIN(0 ${spiceValue(v, '1')} 50)` },
  idc: { letter: 'I', order: [1, 0], value: (v) => `DC ${spiceValue(v, '1m')}` },
  diode: { letter: 'D', order: [0, 1], value: (v) => v?.trim() || 'D' },
  led: { letter: 'D', order: [0, 1], value: (v) => v?.trim() || 'LED' },
  zener: { letter: 'D', order: [0, 1], value: (v) => v?.trim() || 'DZ' },
  npn: { letter: 'Q', order: [1, 0, 2], value: (v) => v?.trim() || 'NPN' },
  pnp: { letter: 'Q', order: [1, 0, 2], value: (v) => v?.trim() || 'PNP' },
  nmos: { letter: 'M', order: [1, 0, 2, 2], value: (v) => v?.trim() || 'NMOS' },
  pmos: { letter: 'M', order: [1, 0, 2, 2], value: (v) => v?.trim() || 'PMOS' },
  fuse: { letter: 'R', order: [0, 1], value: () => '0.01' },
};

export function spiceNetlist(d: Drawing, title = 'Schematic'): string {
  const byPin = nets(d);
  const lines = [`* ${title.replace(/\n/g, ' ')}`];
  const models = new Set<string>();
  let anon = 0;
  for (const s of d.shapes) {
    if (s.kind !== 'symbol') continue;
    const def = symbolDef(s.sym);
    const pins = byPin.get(s.id);
    if (!def || !pins || def.category !== 'electrical' || !def.prefix) continue;
    const card = CARDS[s.sym];
    const ref = s.ref ?? `${def.prefix}${++anon}`;
    if (!card) {
      lines.push(`* ${ref} (${def.name}${s.value ? `, ${s.value}` : ''}) ${pins.join(' ')}: not simulated`);
      continue;
    }
    const name = ref.toUpperCase().startsWith(card.letter) ? ref : `${card.letter}${ref}`;
    const value = card.value(s.value);
    lines.push(`${name} ${card.order.map((i) => pins[i]).join(' ')} ${value}`);
    if (card.letter === 'D' && !s.value) models.add(`.model ${value} D`);
    if (card.letter === 'Q' && !s.value) models.add(`.model ${value} ${value}`);
    if (card.letter === 'M' && !s.value) models.add(`.model ${value} ${value}`);
  }
  return [...lines, ...models, '.op', '.end', ''].join('\n');
}

export interface BomLine {
  quantity: number;
  references: string[];
  component: string;
  value: string;
}

/** The parts of a drawing, grouped by kind and value, in reference order. */
export function billOfMaterials(d: Drawing): BomLine[] {
  const groups = new Map<string, BomLine>();
  for (const s of d.shapes) {
    if (s.kind !== 'symbol') continue;
    const def = symbolDef(s.sym);
    if (!def?.prefix) continue;
    const k = `${def.name}\u0000${s.value ?? ''}`;
    const line = groups.get(k) ?? { quantity: 0, references: [], component: def.name, value: s.value ?? '' };
    line.quantity++;
    if (s.ref) line.references.push(s.ref);
    groups.set(k, line);
  }
  const natural = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true });
  const lines = [...groups.values()];
  for (const l of lines) l.references.sort(natural);
  return lines.sort((a, b) => natural(a.references[0] ?? a.component, b.references[0] ?? b.component));
}

/** The bill of materials as CSV, for a spreadsheet. */
export function bomCsv(lines: BomLine[], header = ['Quantity', 'References', 'Component', 'Value']): string {
  const cell = (v: string | number): string => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [header, ...lines.map((l) => [l.quantity, l.references.join(' '), l.component, l.value])].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}
