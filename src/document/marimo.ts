/**
 * marimo notebooks (DOC-039): a Python file where each cell is a function
 * decorated with `@app.cell`. A cell holding only `mo.md("""…""")` becomes
 * text; the others become Python cells (`hide_code=True` hides their code).
 * Each cell keeps its source as written, so that saving gives the file back
 * where nothing changed; an edited cell gets its arguments (the names it
 * uses from other cells) and returned names computed again.
 */
import { readMarkdown } from './markdown-reader';
import { writeMarkdown } from './markdown-writer';
import { emptyDocument, isCodeCellRun, paragraph, type Block, type Paragraph, type RichDocument } from './model';

export { isMarimo } from './marimo-detect';

/** What a cell keeps of its source, to write it back. */
interface CellSource {
  /** The cell as written, decorator to `return`. */
  raw: string;
  /** Its code (or Markdown) as read, to tell whether it changed. */
  body: string;
  hidden: boolean;
  /** Not an `@app.cell` (setup block, `@app.function`…): written as it is. */
  verbatim?: boolean;
}

interface Segment {
  raw: string;
}

const dedent = (text: string): string => {
  const lines = text.split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length));
  return Number.isFinite(indent) ? lines.map((l) => l.slice(indent)).join('\n') : text;
};
const indent = (text: string, by = '    '): string => text.split('\n').map((l) => (l.trim() ? by + l : '')).join('\n');

