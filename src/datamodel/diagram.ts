/**
 * DB-002: the diagram of a conceptual model — entities as boxes with their
 * identifier underlined, associations as rounded boxes linked to their
 * entities, the cardinalities by each link — laid out on its own: entities
 * on a grid, each association between its entities.
 */
import type { ConceptualModel } from './model';

const SVG = 'http://www.w3.org/2000/svg';
const CHAR = 7.4;
const LINE = 18;
const HEAD = 26;
const PAD = 12;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
};

const width = (lines: string[]): number => Math.max(90, ...lines.map((l) => l.length * CHAR + 2 * PAD));

/** Where the segment from the centre of `b` towards (x, y) leaves the box. */
function edge(b: Box, x: number, y: number): [number, number] {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = x - cx;
  const dy = y - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(Math.abs(b.w / 2 / (dx || 1e-9)), Math.abs(b.h / 2 / (dy || 1e-9)));
  return [cx + dx * s, cy + dy * s];
}

const overlap = (a: Box, b: Box, gap: number): boolean => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** The diagram of a model, as an SVG element (its size fits the drawing). */
export function drawModel(model: ConceptualModel, title: string): SVGSVGElement {
  const entityBoxes = new Map<string, Box>();
  const cols = Math.max(1, Math.ceil(Math.sqrt(model.entities.length)));
  const sizes = model.entities.map((e) => ({ w: width([e.name, ...e.attributes.map((a) => a.name)]), h: HEAD + Math.max(1, e.attributes.length) * LINE + 8 }));
  const colW = Math.max(160, ...sizes.map((s) => s.w)) + 170;
  const rowH = Math.max(120, ...sizes.map((s) => s.h)) + 110;
  model.entities.forEach((e, i) => {
    const s = sizes[i]!;
    const c = i % cols;
    const r = Math.floor(i / cols);
    entityBoxes.set(e.name, { x: 20 + c * colW + (colW - 170 - s.w) / 2, y: 20 + r * rowH, ...s });
  });
  // Associations: between their entities, moved aside while they cover a box.
  const assocBoxes = new Map<string, Box>();
  for (const a of model.associations) {
    const ends = a.participants.map((p) => entityBoxes.get(p.entity)).filter((b): b is Box => !!b);
    if (!ends.length) continue;
    const w = width([a.name, ...a.attributes.map((x) => x.name)]);
    const h = HEAD + a.attributes.length * LINE + 6;
    const distinct = new Set(ends);
    let cx = [...distinct].reduce((s, b) => s + b.x + b.w / 2, 0) / distinct.size;
    let cy = [...distinct].reduce((s, b) => s + b.y + b.h / 2, 0) / distinct.size;
    // A reflexive association goes to the right of its entity.
    if (distinct.size === 1) {
      const b = ends[0]!;
      cx = b.x + b.w + 40 + w / 2;
      cy = b.y + b.h / 2;
    }
    const box = { x: cx - w / 2, y: cy - h / 2, w, h };
    const others = (): Box[] => [...entityBoxes.values(), ...assocBoxes.values()];
    for (let step = 0; step < 40 && others().some((o) => overlap(box, o, 14)); step++) box.y += step % 2 ? -(step + 1) * 12 : (step + 1) * 12;
    assocBoxes.set(a.name, box);
  }
  const all = [...entityBoxes.values(), ...assocBoxes.values()];
  const minX = Math.min(0, ...all.map((b) => b.x - 20));
  const minY = Math.min(0, ...all.map((b) => b.y - 20));
  const maxX = Math.max(200, ...all.map((b) => b.x + b.w + 20));
  const maxY = Math.max(100, ...all.map((b) => b.y + b.h + 20));
  const root = svg('svg', { xmlns: SVG, viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`, width: maxX - minX, height: maxY - minY, role: 'img', class: 'datamodel-diagram' });
  root.append(svg('title', {}, title));
  root.append(svg('style', {}, '.dm-box{fill:var(--surface,#fff);stroke:var(--text,#222);stroke-width:1.2}.dm-assoc{fill:color-mix(in srgb,var(--accent,#2563eb) 10%,var(--surface,#fff));stroke:var(--accent,#2563eb);stroke-width:1.2}.dm-head{font-weight:700}.dm-text{font:13px system-ui,sans-serif;fill:var(--text,#222)}.dm-link{stroke:var(--text,#222);stroke-width:1.1;fill:none}.dm-card{font:12px system-ui,sans-serif;fill:var(--accent,#2563eb);font-weight:600}.dm-id{text-decoration:underline}'));
  const links = svg('g', { class: 'dm-links' });
  const boxes = svg('g');
  root.append(links, boxes);
  for (const a of model.associations) {
    const box = assocBoxes.get(a.name);
    if (!box) continue;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const seen = new Map<string, number>();
    for (const p of a.participants) {
      const target = entityBoxes.get(p.entity);
      if (!target) continue;
      const n = seen.get(p.entity) ?? 0;
      seen.set(p.entity, n + 1);
      // A second link to the same entity is moved aside.
      const shift = n * 22;
      const tx = target.x + target.w / 2;
      const ty = target.y + target.h / 2 + shift;
      const [ex, ey] = edge({ ...target, y: target.y + shift, h: target.h }, cx, cy);
      const [sx, sy] = edge(box, tx, ty);
      links.append(svg('line', { x1: sx, y1: sy, x2: ex, y2: ey, class: 'dm-link' }));
      // The cardinality by the entity, a little aside of the line.
      const len = Math.hypot(sx - ex, sy - ey) || 1;
      const ux = (sx - ex) / len;
      const uy = (sy - ey) / len;
      const label = `${p.cardinality}${p.role ? ` (${p.role})` : ''}`;
      links.append(svg('text', { x: ex + ux * 18 - uy * 10, y: ey + uy * 18 + ux * 10 + 4, class: 'dm-card', 'text-anchor': 'middle' }, label));
    }
    const g = svg('g', { class: 'dm-association', 'data-name': a.name });
    g.append(svg('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: Math.min(18, box.h / 2), class: 'dm-assoc' }));
    g.append(svg('text', { x: cx, y: box.y + 18, class: 'dm-text dm-head', 'text-anchor': 'middle' }, a.name));
    a.attributes.forEach((at, i) => g.append(svg('text', { x: cx, y: box.y + HEAD + 12 + i * LINE, class: 'dm-text', 'text-anchor': 'middle' }, at.name)));
    boxes.append(g);
  }
  for (const e of model.entities) {
    const b = entityBoxes.get(e.name)!;
    const g = svg('g', { class: 'dm-entity', 'data-name': e.name });
    g.append(svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 3, class: 'dm-box' }));
    g.append(svg('text', { x: b.x + b.w / 2, y: b.y + 18, class: 'dm-text dm-head', 'text-anchor': 'middle' }, e.name));
    g.append(svg('line', { x1: b.x, y1: b.y + HEAD, x2: b.x + b.w, y2: b.y + HEAD, class: 'dm-link' }));
    e.attributes.forEach((at, i) => g.append(svg('text', { x: b.x + PAD, y: b.y + HEAD + 14 + i * LINE, class: `dm-text${at.identifier ? ' dm-id' : ''}` }, at.name)));
    boxes.append(g);
  }
  return root;
}
