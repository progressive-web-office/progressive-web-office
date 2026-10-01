/**
 * Mermaid rendering (DIAG-002, DIAG-003). The engine is a large module, so it
 * is imported on demand. Diagrams render in strict security mode without HTML
 * labels: the SVG contains no script, no `foreignObject` and no remote
 * reference, so it can be shown as an `<img>` and rasterised on a canvas.
 */
import type { Mermaid } from 'mermaid';
import type { RenderedDiagram } from '../document/model';

let loading: Promise<Mermaid> | undefined;
let counter = 0;

export function loadMermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      theme: 'default',
      fontFamily: 'Calibri, Carlito, "Segoe UI", system-ui, sans-serif',
    });
    return mermaid;
  });
  return loading;
}

export interface DiagramSvg {
  svg: string;
  width: number;
  height: number;
}

/** Render Mermaid source to a standalone SVG with explicit pixel dimensions. Throws on invalid source. */
export async function renderDiagramSvg(source: string): Promise<DiagramSvg> {
  const mermaid = await loadMermaid();
  await mermaid.parse(source);
  const { svg } = await mermaid.render(`pwo-diagram-${++counter}`, source);
  return sizedSvg(svg);
}

/** Give the SVG fixed width/height attributes from its viewBox (an `<img>` needs an intrinsic size). */
export function sizedSvg(svg: string): DiagramSvg {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const width = Math.max(1, Math.ceil(box[2] || parseFloat(root.getAttribute('width') ?? '') || 300));
  const height = Math.max(1, Math.ceil(box[3] || parseFloat(root.getAttribute('height') ?? '') || 150));
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.style.removeProperty('max-width');
  return { svg: new XMLSerializer().serializeToString(root), width, height };
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Rasterise a diagram to PNG at twice its size, on white (DIAG-005). */
export async function renderDiagramPng(source: string, scale = 2): Promise<RenderedDiagram> {
  const { svg, width, height } = await renderDiagramSvg(source);
  const img = new Image();
  img.src = svgDataUrl(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  return { png: new Uint8Array(await blob.arrayBuffer()), width, height };
}
