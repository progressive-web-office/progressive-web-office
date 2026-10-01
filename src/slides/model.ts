/** Presentation model: slides of positioned shapes (PRES-001..PRES-010). */
import { t } from '../i18n';
import type { DocumentMeta, Paragraph, Resource } from '../document/model';

export type ShapeKind = 'text' | 'rect' | 'ellipse' | 'image';
export type Placeholder = 'title' | 'subtitle' | 'body';

export interface Shape {
  id: number;
  kind: ShapeKind;
  /** Position and size in CSS pixels (96 dpi). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fill colour `#rrggbb` (undefined = no fill). */
  fill?: string;
  /** Outline colour `#rrggbb` (undefined = no outline). */
  line?: string;
  /** Text content (also allowed in rectangles and ellipses). */
  paragraphs: Paragraph[];
  /** Default font size in points for runs without an explicit size. */
  fontSize: number;
  /** Vertical text anchoring. */
  anchor?: 'top' | 'middle' | 'bottom';
  placeholder?: Placeholder;
  /** Resource key for pictures. */
  image?: string;
  alt?: string;
}

export interface Slide {
  shapes: Shape[];
  background?: string;
  notes?: string;
}

export interface Presentation {
  /** Slide size in CSS pixels. */
  width: number;
  height: number;
  slides: Slide[];
  resources: Map<string, Resource>;
  meta: DocumentMeta;
}

/** 16:9 slide, 13.333 in × 7.5 in. */
export const DEFAULT_SIZE = { width: 1280, height: 720 };

/** Round to 1/100 px (the precision kept by the file formats). */
const r = (v: number): number => Math.round(v * 100) / 100;

let nextId = 1;
export const newShapeId = (): number => nextId++;

export function textShape(text: string, opts: Partial<Shape> = {}): Shape {
  return {
    id: newShapeId(),
    kind: 'text',
    x: 80,
    y: 80,
    width: 600,
    height: 80,
    fontSize: 18,
    paragraphs: text.split('\n').map((t) => ({ type: 'paragraph', style: 'normal', runs: t ? [{ text: t }] : [] })),
    ...opts,
  };
}

export function titleSlide(width = DEFAULT_SIZE.width, height = DEFAULT_SIZE.height): Slide {
  return {
    shapes: [
      textShape('Click to add a title', { placeholder: 'title', x: r(width * 0.08), y: r(height * 0.3), width: r(width * 0.84), height: r(height * 0.2), fontSize: 44, anchor: 'middle', paragraphs: [{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: t('slides.title') }] }] }),
      textShape('', { placeholder: 'subtitle', x: r(width * 0.15), y: r(height * 0.55), width: r(width * 0.7), height: r(height * 0.12), fontSize: 24, paragraphs: [{ type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: t('slides.subtitle') }] }] }),
    ],
  };
}

export function contentSlide(width = DEFAULT_SIZE.width, height = DEFAULT_SIZE.height): Slide {
  return {
    shapes: [
      textShape(t('slides.slideTitle'), { placeholder: 'title', x: r(width * 0.06), y: r(height * 0.05), width: r(width * 0.88), height: r(height * 0.15), fontSize: 36, anchor: 'middle' }),
      textShape('', {
        placeholder: 'body',
        x: r(width * 0.06),
        y: r(height * 0.24),
        width: r(width * 0.88),
        height: r(height * 0.66),
        fontSize: 24,
        paragraphs: [{ type: 'paragraph', style: 'normal', list: { ordered: false, level: 0 }, runs: [{ text: t('slides.firstPoint') }] }],
      }),
    ],
  };
}

export function emptyPresentation(): Presentation {
  return { ...DEFAULT_SIZE, slides: [titleSlide()], resources: new Map(), meta: {} };
}

export function slideText(slide: Slide): string {
  return slide.shapes
    .flatMap((s) => s.paragraphs.map((p) => p.runs.map((r) => ('text' in r ? r.text : '')).join('')))
    .join('\n');
}
