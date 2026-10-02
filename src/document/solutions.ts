/**
 * Exercise sheets and answer keys from one document (TEACH-001): paragraphs
 * marked as solutions are shown in the answer key and left out of the sheet.
 */
import type { Block, RichDocument } from './model';

export const isSolution = (b: Block): boolean => b.type === 'paragraph' && !!b.solution;

/** Consecutive blocks, solutions or not. */
export function solutionSegments(blocks: Block[]): { solution: boolean; blocks: Block[] }[] {
  const out: { solution: boolean; blocks: Block[] }[] = [];
  for (const b of blocks) {
    const solution = isSolution(b);
    const last = out[out.length - 1];
    if (last && last.solution === solution) last.blocks.push(b);
    else out.push({ solution, blocks: [b] });
  }
  return out;
}

export const hasSolutions = (doc: RichDocument): boolean => doc.blocks.some(isSolution);

/** The exercise sheet: the document without its solutions. */
export function withoutSolutions(doc: RichDocument): RichDocument {
  return { ...doc, blocks: doc.blocks.filter((b) => !isSolution(b)) };
}

/** Markdown fenced div opening a solution: `::: solution` or `::: {.solution}`. */
export const SOLUTION_OPEN = /^:{3,}\s*(?:solution|\{\s*\.solution\s*\})\s*$/;
export const FENCE_CLOSE = /^:{3,}\s*$/;
