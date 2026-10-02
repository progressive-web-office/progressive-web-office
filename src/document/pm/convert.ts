/** Lossless conversions between the document model and ProseMirror (DOC-018). */
import type { Mark, Node as PmNode } from 'prosemirror-model';
import { LAYOUT_KEYS, describeRuns, normalizeRuns, seqLabel, type Block, type CiteRun, type CrossTarget, type Paragraph, type Run, type SeqKind, type Table, type TableCell, type TextFormat } from '../model';
import { schema } from './schema';

function marksFor(f: TextFormat): Mark[] {
  const marks: Mark[] = [];
  if (f.link) marks.push(schema.marks.link!.create({ href: f.link }));
  if (f.bold) marks.push(schema.marks.bold!.create());
  if (f.italic) marks.push(schema.marks.italic!.create());
  if (f.underline) marks.push(schema.marks.underline!.create());
  if (f.strike) marks.push(schema.marks.strike!.create());
  if (f.code) marks.push(schema.marks.code!.create());
  if (f.size) marks.push(schema.marks.size!.create({ pt: f.size }));
  if (f.color) marks.push(schema.marks.color!.create({ hex: f.color }));
  if (f.font) marks.push(schema.marks.font!.create({ family: f.font }));
  if (f.highlight) marks.push(schema.marks.highlight!.create({ hex: f.highlight }));
  return marks;
}

function formatOf(marks: readonly Mark[]): TextFormat {
  const f: TextFormat = {};
  for (const m of marks) {
    switch (m.type.name) {
      case 'link':
        f.link = m.attrs.href as string;
        break;
      case 'size':
        f.size = m.attrs.pt as number;
        break;
      case 'color':
        f.color = m.attrs.hex as string;
        break;
      case 'font':
        f.font = m.attrs.family as string;
        break;
      case 'highlight':
        f.highlight = m.attrs.hex as string;
        break;
      default:
        (f as Record<string, unknown>)[m.type.name] = true;
    }
  }
  return f;
}

function runsToInline(runs: Run[]): PmNode[] {
  const out: PmNode[] = [];
  for (const run of runs) {
    if ('text' in run) {
      const marks = marksFor(run);
      run.text.split('\n').forEach((part, i) => {
        if (i > 0) out.push(schema.nodes.hard_break!.create(null, null, marks));
        if (part) out.push(schema.text(part, marks));
      });
    } else if ('image' in run) {
      out.push(schema.nodes.image!.create({ image: run.image, src: run.src ?? null, alt: run.alt ?? null, title: run.title ?? null, width: run.width ?? null, height: run.height ?? null }));
    } else if ('math' in run) {
      out.push(schema.nodes.math!.create({ math: run.math, display: !!run.display }));
    } else if ('diagram' in run) {
      out.push(schema.nodes.diagram!.create({ diagram: run.diagram, lang: run.lang }));
    } else if ('footnote' in run) {
      out.push(schema.nodes.footnote!.create({ runs: run.footnote }));
    } else if ('seq' in run) {
      out.push(schema.nodes.seq!.create({ kind: run.seq }));
    } else if ('ref' in run) {
      out.push(schema.nodes.xref!.create({ ref: run.ref }));
    } else if ('cite' in run) {
      out.push(schema.nodes.cite!.create({ keys: run.cite, locator: run.locator ?? null }));
    } else {
      out.push(schema.nodes.code_cell!.create({ cell: run.cell, lang: run.lang, output: run.output ?? null }));
    }
  }
  return out;
}

export function paragraphToPm(p: Paragraph): PmNode {
  const layout = Object.fromEntries(LAYOUT_KEYS.map((k) => [k, p[k] ?? null]));
  return schema.nodes.paragraph!.create(
    { style: p.style, align: p.align ?? null, listOrdered: p.list ? p.list.ordered : null, listLevel: p.list?.level ?? 0, anchor: p.id ?? null, ...layout },
    runsToInline(p.runs),
  );
}

