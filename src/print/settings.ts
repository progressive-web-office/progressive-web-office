/** Page settings for printing (PRINT-002). */

export type Paper = 'A4' | 'Letter' | 'A3' | 'A5';

/** Paper sizes in millimetres (portrait). */
export const PAPER_SIZES: Record<Paper, [number, number]> = {
  A4: [210, 297],
  Letter: [215.9, 279.4],
  A3: [297, 420],
  A5: [148, 210],
};

export interface PrintSettings {
  paper: Paper;
  orientation: 'portrait' | 'landscape';
  /** Margin in millimetres (all sides). */
  margin: number;
  gridlines: boolean;
  headings: boolean;
  allSheets: boolean;
  slidesPerPage: 1 | 2 | 4 | 6;
  notes: boolean;
}

const KEY = 'pwo.print';

export function defaultPrintSettings(): PrintSettings {
  const letter = typeof navigator !== 'undefined' && /^en-(US|CA)$|^es-(MX|US)$/.test(navigator.language);
  return { paper: letter ? 'Letter' : 'A4', orientation: 'portrait', margin: 15, gridlines: true, headings: false, allSheets: false, slidesPerPage: 1, notes: false };
}

export function loadPrintSettings(): PrintSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultPrintSettings(), ...(JSON.parse(raw) as Partial<PrintSettings>) };
  } catch {
    /* ignore */
  }
  return defaultPrintSettings();
}

export function savePrintSettings(s: PrintSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Page size in millimetres, taking the orientation into account. */
export function pageSize(s: PrintSettings): [number, number] {
  const [w, h] = PAPER_SIZES[s.paper];
  return s.orientation === 'landscape' ? [h, w] : [w, h];
}

export const mmToPx = (mm: number): number => (mm * 96) / 25.4;

/** Printable width in CSS pixels. */
export function contentWidthPx(s: PrintSettings): number {
  return mmToPx(pageSize(s)[0] - 2 * s.margin);
}

export function contentHeightPx(s: PrintSettings): number {
  return mmToPx(pageSize(s)[1] - 2 * s.margin);
}

export function pageCss(s: PrintSettings): string {
  const [w, h] = pageSize(s);
  return `@page { size: ${w}mm ${h}mm; margin: ${s.margin}mm; }`;
}
