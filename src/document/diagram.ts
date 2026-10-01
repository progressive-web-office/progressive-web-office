/**
 * Diagram export helpers for formats without native diagram support
 * (DOCX, ODT, LaTeX): each diagram becomes a picture titled with its
 * language whose description holds the source (DIAG-005, DIAG-006), or its
 * source as text when it could not be rendered (DIAG-007).
 */
import { addResource, isDiagramRun, type Block, type DiagramLang, type ImageRun, type Paragraph, type RenderedDiagram, type RichDocument, type Run } from './model';

const LANGS: readonly DiagramLang[] = ['mermaid'];

/** The diagram language a picture title designates, if any. */
export function diagramLangOf(title: string | null | undefined): DiagramLang | undefined {
  return LANGS.find((l) => l === title?.trim().toLowerCase());
}

/** A shallow copy of `doc` where every diagram is replaced by a picture or by its source. */
export function diagramsAsPictures(doc: RichDocument, rendered: Map<string, RenderedDiagram> = new Map()): RichDocument {
  const resources = new Map(doc.resources);
  let changed = false;

  const convertRun = (run: Run): Run => {
    if (!isDiagramRun(run)) return run;
    changed = true;
    const pic = rendered.get(run.diagram);
    if (!pic) return { text: run.diagram };
    const image: ImageRun = { image: addResource({ resources }, pic.png, 'image/png'), title: run.lang, alt: run.diagram };
    if (pic.width > 0) image.width = Math.round(pic.width);
    if (pic.height > 0) image.height = Math.round(pic.height);
    return image;
  };
  const convertParagraph = (p: Paragraph): Paragraph => {
    if (!p.runs.some(isDiagramRun)) return p;
    const only = p.runs.length === 1 ? p.runs[0] : undefined;
    // An unrendered diagram alone in its paragraph reads best as a code block.
    if (only && isDiagramRun(only) && !rendered.has(only.diagram)) {
      changed = true;
      const { list: _list, ...rest } = p;
      return { ...rest, style: 'code', runs: [{ text: only.diagram }] };
    }
    return { ...p, runs: p.runs.map(convertRun) };
  };
  const convert = (blocks: Block[]): Block[] =>
    blocks.map((b) => {
      if (b.type === 'paragraph') return convertParagraph(b);
      if (b.type === 'table') return { ...b, rows: b.rows.map((row) => row.map((c) => ({ blocks: c.blocks.map(convertParagraph) }))) };
      return b;
    });

  const blocks = convert(doc.blocks);
  return changed ? { ...doc, blocks, resources } : doc;
}
