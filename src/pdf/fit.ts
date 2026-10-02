/** Zoom of the PDF viewer (PDF-016): a percentage, the width or the whole page, with n pages per row. */

export type PdfZoom = number | 'width' | 'page';

export const PAGES_PER_ROW = [1, 2, 3, 4, 6] as const;

export interface FitArea {
  /** Size of the scrolling area, in CSS pixels. */
  width: number;
  height: number;
  /** Size of the first page at 100 %. */
  pageWidth: number;
  pageHeight: number;
  /** Pages side by side. */
  columns: number;
  /** Space between pages and around them. */
  gap: number;
}

/** The scale showing `columns` pages across the width, or whole (width and height). */
export function fitScale(zoom: PdfZoom, a: FitArea): number {
  if (typeof zoom === 'number') return zoom;
  const across = (Math.max(100, a.width) - a.gap * (a.columns + 1)) / (a.columns * a.pageWidth);
  const scale = zoom === 'page' ? Math.min(across, (Math.max(100, a.height) - a.gap * 2) / a.pageHeight) : across;
  return Math.max(0.1, Math.min(4, scale));
}
