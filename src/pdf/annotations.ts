/**
 * PDF annotations (PDF-018): highlights of text and sticky notes, written as
 * standard annotations (`/Highlight`, `/Text`) with an appearance, so that
 * every PDF reader shows them with their author and comment.
 */
import { PDFDocument, PDFHexString, PDFString } from '@pdfme/pdf-lib';

export interface PdfNote {
  kind: 'highlight' | 'note';
  /** Page index, from 0. */
  page: number;
  /** Highlighted boxes [x1, y1, x2, y2] in PDF points (origin bottom-left); a note's position is its first box. */
  boxes: [number, number, number, number][];
  /** The comment (may be empty for a highlight). */
  text: string;
  author?: string;
  /** ISO 8601 date. */
  date?: string;
}

const HIGHLIGHT: [number, number, number] = [1, 0.85, 0];
const NOTE_SIZE = 20;

/** `D:YYYYMMDDHHmmSSZ`, the PDF date format. */
export function pdfDate(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

const num = (n: number): string => String(Math.round(n * 100) / 100);

/** The bounding box of boxes. */
export function bounds(boxes: [number, number, number, number][]): [number, number, number, number] {
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
}

/** Add the annotations to the pages of the document. */
export function writeAnnotations(doc: PDFDocument, notes: PdfNote[]): void {
  const ctx = doc.context;
  const pages = doc.getPages();
  for (const note of notes) {
    const page = pages[note.page];
    if (!page || !note.boxes.length) continue;
    const common = {
      Type: 'Annot',
      F: 4, // printed
      Contents: PDFHexString.fromText(note.text),
      T: PDFHexString.fromText(note.author ?? ''),
      M: PDFString.of(pdfDate(note.date)),
      CreationDate: PDFString.of(pdfDate(note.date)),
      NM: PDFString.of(`pwo-${note.page}-${Math.round(note.boxes[0]![0])}-${Math.round(note.boxes[0]![1])}-${Date.now().toString(36)}`),
    };
    let dict;
    if (note.kind === 'highlight') {
      const rect = bounds(note.boxes);
      // Quadrilaterals: top-left, top-right, bottom-left, bottom-right (the order readers expect).
      const quads = note.boxes.flatMap(([x1, y1, x2, y2]) => [x1, y2, x2, y2, x1, y1, x2, y1]);
      const ops = note.boxes.map(([x1, y1, x2, y2]) => `${num(x1 - rect[0])} ${num(y1 - rect[1])} ${num(x2 - x1)} ${num(y2 - y1)} re f`).join('\n');
      const appearance = ctx.register(
        ctx.stream(`/GS0 gs ${HIGHLIGHT.join(' ')} rg\n${ops}`, {
          Type: 'XObject',
          Subtype: 'Form',
          BBox: [0, 0, rect[2] - rect[0], rect[3] - rect[1]],
          Matrix: [1, 0, 0, 1, rect[0], rect[1]],
          Resources: { ExtGState: { GS0: { Type: 'ExtGState', BM: 'Multiply', ca: 0.5, CA: 0.5 } } },
        }),
      );
      dict = ctx.obj({ ...common, Subtype: 'Highlight', Rect: rect, QuadPoints: quads, C: HIGHLIGHT, CA: 0.5, AP: { N: appearance } });
    } else {
      const [x, y] = note.boxes[0]!;
      const rect = [x, y, x + NOTE_SIZE, y + NOTE_SIZE];
      // A yellow sheet with a folded corner and lines.
      const s = NOTE_SIZE;
      const appearance = ctx.register(
        ctx.stream(`1 0.86 0.2 rg 0.45 0.35 0 RG 1 w\n0.5 0.5 m ${s - 6} 0.5 l ${s - 0.5} 6 l ${s - 0.5} ${s - 0.5} l 0.5 ${s - 0.5} l h B\n4 ${s - 6} m ${s - 4} ${s - 6} l 4 ${s - 10} m ${s - 4} ${s - 10} l 4 ${s - 14} m ${s - 8} ${s - 14} l S`, {
          Type: 'XObject',
          Subtype: 'Form',
          BBox: [0, 0, s, s],
          Matrix: [1, 0, 0, 1, x, y],
        }),
      );
      dict = ctx.obj({ ...common, Subtype: 'Text', Rect: rect, C: [1, 0.86, 0.2], Name: 'Comment', Open: false, AP: { N: appearance } });
    }
    page.node.addAnnot(ctx.register(dict));
  }
}