/** The head (imports, `app = …`), the cells, and the tail (`if __name__ == "__main__":`). */
function split(text: string): { head: string; segments: Segment[]; tail: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const starts: number[] = [];
  let tailAt = lines.length;
  lines.forEach((l, i) => {
    if (/^@app\.|^with app\.setup/.test(l)) starts.push(i);
    else if (/^if __name__ == ["']__main__["']:/.test(l)) tailAt = Math.min(tailAt, i);
  });
  const ends = [...starts.slice(1), tailAt];
  const trimEnd = (s: string): string => s.replace(/\s+$/, '');
  return {
    head: trimEnd(lines.slice(0, starts[0] ?? tailAt).join('\n')),
    segments: starts.map((s, k) => ({ raw: trimEnd(lines.slice(s, ends[k]).join('\n')) })),
    tail: trimEnd(lines.slice(tailAt).join('\n')),
  };
}

const MD = /^mo\.md\(\s*(r?)("""|''')([\s\S]*?)\2\s*,?\s*\)$/;

/** A cell's code, without its decorator, `def` line and final `return`. */
function cellBody(raw: string): { body: string; hidden: boolean } | null {
  const m = /^@app\.cell(?:\((.*)\))?\s*\n(?:async )?def \w+\([^)]*\)\s*(?:->[^:]*)?:\n([\s\S]*)$/.exec(raw);
  if (!m) return null;
  const lines = dedent(m[2]!).replace(/\s+$/, '').split('\n');
  if (/^return\b/.test(lines[lines.length - 1] ?? '')) lines.pop();
  return { body: lines.join('\n').replace(/\s+$/, ''), hidden: /hide_code\s*=\s*True/.test(m[1] ?? '') };
}

export function readMarimo(text: string): RichDocument {
  const doc = emptyDocument();
  const { head, segments, tail } = split(text);
  doc.extras = { ...(doc.extras ?? {}), marimo: { head, tail } };
  const blocks: Block[] = [];
  for (const seg of segments) {
    const cell = cellBody(seg.raw);
    const md = cell && MD.exec(cell.body);
    if (cell && md) {
      const source = dedent(md[3]!).replace(/^\n+|\s+$/g, '');
      const parts = readMarkdown(source).blocks;
      const first = (parts[0]?.type === 'paragraph' ? parts : [paragraph(''), ...parts]) as Block[];
      const src: CellSource = { raw: seg.raw, body: source, hidden: cell.hidden };
      first[0] = { ...(first[0] as Paragraph), cellHeader: JSON.stringify(src), cellSource: source };
      blocks.push(...first);
    } else if (cell) {
      const src: CellSource = { raw: seg.raw, body: cell.body, hidden: cell.hidden };
      blocks.push({ type: 'paragraph', style: 'normal', runs: [{ cell: cell.body, lang: 'python', header: JSON.stringify(src), ...(cell.hidden ? { hidden: true } : {}) }] });
    } else {
      // A setup block or a top-level function: kept as written, runnable as it is.
      const src: CellSource = { raw: seg.raw, body: seg.raw, hidden: false, verbatim: true };
      blocks.push({ type: 'paragraph', style: 'normal', runs: [{ cell: seg.raw, lang: 'python', header: JSON.stringify(src) }] });
    }
  }
  doc.blocks = blocks.length ? blocks : [paragraph('')];
  return doc;
}

const parse = (header: string | undefined): CellSource | undefined => {
  try {
    const v = header ? (JSON.parse(header) as CellSource) : undefined;
    return v && typeof v.raw === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
};

const STRINGS = /("""|''')[\s\S]*?\1|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|#[^\n]*/g;

/** Names a cell defines at its top level (not those starting with `_`, private to the cell in marimo). */
export function cellDefs(code: string): string[] {
  const out = new Set<string>();
  for (const line of code.replace(STRINGS, '""').split('\n')) {
    let m: RegExpExecArray | null;
    if ((m = /^(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)/.exec(line))) out.add(m[1]!);
    else if ((m = /^import\s+(.+)$/.exec(line))) for (const part of m[1]!.split(',')) out.add(/\bas\s+(\w+)/.exec(part)?.[1] ?? part.trim().split('.')[0]!);
    else if ((m = /^from\s+\S+\s+import\s+\(?([^)]+)\)?/.exec(line))) for (const part of m[1]!.split(',')) out.add(/\bas\s+(\w+)/.exec(part)?.[1] ?? part.trim());
    else if ((m = /^(?:async\s+)?for\s+([\w\s,()]+?)\s+in\b/.exec(line))) {
      for (const n of m[1]!.split(/[\s,()]+/)) if (n) out.add(n);
    }
    else if (/^[A-Za-z_(]/.test(line) && /[^=!<>]=(?!=)/.test(line)) {
      // Every target of `a = b = …` and `a, b = …`, augmented assignments too.
      const parts = line.split(/(?<![=!<>])(?:[+\-*/%@&|^]|\/\/|\*\*|>>|<<)?=(?!=)/);
      for (const target of parts.slice(0, -1)) if (/^[\w\s,()]+$/.test(target)) for (const n of target.split(/[\s,()]+/)) if (/^[A-Za-z_]\w*$/.test(n)) out.add(n);
    }
  }
  return [...out].filter((n) => n && !n.startsWith('_')).sort();
}

const usedNames = (code: string): Set<string> => new Set(code.replace(STRINGS, '""').match(/\b[A-Za-z_]\w*\b/g) ?? []);

function writeCell(code: string, hidden: boolean, args: string[], returns: string[]): string {
  const ret = returns.length ? `return (${returns.join(', ')}${returns.length === 1 ? ',' : ''})` : 'return';
  return `@app.cell${hidden ? '(hide_code=True)' : ''}\ndef _(${args.join(', ')}):\n${code.trim() ? `${indent(code)}\n` : ''}    ${ret}`;
}

export function writeMarimo(doc: RichDocument): string {
  const extras = (doc.extras?.marimo ?? {}) as { head?: string; tail?: string };
  const head = extras.head ?? 'import marimo\n\napp = marimo.App()';
  const tail = extras.tail ?? 'if __name__ == "__main__":\n    app.run()';
  // The cells: Python cells, and text cells (Markdown between Python cells).
  type Item = { kind: 'code'; code: string; hidden: boolean; src?: CellSource } | { kind: 'md'; blocks: Block[]; src?: CellSource };
  const items: Item[] = [];
  for (const b of doc.blocks) {
    const run = b.type === 'paragraph' && b.runs.length === 1 && isCodeCellRun(b.runs[0]!) && b.runs[0].lang === 'python' ? b.runs[0] : undefined;
    if (run) {
      items.push({ kind: 'code', code: run.cell, hidden: !!run.hidden, ...(parse(run.header) ? { src: parse(run.header)! } : {}) });
      continue;
    }
    const last = items[items.length - 1];
    const src = b.type === 'paragraph' ? parse(b.cellHeader) : undefined;
    const clean: Block = b.type === 'paragraph' && b.cellHeader !== undefined ? (({ cellHeader: _h, cellSource: _s, ...rest }) => rest)(b) : b;
    if (last?.kind === 'md' && !src) last.blocks.push(clean);
    else items.push({ kind: 'md', blocks: [clean], ...(src ? { src } : {}) });
  }
  const mdText = (blocks: Block[]): string => writeMarkdown({ ...emptyDocument(), blocks }, { frontMatter: false }).trim();
  const codes = items.map((it) => (it.kind === 'code' ? it.code : ''));
  const defs = codes.map(cellDefs);
  const cells = items.flatMap((it, i): string[] => {
    if (it.kind === 'md') {
      const text = mdText(it.blocks);
      if (!text && !it.src) return [];
      // An unchanged text cell keeps its source as written.
      if (it.src && mdText(readMarkdown(it.src.body).blocks) === text) return [it.src.raw];
      return [`@app.cell(hide_code=True)\ndef _(mo):\n    mo.md(r"""\n${indent(text)}\n    """)\n    return`];
    }
    if (it.src && it.src.body === it.code && it.src.hidden === it.hidden) return [it.src.raw];
    if (it.src?.verbatim) return [it.code];
    const used = usedNames(it.code);
    const mine = new Set(defs[i]);
    const args = [...new Set(defs.flatMap((d, j) => (j === i ? [] : d)))].filter((n) => used.has(n) && !mine.has(n)).sort();
    return [writeCell(it.code, it.hidden, args, defs[i]!)];
  });
  // Text cells use `mo`: a notebook that has none gets the cell defining it.
  if (items.some((it) => it.kind === 'md' && !it.src) && !defs.some((d) => d.includes('mo'))) cells.unshift(writeCell('import marimo as mo', false, [], ['mo']));
  return `${[head, ...cells, tail].join('\n\n\n')}\n`;
}
