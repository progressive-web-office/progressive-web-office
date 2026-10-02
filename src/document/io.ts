/** Read/write a rich document in any supported text format. */
import { acceptAll } from './changes';
import type { DocumentFormat } from '../core/format';
import { readDocx } from './docx-reader';
import { writeDocx } from './docx-writer';
import { readLatexZip, writeLatexZip } from './latex-project';
import { readLatex } from './latex-reader';
import { writeLatex } from './latex-writer';
import { readMarkdown } from './markdown-reader';
import { writeMarkdown } from './markdown-writer';
import { readMdz, type MdzReadOptions } from './mdz-reader';
import type { MarkdownReadOptions } from './markdown-reader';
import { writeMdz } from './mdz-writer';
import { collectDiagrams, collectMath, type RenderedDiagram, type RichDocument, type WriteOptions } from './model';
import { readOdt } from './odt-reader';
import { writeOdt } from './odt-writer';

export type TextFormat = Extract<DocumentFormat, 'docx' | 'odt' | 'md' | 'mdz' | 'tex' | 'texzip'>;

export async function readDocument(format: TextFormat, bytes: Uint8Array, opts: MdzReadOptions & MarkdownReadOptions = {}): Promise<RichDocument> {
  switch (format) {
    case 'docx':
      return readDocx(bytes);
    case 'odt':
      return readOdt(bytes);
    case 'md':
      return readMarkdown(new TextDecoder().decode(bytes), opts);
    case 'mdz':
      return readMdz(bytes, opts);
    case 'tex':
      return readLatex(new TextDecoder().decode(bytes));
    case 'texzip':
      return readLatexZip(bytes);
  }
}

export function writeDocument(doc: RichDocument, format: TextFormat, opts: WriteOptions = {}): Uint8Array {
  switch (format) {
    case 'docx':
      return writeDocx(doc, opts);
    case 'odt':
      return writeOdt(doc, opts);
    case 'md':
      return new TextEncoder().encode(writeMarkdown(doc));
    case 'mdz':
      return writeMdz(doc);
    // REV-005: LaTeX has no tracked changes: they are accepted.
    case 'tex':
      return new TextEncoder().encode(writeLatex(acceptAll(doc)).tex);
    case 'texzip':
      return writeLatexZip(acceptAll(doc), opts);
  }
}

/** Like `writeDocument`, converting equations to MathML first (loads MathLive only when needed). */
export async function writeDocumentAsync(doc: RichDocument, format: TextFormat): Promise<Uint8Array> {
  const sources = format === 'docx' || format === 'odt' ? collectMath(doc.blocks) : [];
  const mathml = new Map<string, string>();
  if (sources.length) {
    const { latexToMathml } = await import('../math/mathlive');
    for (const latex of sources) {
      try {
        mathml.set(latex, await latexToMathml(latex));
      } catch {
        /* invalid LaTeX: written as text */
      }
    }
  }
  return writeDocument(doc, format, { mathml, diagrams: await renderDiagrams(doc, format) });
}

/** Rasterise diagrams for formats that embed them as pictures (DIAG-005, DIAG-006). */
async function renderDiagrams(doc: RichDocument, format: TextFormat): Promise<Map<string, RenderedDiagram>> {
  const out = new Map<string, RenderedDiagram>();
  const sources = format === 'docx' || format === 'odt' || format === 'texzip' ? collectDiagrams(doc.blocks) : [];
  if (!sources.length) return out;
  try {
    const { renderDiagramPng } = await import('../diagram/mermaid');
    for (const source of sources) {
      try {
        out.set(source, await renderDiagramPng(source));
      } catch {
        /* invalid diagram: written as text (DIAG-007) */
      }
    }
  } catch {
    /* engine unavailable: diagrams written as text (DIAG-007) */
  }
  return out;
}