function tableToPm(t: Table): PmNode {
  const rows = t.rows.map((row, r) =>
    schema.nodes.table_row!.create(
      null,
      row.map((cell) =>
        (r === 0 && t.header ? schema.nodes.table_header! : schema.nodes.table_cell!).create(
          { colspan: Math.max(1, cell.colSpan ?? 1), rowspan: Math.max(1, cell.rowSpan ?? 1) },
          (cell.blocks.length ? cell.blocks : [{ type: 'paragraph', style: 'normal', runs: [] } as Paragraph]).map(paragraphToPm),
        ),
      ),
    ),
  );
  return schema.nodes.table!.create(null, rows);
}

export function blockToPm(b: Block): PmNode {
  if (b.type === 'paragraph') return paragraphToPm(b);
  if (b.type === 'table') return tableToPm(b);
  if (b.type === 'toc') return schema.nodes.toc!.create({ levels: b.levels ?? 3 });
  if (b.type === 'bibliography') return schema.nodes.bibliography!.create();
  if (b.type === 'include') return schema.nodes.include!.create({ src: b.src });
  return schema.nodes.horizontal_rule!.create({ page: !!b.page });
}

/** The ProseMirror document for model blocks. */
export function blocksToPm(blocks: Block[]): PmNode {
  const content = blocks.map(blockToPm);
  return schema.nodes.doc!.create(null, content.length ? content : [schema.nodes.paragraph!.create()]);
}

function inlineToRuns(node: PmNode): Run[] {
  const runs: Run[] = [];
  node.forEach((child) => {
    const a = child.attrs;
    switch (child.type.name) {
      case 'text':
        runs.push({ text: child.text ?? '', ...formatOf(child.marks) });
        break;
      case 'hard_break':
        runs.push({ text: '\n', ...formatOf(child.marks) });
        break;
      case 'image':
        runs.push({
          image: a.image as string,
          ...(a.src ? { src: a.src as string } : {}),
          ...(a.alt !== null ? { alt: a.alt as string } : {}),
          ...(a.title ? { title: a.title as string } : {}),
          ...(a.width ? { width: a.width as number } : {}),
          ...(a.height ? { height: a.height as number } : {}),
        });
        break;
      case 'math':
        runs.push({ math: a.math as string, ...(a.display ? { display: true } : {}) });
        break;
      case 'diagram':
        runs.push({ diagram: a.diagram as string, lang: a.lang as 'mermaid' });
        break;
      case 'footnote':
        runs.push({ footnote: a.runs as Run[] });
        break;
      case 'seq':
        runs.push({ seq: a.kind as SeqKind });
        break;
      case 'xref':
        runs.push({ ref: a.ref as string });
        break;
      case 'cite':
        runs.push(a.locator ? { cite: [...(a.keys as string[])], locator: a.locator as string } : { cite: [...(a.keys as string[])] });
        break;
      case 'code_cell':
        runs.push({ cell: a.cell as string, lang: a.lang as 'python', ...(a.output ? { output: a.output as NonNullable<Extract<Run, { cell: string }>['output']> } : {}) });
        break;
    }
  });
  return normalizeRuns(runs);
}

export function pmToParagraph(node: PmNode): Paragraph {
  const a = node.attrs as { style: Paragraph['style']; align: Paragraph['align'] | null; listOrdered: boolean | null; listLevel: number };
  return {
    type: 'paragraph',
    style: a.style,
    ...(node.attrs.anchor ? { id: node.attrs.anchor as string } : {}),
    ...(a.align ? { align: a.align } : {}),
    ...(a.listOrdered !== null ? { list: { ordered: a.listOrdered, level: a.listLevel } } : {}),
    ...Object.fromEntries(LAYOUT_KEYS.filter((k) => node.attrs[k] !== null).map((k) => [k, node.attrs[k] as number])),
    runs: inlineToRuns(node),
  };
}

