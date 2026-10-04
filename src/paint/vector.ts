/**
 * DRAW-014: the shapes of a vector layer of a painting — lines, rectangles,
 * ellipses and texts that stay shapes: selected, moved, recoloured, removed —
 * drawn over or under the painted layers.
 */

export type VectorShape =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; opacity: number }
  | { kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; color: string; width: number; opacity: number; filled: boolean }
  | { kind: 'text'; x: number; y: number; text: string; size: number; color: string; opacity: number };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const lineHeight = (size: number): number => size * 1.2;

/** The box a shape covers (a text measured roughly when no context is given). */
export function bounds(s: VectorShape, measure?: (text: string, size: number) => number): Box {
  if (s.kind === 'line') {
    const pad = s.width / 2;
    return { x: Math.min(s.x1, s.x2) - pad, y: Math.min(s.y1, s.y2) - pad, w: Math.abs(s.x2 - s.x1) + s.width, h: Math.abs(s.y2 - s.y1) + s.width };
  }
  if (s.kind === 'text') {
    const lines = s.text.split('\n');
    const w = Math.max(...lines.map((l) => (measure ? measure(l, s.size) : l.length * s.size * 0.55)));
    return { x: s.x, y: s.y, w, h: lines.length * lineHeight(s.size) };
  }
  const x = Math.min(s.x, s.x + s.w);
  const y = Math.min(s.y, s.y + s.h);
  const pad = s.filled ? 0 : s.width / 2;
  return { x: x - pad, y: y - pad, w: Math.abs(s.w) + 2 * pad, h: Math.abs(s.h) + 2 * pad };
}

/** The shape moved by (dx, dy). */
export function moved(s: VectorShape, dx: number, dy: number): VectorShape {
  if (s.kind === 'line') return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  return { ...s, x: s.x + dx, y: s.y + dy };
}

/** The distance from a point to a segment. */
function toSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Whether a point (in pixels) touches the shape, with some tolerance. */
export function hits(s: VectorShape, px: number, py: number, tolerance = 4, measure?: (text: string, size: number) => number): boolean {
  if (s.kind === 'line') return toSegment(px, py, s.x1, s.y1, s.x2, s.y2) <= s.width / 2 + tolerance;
  const b = bounds(s, measure);
  const inside = px >= b.x - tolerance && px <= b.x + b.w + tolerance && py >= b.y - tolerance && py <= b.y + b.h + tolerance;
  if (!inside) return false;
  if (s.kind === 'text' || s.filled) return true;
  if (s.kind === 'rect') {
    // An outline: near one of its sides.
    const x0 = Math.min(s.x, s.x + s.w);
    const y0 = Math.min(s.y, s.y + s.h);
    const x1 = x0 + Math.abs(s.w);
    const y1 = y0 + Math.abs(s.h);
    const near = s.width / 2 + tolerance;
    return Math.abs(px - x0) <= near || Math.abs(px - x1) <= near || Math.abs(py - y0) <= near || Math.abs(py - y1) <= near;
  }
  // An ellipse outline: near its curve.
  const rx = Math.abs(s.w) / 2;
  const ry = Math.abs(s.h) / 2;
  const cx = Math.min(s.x, s.x + s.w) + rx;
  const cy = Math.min(s.y, s.y + s.h) + ry;
  if (!rx || !ry) return false;
  const d = Math.hypot((px - cx) / rx, (py - cy) / ry);
  return Math.abs(d - 1) * Math.min(rx, ry) <= s.width / 2 + tolerance;
}

/** The topmost shape under a point, by its index. */
export function shapeAt(shapes: VectorShape[], px: number, py: number, measure?: (text: string, size: number) => number): number {
  for (let i = shapes.length - 1; i >= 0; i--) if (hits(shapes[i]!, px, py, 4, measure)) return i;
  return -1;
}

/** Draw the shapes on a canvas context. */
export function drawShapes(c: CanvasRenderingContext2D, shapes: VectorShape[]): void {
  for (const s of shapes) {
    c.save();
    c.globalAlpha = s.opacity;
    c.strokeStyle = c.fillStyle = s.color;
    if (s.kind === 'text') {
      c.font = `${s.size}px sans-serif`;
      c.textBaseline = 'top';
      s.text.split('\n').forEach((line, i) => c.fillText(line, s.x, s.y + i * lineHeight(s.size)));
    } else {
      c.lineWidth = s.width;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      if (s.kind === 'line') {
        c.moveTo(s.x1, s.y1);
        c.lineTo(s.x2, s.y2);
        c.stroke();
      } else {
        if (s.kind === 'rect') c.rect(s.x, s.y, s.w, s.h);
        else c.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, 2 * Math.PI);
        if (s.filled) c.fill();
        else c.stroke();
      }
    }
    c.restore();
  }
}

/** Only well-formed shapes, from a file. */
export function cleanShapes(data: unknown): VectorShape[] {
  if (!Array.isArray(data)) return [];
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const color = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);
  const out: VectorShape[] = [];
  for (const s of data as Record<string, unknown>[]) {
    if (!s || !color(s.color)) continue;
    const opacity = num(s.opacity) ? Math.max(0, Math.min(1, s.opacity)) : 1;
    if (s.kind === 'line' && [s.x1, s.y1, s.x2, s.y2, s.width].every(num)) out.push({ kind: 'line', x1: s.x1 as number, y1: s.y1 as number, x2: s.x2 as number, y2: s.y2 as number, color: s.color, width: s.width as number, opacity });
    else if ((s.kind === 'rect' || s.kind === 'ellipse') && [s.x, s.y, s.w, s.h, s.width].every(num))
      out.push({ kind: s.kind, x: s.x as number, y: s.y as number, w: s.w as number, h: s.h as number, color: s.color, width: s.width as number, opacity, filled: s.filled === true });
    else if (s.kind === 'text' && typeof s.text === 'string' && [s.x, s.y, s.size].every(num)) out.push({ kind: 'text', x: s.x as number, y: s.y as number, text: s.text.slice(0, 10_000), size: s.size as number, color: s.color, opacity });
  }
  return out;
}
