/** DRAW-008: pixel operations of the painting editor, on RGBA buffers. */

export type Rgba = [number, number, number, number];

export function hexToRgba(hex: string, alpha = 1): Rgba {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1]!, 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, Math.round(Math.max(0, Math.min(1, alpha)) * 255)];
}

export function rgbaToHex([r, g, b]: Rgba | Uint8ClampedArray | number[]): string {
  return `#${[r, g, b].map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`;
}

/** The colour of a pixel. */
export function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number): Rgba {
  const i = (y * width + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
}

/**
 * Fills the region of pixels of the same colour as (x, y) — within a
 * tolerance (0–255 per channel) — with a colour, blended over it by its alpha.
 * Returns the number of pixels changed.
 */
export function floodFill(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, color: Rgba, tolerance = 32): number {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  const target = pixelAt(data, width, x, y);
  const a = color[3] / 255;
  const blended = (i: number): Rgba => {
    const da = data[i + 3]! / 255;
    const oa = a + da * (1 - a);
    if (!oa) return [0, 0, 0, 0];
    const c = (k: number): number => Math.round((color[k]! * a + data[i + k]! * da * (1 - a)) / oa);
    return [c(0), c(1), c(2), Math.round(oa * 255)];
  };
  const matches = (i: number): boolean =>
    Math.abs(data[i]! - target[0]) <= tolerance && Math.abs(data[i + 1]! - target[1]) <= tolerance && Math.abs(data[i + 2]! - target[2]) <= tolerance && Math.abs(data[i + 3]! - target[3]) <= tolerance;
  const seen = new Uint8Array(width * height);
  const stack = [y * width + x];
  let changed = 0;
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    // Scan the run of matching pixels on this row.
    const row = Math.floor(p / width);
    let left = p;
    while (left % width > 0 && !seen[left - 1] && matches((left - 1) * 4)) left--;
    let right = p;
    while (right % width < width - 1 && !seen[right + 1] && matches((right + 1) * 4)) right++;
    for (let q = left; q <= right; q++) {
      if (seen[q] || !matches(q * 4)) continue;
      seen[q] = 1;
      const i = q * 4;
      const [r, g, b, al] = blended(i);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = al;
      changed++;
      for (const n of [q - width, q + width]) if (n >= 0 && n < width * height && !seen[n] && Math.floor(n / width) === row + (n > q ? 1 : -1) && matches(n * 4)) stack.push(n);
    }
  }
  return changed;
}

/** A rectangle between two points, inside the canvas, in whole pixels. */
export function rectBetween(a: [number, number], b: [number, number], width: number, height: number): { x: number; y: number; w: number; h: number } {
  const x0 = Math.max(0, Math.min(width, Math.floor(Math.min(a[0], b[0]))));
  const y0 = Math.max(0, Math.min(height, Math.floor(Math.min(a[1], b[1]))));
  const x1 = Math.max(0, Math.min(width, Math.ceil(Math.max(a[0], b[0]))));
  const y1 = Math.max(0, Math.min(height, Math.ceil(Math.max(a[1], b[1]))));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Points along a segment, at most `step` apart (stamping a brush without gaps). */
export function along(a: [number, number], b: [number, number], step: number): [number, number][] {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(0.5, step)));
  return Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * (i + 1)) / n, a[1] + ((b[1] - a[1]) * (i + 1)) / n]);
}

/** Whether a picture type keeps transparency (else erased pixels become white). */
export const keepsAlpha = (mediaType: string): boolean => mediaType !== 'image/jpeg';
