/** Read/write a rich document in any supported text format. */
import type { DocumentFormat } from '../core/format';
import { readDocx } from './docx-reader';
import { writeDocx } from './docx-writer';
import { readLatexZip, writeLatexZip } from './latex-project';
import { readLatex } from './latex-reader';
import { writeLatex } from './latex-writer';
import { readMarkdown } from './markdown-reader';
import { writeMarkdown } from './markdown-writer';
import { readMdz, type MdzReadOptions } from './mdz-reader';
import { writeMdz } from './mdz-writer';
import { collectMath, type RichDocument, type WriteOptions } from './model';
import { readOdt } from './odt-reader';
import { writeOdt } from './odt-writer';

export type TextFormat = Extract<DocumentFormat, 'docx' | 'odt' | 'md' | 'mdz' | 'tex' | 'texzip'>;

export async function readDocument(format: TextFormat, bytes: Uint8Array, opts: MdzReadOptions = {}): Promise<RichDocument> {
  switch (format) {
    case 'docx':
      return readDocx(bytes);
    case 'odt':
      return readOdt(bytes);
    case 'md':
      return readMarkdown(new TextDecoder().decode(bytes));
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
    case 'tex':
      return new TextEncoder().encode(writeLatex(doc).tex);
    case 'texzip':
      return writeLatexZip(doc);
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
  return writeDocument(doc, format, { mathml });
}
