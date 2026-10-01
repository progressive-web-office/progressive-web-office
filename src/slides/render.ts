/** DOM rendering of slides (stage, thumbnails, slideshow). */
import { h } from '../app/dom';
import { blocksToDom } from '../document/html';
import { expandMathRuns } from '../math/inline';
import type { Presentation, Shape, Slide } from './model';

export type ResolveImage = (key: string) => string | undefined;

/** Shape text; `$…$` becomes equations unless `source` is set (TEX-006). */
export function renderShapeContent(shape: Shape, source = false): HTMLElement {
  const content = h('div', { class: 'shape-content' });
  content.style.fontSize = `${shape.fontSize}pt`;
  const paragraphs = source ? shape.paragraphs : shape.paragraphs.map((p) => ({ ...p, runs: expandMathRuns(p.runs) }));
  content.append(blocksToDom(paragraphs, document, () => undefined));
  return content;
}

export function renderShape(shape: Shape, resolve: ResolveImage): HTMLElement {
  const el = h('div', { class: `shape ${shape.kind}`, 'data-id': String(shape.id) });
  el.style.left = `${shape.x}px`;
  el.style.top = `${shape.y}px`;
  el.style.width = `${shape.width}px`;
  el.style.height = `${shape.height}px`;
  if (shape.fill) el.style.background = shape.fill;
  if (shape.line) el.style.border = `2px solid ${shape.line}`;
  if (shape.anchor) el.dataset.anchor = shape.anchor;
  if (shape.kind === 'image') {
    const url = shape.image ? resolve(shape.image) : undefined;
    if (url) el.append(h('img', { src: url, alt: shape.alt ?? '', draggable: 'false' }));
  } else {
    el.append(renderShapeContent(shape));
  }
  return el;
}

/** A slide at its natural size (pres.width × pres.height CSS pixels). */
export function renderSlide(slide: Slide, pres: Presentation, resolve: ResolveImage): HTMLElement {
  const el = h('div', { class: 'slide' });
  el.style.width = `${pres.width}px`;
  el.style.height = `${pres.height}px`;
  el.style.background = slide.background ?? '#ffffff';
  for (const shape of slide.shapes) el.append(renderShape(shape, resolve));
  return el;
}
