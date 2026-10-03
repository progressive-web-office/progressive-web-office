/**
 * DOC-047: graduated rulers around the page, as in a word processor — the
 * horizontal one in centimetres (or inches) from the edge of the paper, its
 * margins greyed, with the margins and the indents of the paragraph to drag;
 * the vertical one along the page, where each page's text ends marked.
 */
import { h } from '../app/dom';
import type { PageGeometry } from './model';

const SVG = 'http://www.w3.org/2000/svg';
export const RULER = 22;

export type RulerUnit = 'cm' | 'in';

/** Where the marks of a ruler go: every mm (or 1/8 in), longer and numbered every cm (inch). */
export function ticks(lengthMm: number, unit: RulerUnit): { at: number; size: 1 | 2 | 3; label?: string }[] {
  const out: { at: number; size: 1 | 2 | 3; label?: string }[] = [];
  if (unit === 'cm') {
    for (let mm = 0; mm <= lengthMm + 1e-6; mm++) out.push(mm % 10 === 0 ? { at: mm, size: 3, label: String(mm / 10) } : { at: mm, size: mm % 5 === 0 ? 2 : 1 });
  } else {
    const step = 25.4 / 8;
    for (let k = 0; k * step <= lengthMm + 1e-6; k++) out.push(k % 8 === 0 ? { at: k * step, size: 3, label: String(k / 8) } : { at: k * step, size: k % 4 === 0 ? 2 : 1 });
  }
  return out;
}

export interface RulerHooks {
  /** A margin dragged to `mm` from the edge of the paper. */
  margin(side: 'left' | 'right', mm: number): void;
  /** The indents of the paragraph (from the left margin, in points), dragged. */
  indent(kind: 'indent' | 'firstLine', pt: number): void;
}

export interface RulerState {
  geometry: PageGeometry;
  /** Pixels on screen of a millimetre of the page. */
  pxPerMm: number;
  /** Left indent and first-line indent of the paragraph of the cursor, in points. */
  indent: number;
  firstLine: number;
  /** Height of the page on screen, in pixels; where the text of each page ends (from the top of the page). */
  height: number;
  pageEnds: number[];
}

const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

const PT_PER_MM = 72 / 25.4;

export class Rulers {
  readonly horizontal = h('div', { class: 'ruler ruler-h', role: 'group' });
  readonly vertical = h('div', { class: 'ruler ruler-v', role: 'group' });
  private state: RulerState | undefined;

  constructor(
    private readonly hooks: RulerHooks,
    private readonly labels: { horizontal: string; vertical: string; left: string; right: string; indent: string; firstLine: string; page: (n: number) => string },
    private unit: RulerUnit = 'cm',
  ) {
    this.horizontal.setAttribute('aria-label', labels.horizontal);
    this.vertical.setAttribute('aria-label', labels.vertical);
  }

  setUnit(unit: RulerUnit): void {
    this.unit = unit;
    if (this.state) this.render(this.state);
  }

