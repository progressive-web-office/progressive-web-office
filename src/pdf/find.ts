/** Text search in PDF pages (PDF-017): case and accents ignored, positions kept. */

/** Lower case without accents, one character for one (so positions match the original). */
export const fold = (s: string): string =>
  [...s].map((c) => (c.normalize('NFD').replace(/[̀-ͯ]/g, '') || c).slice(0, 1).toLowerCase()).join('');

/** Start offsets of `query` in `text` (folded, without overlaps). */
export function findAll(text: string, query: string): number[] {
  const q = fold(query.trim());
  if (!q) return [];
  const t = fold(text);
  const out: number[] = [];
  for (let at = t.indexOf(q); at >= 0; at = t.indexOf(q, at + q.length)) out.push(at);
  return out;
}

export interface PdfMatch {
  /** Page index, from 0. */
  page: number;
  /** Text item of the page. */
  item: number;
  offset: number;
}

/** Every match of the query, page by page, item by item. */
export function findInPages(pages: string[][], query: string): PdfMatch[] {
  const out: PdfMatch[] = [];
  pages.forEach((items, page) => items.forEach((text, item) => {
    for (const offset of findAll(text, query)) out.push({ page, item, offset });
  }));
  return out;
}
