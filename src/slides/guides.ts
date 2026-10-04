/**
 * PRES-015: alignment guides — a shape moved or resized near the edges or
 * the centre of another shape, or of the slide, snaps to them, and a line
 * shows what it is aligned with.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A guide line: vertical at x = at (from y = from to y = to), or horizontal at y = at. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

interface Hit {
  delta: number;
  at: number;
  boxes: Box[];
}

/** The best snap of some points (positions of the moved box) onto targets, within the threshold. */
function best(points: number[], targets: { at: number; box: Box }[], threshold: number): Hit | undefined {
  let hit: Hit | undefined;
  for (const p of points) {
    for (const tg of targets) {
      const delta = tg.at - p;
      if (Math.abs(delta) > threshold) continue;
      if (!hit || Math.abs(delta) < Math.abs(hit.delta) - 1e-9) hit = { delta, at: tg.at, boxes: [tg.box] };
      else if (Math.abs(delta - hit.delta) < 1e-9 && tg.at === hit.at) hit.boxes.push(tg.box);
    }
  }
  return hit;
}

const xs = (b: Box): number[] => [b.x, b.x + b.width / 2, b.x + b.width];
const ys = (b: Box): number[] => [b.y, b.y + b.height / 2, b.y + b.height];

function guide(axis: 'x' | 'y', at: number, moved: Box, boxes: Box[]): Guide {
  const all = [moved, ...boxes];
  return axis === 'x'
    ? { axis, at, from: Math.min(...all.map((b) => b.y)), to: Math.max(...all.map((b) => b.y + b.height)) }
    : { axis, at, from: Math.min(...all.map((b) => b.x)), to: Math.max(...all.map((b) => b.x + b.width)) };
}

/**
 * Where a moved box snaps: its left, centre or right onto those of the other
 * boxes and of the slide; the same for top, middle and bottom.
 */
export function snapMove(box: Box, others: Box[], slide: { width: number; height: number }, threshold: number): { x: number; y: number; guides: Guide[] } {
  const page: Box = { x: 0, y: 0, ...slide };
  const all = [...others, page];
  const hx = best(xs(box), all.flatMap((b) => xs(b).map((at) => ({ at, box: b }))), threshold);
  const hy = best(ys(box), all.flatMap((b) => ys(b).map((at) => ({ at, box: b }))), threshold);
  const moved = { ...box, x: box.x + (hx?.delta ?? 0), y: box.y + (hy?.delta ?? 0) };
  const guides: Guide[] = [];
  if (hx) guides.push(guide('x', hx.at, moved, hx.boxes));
  if (hy) guides.push(guide('y', hy.at, moved, hy.boxes));
  return { x: moved.x, y: moved.y, guides };
}

/** Where the right and bottom edges of a resized box snap. */
export function snapResize(box: Box, others: Box[], slide: { width: number; height: number }, threshold: number): { width: number; height: number; guides: Guide[] } {
  const page: Box = { x: 0, y: 0, ...slide };
  const all = [...others, page];
  const hx = best([box.x + box.width], all.flatMap((b) => xs(b).map((at) => ({ at, box: b }))), threshold);
  const hy = best([box.y + box.height], all.flatMap((b) => ys(b).map((at) => ({ at, box: b }))), threshold);
  const sized = { ...box, width: box.width + (hx?.delta ?? 0), height: box.height + (hy?.delta ?? 0) };
  const guides: Guide[] = [];
  if (hx) guides.push(guide('x', hx.at, sized, hx.boxes));
  if (hy) guides.push(guide('y', hy.at, sized, hy.boxes));
  return { width: sized.width, height: sized.height, guides };
}