  render(state: RulerState): void {
    this.state = state;
    const g = state.geometry;
    const k = state.pxPerMm;
    const width = g.width * k;
    // Horizontal: the paper, its margins greyed, the marks, the handles.
    const svg = el('svg', { width, height: RULER, viewBox: `0 0 ${width} ${RULER}`, 'aria-hidden': 'true' });
    svg.append(el('rect', { x: 0, y: 0, width, height: RULER, class: 'ruler-paper' }));
    svg.append(el('rect', { x: 0, y: 0, width: g.left * k, height: RULER, class: 'ruler-margin' }));
    svg.append(el('rect', { x: (g.width - g.right) * k, y: 0, width: g.right * k, height: RULER, class: 'ruler-margin' }));
    for (const tick of ticks(g.width, this.unit)) {
      const x = tick.at * k;
      svg.append(el('line', { x1: x, x2: x, y1: RULER, y2: RULER - (tick.size === 3 ? 9 : tick.size === 2 ? 6 : 3), class: 'ruler-tick' }));
      if (tick.label && tick.at > 0 && tick.at < g.width) {
        const text = el('text', { x, y: 10, class: 'ruler-label', 'text-anchor': 'middle' });
        text.textContent = tick.label;
        svg.append(text);
      }
    }
    const left = g.left * k;
    const handles = [
      this.handle('margin-left', this.labels.left, left, (px) => this.hooks.margin('left', round(px / k))),
      this.handle('margin-right', this.labels.right, (g.width - g.right) * k, (px) => this.hooks.margin('right', round(g.width - px / k))),
      this.handle('indent', this.labels.indent, left + (state.indent / PT_PER_MM) * k, (px) => this.hooks.indent('indent', Math.max(0, round(((px - left) / k) * PT_PER_MM)))),
      this.handle('first-line', this.labels.firstLine, left + ((state.indent + state.firstLine) / PT_PER_MM) * k, (px) => this.hooks.indent('firstLine', round(((px - left) / k) * PT_PER_MM - state.indent))),
    ];
    // The handle being moved with the keyboard keeps the focus when the ruler is drawn again.
    const focused = this.horizontal.contains(document.activeElement) ? (document.activeElement as HTMLElement).className : undefined;
    this.horizontal.style.width = `${width}px`;
    this.horizontal.replaceChildren(svg, ...handles);
    if (focused) handles.find((x) => x.className === focused)?.focus();
    // Vertical: the paper's height, numbered from the top of the sheet, the end of each page's text marked.
    const height = state.height;
    const v = el('svg', { width: RULER, height, viewBox: `0 0 ${RULER} ${height}`, 'aria-hidden': 'true' });
    v.append(el('rect', { x: 0, y: 0, width: RULER, height, class: 'ruler-paper' }));
    v.append(el('rect', { x: 0, y: 0, width: RULER, height: g.top * k, class: 'ruler-margin' }));
    for (const tick of ticks(height / k, this.unit)) {
      const y = tick.at * k;
      v.append(el('line', { y1: y, y2: y, x1: RULER, x2: RULER - (tick.size === 3 ? 9 : tick.size === 2 ? 6 : 3), class: 'ruler-tick' }));
      if (tick.label && tick.at > 0) {
        const text = el('text', { x: 9, y, class: 'ruler-label', 'text-anchor': 'middle', 'dominant-baseline': 'middle', transform: `rotate(-90 9 ${y})` });
        text.textContent = tick.label;
        v.append(text);
      }
    }
    v.append(el('rect', { x: 0, y: Math.max(0, height - g.bottom * k), width: RULER, height: g.bottom * k, class: 'ruler-margin' }));
    state.pageEnds.forEach((y, i) => {
      v.append(el('line', { x1: 0, x2: RULER, y1: y, y2: y, class: 'ruler-page-end' }));
      const text = el('text', { x: RULER / 2, y: y + 12, class: 'ruler-page', 'text-anchor': 'middle' });
      text.textContent = this.labels.page(i + 2);
      if (i + 1 < state.pageEnds.length || y + 14 < height) v.append(text);
    });
    this.vertical.style.height = `${height}px`;
    this.vertical.replaceChildren(v);
  }

  /** A handle dragged along the horizontal ruler (or moved with the arrow keys, 1 mm at a time). */
  private handle(kind: string, label: string, x: number, moved: (px: number) => void): HTMLElement {
    const node = h('span', { class: `ruler-handle ${kind}`, role: 'slider', tabindex: '0', 'aria-label': label, title: label, style: `left: ${x}px` });
    const k = this.state?.pxPerMm ?? 1;
    node.setAttribute('aria-valuenow', String(round(x / k)));
    node.setAttribute('aria-valuetext', `${round(x / k / (this.unit === 'cm' ? 10 : 25.4))} ${this.unit}`);
    let start: number | undefined;
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      start = e.clientX - x;
    });
    node.addEventListener('pointermove', (e) => {
      if (start === undefined) return;
      node.style.left = `${e.clientX - start}px`;
    });
    const end = (e: PointerEvent): void => {
      if (start === undefined) return;
      const at = e.clientX - start;
      start = undefined;
      // A millimetre at a time, as on paper.
      moved(Math.round(at / k) * k);
    };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', () => (start = undefined));
    node.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      moved(x + (e.key === 'ArrowLeft' ? -k : k));
    });
    return node;
  }
}

const round = (n: number): number => Math.round(n * 10) / 10;
