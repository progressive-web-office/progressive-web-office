/**
 * UI-023: the paper of documents on screen — as the theme of the
 * application, light, or dark (light text on dark paper, for reading at
 * night). Only the display changes: printing, the PDF and the files keep
 * the document's own colours.
 */

export type PaperPreference = 'auto' | 'light' | 'dark';
export const PAPERS: PaperPreference[] = ['auto', 'light', 'dark'];

const KEY = 'pwo.paper';
export const PAPER_EVENT = 'pwo-paper';

export function loadPaper(): PaperPreference {
  try {
    const value = localStorage.getItem(KEY);
    return PAPERS.includes(value as PaperPreference) ? (value as PaperPreference) : 'auto';
  } catch {
    return 'auto';
  }
}

/** `data-paper` on the root; the CSS darkens the paper for `dark`, and for `auto` with a dark theme. */
export function applyPaper(paper: PaperPreference, root: HTMLElement = document.documentElement): void {
  root.dataset.paper = paper;
}

export function savePaper(paper: PaperPreference): void {
  try {
    localStorage.setItem(KEY, paper);
  } catch {
    /* storage unavailable: the choice lasts for this session */
  }
  applyPaper(paper);
  if (typeof dispatchEvent === 'function') dispatchEvent(new CustomEvent(PAPER_EVENT, { detail: paper }));
}
