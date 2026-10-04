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

/** PRES-016: the layouts a new slide can have. */
export type SlideLayout = 'title' | 'content' | 'section' | 'twoContent' | 'comparison' | 'titleOnly' | 'blank';
export const SLIDE_LAYOUTS: SlideLayout[] = ['title', 'content', 'section', 'twoContent', 'comparison', 'titleOnly', 'blank'];

/** A new slide with a layout: its placeholders, sized for the slide. */
export function layoutSlide(layout: SlideLayout, width = DEFAULT_SIZE.width, height = DEFAULT_SIZE.height): Slide {
  const title = (): Shape => textShape(t('slides.slideTitle'), { placeholder: 'title', x: r(width * 0.06), y: r(height * 0.05), width: r(width * 0.88), height: r(height * 0.15), fontSize: 36, anchor: 'middle' });
  const body = (x: number, y: number, w: number, h: number, fontSize = 24): Shape =>
    textShape('', { placeholder: 'body', x: r(x), y: r(y), width: r(w), height: r(h), fontSize, paragraphs: [{ type: 'paragraph', style: 'normal', list: { ordered: false, level: 0 }, runs: [{ text: t('slides.firstPoint') }] }] });
  const heading = (x: number, y: number, w: number): Shape => textShape(t('slides.columnHeading'), { placeholder: 'body', x: r(x), y: r(y), width: r(w), height: r(height * 0.09), fontSize: 26, anchor: 'middle', paragraphs: [{ type: 'paragraph', style: 'normal', runs: [{ text: t('slides.columnHeading'), bold: true }] }] });
  const half = width * 0.43;
  switch (layout) {
    case 'title':
      return titleSlide(width, height);
    case 'content':
      return contentSlide(width, height);
    case 'section':
      return {
        shapes: [
          textShape(t('slides.sectionTitle'), { placeholder: 'title', x: r(width * 0.08), y: r(height * 0.4), width: r(width * 0.84), height: r(height * 0.2), fontSize: 44, anchor: 'bottom' }),
          textShape(t('slides.sectionText'), { placeholder: 'body', x: r(width * 0.08), y: r(height * 0.62), width: r(width * 0.84), height: r(height * 0.12), fontSize: 22 }),
        ],
      };
    case 'twoContent':
      return { shapes: [title(), body(width * 0.06, height * 0.24, half, height * 0.66), body(width * 0.51, height * 0.24, half, height * 0.66)] };
    case 'comparison':
      return {
        shapes: [title(), heading(width * 0.06, height * 0.23, half), heading(width * 0.51, height * 0.23, half), body(width * 0.06, height * 0.34, half, height * 0.56, 22), body(width * 0.51, height * 0.34, half, height * 0.56, 22)],
      };
    case 'titleOnly':
      return { shapes: [title()] };
    case 'blank':
      return { shapes: [] };
  }
}

export function emptyPresentation(): Presentation {
  return { ...DEFAULT_SIZE, slides: [titleSlide()], resources: new Map(), meta: {} };
}

export function slideText(slide: Slide): string {
  return slide.shapes
    .flatMap((s) => s.paragraphs.map((p) => p.runs.map((r) => ('text' in r ? r.text : '')).join('')))
    .join('\n');
}

/** Slide sizes in CSS pixels, landscape (PRES-013); A4 and Letter are paper sizes, for printed slides. */
export const SLIDE_SIZES = [
  { id: '16:9', width: 1280, height: 720 },
  { id: '4:3', width: 960, height: 720 },
  { id: 'A4', width: 1123, height: 794 },
  { id: 'Letter', width: 1056, height: 816 },
] as const;
export type SlideSizeId = (typeof SLIDE_SIZES)[number]['id'];
export type Orientation = 'portrait' | 'landscape';

export const slideOrientation = (size: { width: number; height: number }): Orientation => (size.height > size.width ? 'portrait' : 'landscape');

export function slideSizeFor(id: SlideSizeId, orientation: Orientation): { width: number; height: number } {
  const s = SLIDE_SIZES.find((x) => x.id === id)!;
  return orientation === 'portrait' ? { width: s.height, height: s.width } : { width: s.width, height: s.height };
}

/** The named size of a presentation, whatever its orientation; undefined for another size. */
export function slideSizeId(size: { width: number; height: number }): SlideSizeId | undefined {
  const [long, short] = [Math.max(size.width, size.height), Math.min(size.width, size.height)];
  return SLIDE_SIZES.find((s) => Math.abs(s.width - long) < 2 && Math.abs(s.height - short) < 2)?.id;
}

/**
 * Give the slides a new size (PRES-013): positions and sizes follow each
 * axis, text sizes the smaller factor, so that what fitted still fits.
 */
export function resizePresentation(pres: Presentation, width: number, height: number): void {
  const sx = width / pres.width;
  const sy = height / pres.height;
  const sf = Math.min(sx, sy);
  for (const slide of pres.slides) {
    for (const s of slide.shapes) {
      s.x = r(s.x * sx);
      s.y = r(s.y * sy);
      s.width = r(s.width * sx);
      s.height = r(s.height * sy);
      s.fontSize = Math.max(1, Math.round(s.fontSize * sf));
      for (const p of s.paragraphs) for (const run of p.runs) if ('size' in run && run.size) run.size = Math.max(1, Math.round(run.size * sf));
    }
  }
  pres.width = width;
  pres.height = height;
}