function pmToBlock(node: PmNode): Block {
  if (node.type.name === 'table') {
    const rows: Table['rows'] = [];
    node.forEach((row) => {
      const cells: Table['rows'][number] = [];
      row.forEach((cell) => {
        const blocks: Paragraph[] = [];
        cell.forEach((p) => blocks.push(pmToParagraph(p)));
        const out: TableCell = { blocks };
        if ((cell.attrs.colspan as number) > 1) out.colSpan = cell.attrs.colspan as number;
        if ((cell.attrs.rowspan as number) > 1) out.rowSpan = cell.attrs.rowspan as number;
        cells.push(out);
      });
      rows.push(cells);
    });
    // The header row: every cell of the first row is a header cell.
    const first = node.firstChild;
    const header = !!first && first.childCount > 0 && Array.from({ length: first.childCount }, (_, i) => first.child(i)).every((c) => c.type.name === 'table_header');
    return header ? { type: 'table', rows, header } : { type: 'table', rows };
  }
  if (node.type.name === 'bibliography') return { type: 'bibliography' };
  if (node.type.name === 'include') return { type: 'include', src: node.attrs.src as string };
  if (node.type.name === 'toc') return node.attrs.levels === 3 ? { type: 'toc' } : { type: 'toc', levels: node.attrs.levels as number };
  if (node.type.name === 'horizontal_rule') return node.attrs.page ? { type: 'rule', page: true } : { type: 'rule' };
  return pmToParagraph(node);
}

/** Model blocks for a ProseMirror document (or slice content). */
export function pmToBlocks(doc: PmNode): Block[] {
  const blocks: Block[] = [];
  doc.forEach((node) => blocks.push(pmToBlock(node)));
  return blocks;
}

/** Numbers by position of the seq nodes, and cross-reference targets, of an editor document (DOC-026). */
export interface PmCrossRefs {
  numbers: Map<number, number>;
  targets: Map<string, CrossTarget>;
}

export function pmCrossTargets(doc: PmNode): PmCrossRefs {
  const counters: Record<SeqKind, number> = { figure: 0, table: 0, equation: 0 };
  const numbers = new Map<number, number>();
  const targets = new Map<string, CrossTarget>();
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    let first: { kind: SeqKind; n: number } | undefined;
    node.forEach((child, offset) => {
      if (child.type.name !== 'seq') return;
      const kind = child.attrs.kind as SeqKind;
      const n = ++counters[kind];
      numbers.set(pos + 1 + offset, n);
      first ??= { kind, n };
    });
    const id = node.attrs.anchor as string | null;
    if (id && !targets.has(id)) {
      const runs = inlineToRuns(node);
      const text = describeRuns(runs, first?.n ?? 0);
      if (first) {
        const math = runs.flatMap((r) => ('math' in r ? [r.math] : [])).join(' ');
        targets.set(id, { id, kind: first.kind, number: first.n, label: seqLabel(runs, first.kind, first.n), description: first.kind === 'equation' ? `(${first.n}) ${math}`.trim() : text });
      } else if (/^h[1-6]$/.test(node.attrs.style as string)) {
        targets.set(id, { id, kind: 'heading', label: text, description: text });
      }
    }
    return false;
  });
  return { numbers, targets };
}

/** Citations of an editor document in reading order, footnotes included (DOC-027). */
export function pmCiteRuns(doc: PmNode): CiteRun[] {
  const out: CiteRun[] = [];
  const fromRuns = (runs: Run[]): void => {
    for (const r of runs) {
      if ('cite' in r) out.push(r);
      else if ('footnote' in r) fromRuns(r.footnote);
    }
  };
  doc.descendants((node) => {
    if (node.type.name === 'cite') out.push({ cite: node.attrs.keys as string[], ...(node.attrs.locator ? { locator: node.attrs.locator as string } : {}) });
    else if (node.type.name === 'footnote') fromRuns(node.attrs.runs as Run[]);
    return true;
  });
  return out;
}
