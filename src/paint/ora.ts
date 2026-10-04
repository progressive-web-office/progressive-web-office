/**
 * DRAW-013: a layered painting kept as an OpenRaster file (.ora) — the open
 * format of GIMP, Krita, MyPaint and Pinta: a ZIP holding `stack.xml`, one
 * PNG per layer, the flattened picture and a thumbnail. A vector layer
 * (DRAW-014) is also written as a PNG, for the other applications, and its
 * shapes as JSON beside it, for this one.
 */
import { readZip, readZipText, writeZip } from '../core/zip';
import { cleanShapes, type VectorShape } from './vector';

export const ORA_TYPE = 'image/openraster';

export interface OraLayer {
  name: string;
  png: Uint8Array;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  /** DRAW-014: the shapes of a vector layer. */
  shapes?: VectorShape[];
}

export interface OraImage {
  width: number;
  height: number;
  /** From the bottom to the top. */
  layers: OraLayer[];
}

/** Whether the bytes are an OpenRaster file: a ZIP whose first entry is `mimetype` = image/openraster. */
export function isOra(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  const head = new TextDecoder().decode(bytes.subarray(30, 30 + 8 + ORA_TYPE.length));
  return head === `mimetype${ORA_TYPE}`;
}

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The OpenRaster file of a painting; `merged` is the flattened picture, `thumbnail` at most 256 pixels. */
export function writeOra(image: OraImage, merged: Uint8Array, thumbnail: Uint8Array): Uint8Array {
  // stack.xml lists the layers from the top.
  const top = [...image.layers].reverse();
  const entries = top.map((l, i) => {
    const n = image.layers.length - i;
    return { layer: l, png: `data/layer${n}.png`, vector: l.shapes ? `pwo/vector${n}.json` : undefined };
  });
  const stack = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<image version="0.0.5" w="${image.width}" h="${image.height}" xres="72" yres="72">`,
    '<stack>',
    ...entries.map(
      (e) =>
        `<layer name="${escape(e.layer.name)}" src="${e.png}" x="${Math.round(e.layer.x)}" y="${Math.round(e.layer.y)}" opacity="${e.layer.opacity.toFixed(3)}" visibility="${e.layer.visible ? 'visible' : 'hidden'}" composite-op="svg:src-over"${e.vector ? ` pwo-vector="${e.vector}"` : ''}/>`,
    ),
    '</stack>',
    '</image>',
  ].join('\n');
  return writeZip([
    { path: 'mimetype', data: ORA_TYPE, store: true },
    { path: 'stack.xml', data: stack },
    ...entries.flatMap((e) => [{ path: e.png, data: e.layer.png, store: true }, ...(e.vector ? [{ path: e.vector, data: JSON.stringify(e.layer.shapes) }] : [])]),
    { path: 'mergedimage.png', data: merged, store: true },
    { path: 'Thumbnails/thumbnail.png', data: thumbnail, store: true },
  ]);
}

/** The layers of an OpenRaster file (nested stacks flattened in order), from the bottom. */
export function readOra(bytes: Uint8Array): OraImage {
  const zip = readZip(bytes);
  const xml = readZipText(zip, 'stack.xml');
  if (!xml) throw new Error('This OpenRaster file has no stack.xml.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'image') throw new Error('This OpenRaster file has no image.');
  const num = (el: Element, name: string, fallback: number): number => {
    const v = Number(el.getAttribute(name));
    return el.hasAttribute(name) && Number.isFinite(v) ? v : fallback;
  };
  const layers: OraLayer[] = [];
  // Document order is from the top: read, then reversed.
  for (const el of Array.from(root.getElementsByTagName('layer'))) {
    const png = zip[el.getAttribute('src') ?? ''];
    if (!png) continue;
    const vector = el.getAttribute('pwo-vector');
    let shapes: VectorShape[] | undefined;
    if (vector && zip[vector]) {
      try {
        shapes = cleanShapes(JSON.parse(readZipText(zip, vector) ?? '[]'));
      } catch {
        shapes = undefined;
      }
    }
    layers.push({
      name: el.getAttribute('name') ?? '',
      png,
      x: num(el, 'x', 0),
      y: num(el, 'y', 0),
      opacity: Math.max(0, Math.min(1, num(el, 'opacity', 1))),
      visible: el.getAttribute('visibility') !== 'hidden',
      ...(shapes ? { shapes } : {}),
    });
  }
  return { width: Math.max(1, num(root, 'w', 1)), height: Math.max(1, num(root, 'h', 1)), layers: layers.reverse() };
}

/** The flattened picture of an OpenRaster file, as its writer saved it. */
export function oraMerged(bytes: Uint8Array): Uint8Array | undefined {
  try {
    return readZip(bytes)['mergedimage.png'];
  } catch {
    return undefined;
  }
}
