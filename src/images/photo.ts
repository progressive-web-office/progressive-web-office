/**
 * IMG-001: what is done to a picture — turned, mirrored, lighter or with more
 * contrast, regions blurred (a face, a name), cropped, resized — and the
 * pixels it gives. Rectangles are in the pixels of the turned picture, before
 * the crop.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PhotoEdit {
  /** Quarter turns, clockwise. */
  rotate: 0 | 90 | 180 | 270;
  flip: boolean;
  /** Percent, 100 = unchanged. */
  brightness: number;
  contrast: number;
  blurs: Rect[];
  crop?: Rect;
  /** Share of the cropped size kept, 1 = unchanged. */
  scale: number;
}

export const NO_EDIT: PhotoEdit = { rotate: 0, flip: false, brightness: 100, contrast: 100, blurs: [], scale: 1 };

export const isUnchanged = (e: PhotoEdit): boolean => e.rotate === 0 && !e.flip && e.brightness === 100 && e.contrast === 100 && !e.blurs.length && !e.crop && e.scale === 1;

/** The size of the turned picture. */
export function turnedSize(w: number, h: number, rotate: PhotoEdit['rotate']): { w: number; h: number } {
  return rotate === 90 || rotate === 270 ? { w: h, h: w } : { w, h };
}

/** The rectangle between two corners, kept inside `w` × `h`, in whole pixels. */
export function rectBetween(a: [number, number], b: [number, number], w: number, h: number): Rect {
  const x1 = Math.max(0, Math.min(a[0], b[0]));
  const y1 = Math.max(0, Math.min(a[1], b[1]));
  const x2 = Math.min(w, Math.max(a[0], b[0]));
  const y2 = Math.min(h, Math.max(a[1], b[1]));
  // Outwards: what was dragged over is kept.
  const [left, top, right, bottom] = [Math.floor(x1), Math.floor(y1), Math.ceil(x2), Math.ceil(y2)];
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
}

/** The size of the result. */
export function outputSize(w: number, h: number, e: PhotoEdit): { w: number; h: number } {
  const turned = turnedSize(w, h, e.rotate);
  const base = e.crop && e.crop.w > 0 && e.crop.h > 0 ? e.crop : turned;
  return { w: Math.max(1, Math.round(base.w * e.scale)), h: Math.max(1, Math.round(base.h * e.scale)) };
}

/** A rectangle of the turned picture after a new quarter turn (crops and blurs follow the picture). */
export function turnRect(r: Rect, w: number, h: number, by: 90 | 270): Rect {
  // (w, h): the size before this turn.
  return by === 90 ? { x: h - r.y - r.h, y: r.x, w: r.h, h: r.w } : { x: r.y, y: w - r.x - r.w, w: r.h, h: r.w };
}

export function flipRect(r: Rect, w: number): Rect {
  return { ...r, x: w - r.x - r.w };
}

/** Draw the turned, mirrored, filtered and blurred picture, whole (before the crop). */
export function drawTurned(source: CanvasImageSource, sw: number, sh: number, e: PhotoEdit, doc: Document = document): HTMLCanvasElement {
  const { w, h } = turnedSize(sw, sh, e.rotate);
  const canvas = doc.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.filter = e.brightness !== 100 || e.contrast !== 100 ? `brightness(${e.brightness}%) contrast(${e.contrast}%)` : 'none';
  ctx.translate(w / 2, h / 2);
  ctx.rotate((e.rotate * Math.PI) / 180);
  if (e.flip) ctx.scale(e.rotate === 90 || e.rotate === 270 ? 1 : -1, e.rotate === 90 || e.rotate === 270 ? -1 : 1);
  ctx.drawImage(source, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
  // Blurred regions: drawn again from the picture itself, blurred, clipped to the region.
  for (const r of e.blurs) {
    if (r.w < 1 || r.h < 1) continue;
    const radius = Math.max(6, Math.round(Math.min(r.w, r.h) / 6));
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.filter = `blur(${radius}px)`;
    // Twice, so that a small text cannot be read through.
    ctx.drawImage(canvas, 0, 0);
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }
  return canvas;
}

/** The finished picture: turned, cropped, resized. */
export function renderPhoto(source: CanvasImageSource, sw: number, sh: number, e: PhotoEdit, doc: Document = document): HTMLCanvasElement {
  const turned = drawTurned(source, sw, sh, e, doc);
  const crop = e.crop && e.crop.w > 0 && e.crop.h > 0 ? e.crop : { x: 0, y: 0, w: turned.width, h: turned.height };
  const { w, h } = outputSize(sw, sh, e);
  const out = doc.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(turned, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  return out;
}
