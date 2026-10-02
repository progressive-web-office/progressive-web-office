/**
 * Code cells in formats that cannot run them (DOCX, ODT, LaTeX): each cell
 * becomes its source as a code block followed by its last output, text and
 * figures (CODE-007).
 */
import { isCodeCellRun, type Block, type Paragraph, type RichDocument } from './model';

export function cellsAsBlocks(doc: RichDocument): RichDocument {
  let changed = false;
  const expand = (p: Paragraph): Paragraph[] => {
    if (!p.runs.some(isCodeCellRun)) return [p];
    changed = true;
    const only = p.runs.length === 1 ? p.runs[0] : undefined;
    if (!only || !isCodeCellRun(only)) return [{ ...p, runs: p.runs.map((r) => (isCodeCellRun(r) ? { text: r.cell, code: true } : r)) }];
    // CODE-009: a hidden code is not written, only its output.
    const out: Paragraph[] = only.hidden ? [] : [{ type: 'paragraph', style: 'code', runs: only.cell ? [{ text: only.cell }] : [] }];
    const text = only.output?.text.replace(/\n+$/, '');
    if (text) out.push({ type: 'paragraph', style: 'code', runs: [{ text }] });
    const images = (only.output?.images ?? []).filter((key) => doc.resources.has(key));
    if (images.length) out.push({ type: 'paragraph', style: 'normal', runs: images.map((image) => ({ image, alt: 'Output' })) });
    return out;
  };
  const blocks = doc.blocks.flatMap((b): Block[] => {
    if (b.type === 'paragraph') return expand(b);
    if (b.type === 'table') return [{ ...b, rows: b.rows.map((row) => row.map((c) => ({ blocks: c.blocks.flatMap(expand) }))) }];
    return [b];
  });
  return changed ? { ...doc, blocks } : doc;
}
