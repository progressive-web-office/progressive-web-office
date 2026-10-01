/**
 * Document tools for AI agents (AI-001, AI-005): used by the built-in
 * assistant and exposed to external agents through WebMCP (AI-006).
 * Inputs come from a model, so they are validated before use.
 */
import { parseRange } from '../sheet/chart';
import type { Chart, ChartType } from '../sheet/model';
import { readMarkdown } from '../document/markdown-reader';
import { writeMarkdown } from '../document/markdown-writer';
import { isTextRun, normalizeRuns, type Block, type Paragraph, type RichDocument } from '../document/model';
import { colName, parseRef, refName } from '../sheet/address';
import type { Calculator } from '../sheet/engine';
import { cellInput, isError, newSheet, setInput, usedSize, type Workbook } from '../sheet/model';
import { contentSlide, textShape, type Presentation, type Shape } from '../slides/model';

export interface JsonSchema {
  type: 'object' | 'string' | 'integer' | 'number' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  items?: JsonSchema;
  enum?: readonly string[];
}

export interface AgentTool {
  name: string;
  description: string;
  input_schema: JsonSchema;
  /** True when the tool modifies the document. */
  mutates: boolean;
  run(input: Record<string, unknown>): string | Promise<string>;
}

/** Minimal JSON Schema check for the subset used by the tools. Returns the first problem or null. */
export function validateInput(schema: JsonSchema, value: unknown, path = 'input'): string | null {
  const label = path;
  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return `${label} must be an object`;
      const obj = value as Record<string, unknown>;
      const prefix = path === 'input' ? '' : `${path}.`;
      for (const key of schema.required ?? []) if (obj[key] === undefined) return `${prefix}${key} is required`;
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        if (obj[key] === undefined) continue;
        const problem = validateInput(sub, obj[key], `${prefix}${key}`);
        if (problem) return problem;
      }
      return null;
    }
    case 'array':
      if (!Array.isArray(value)) return `${label} must be an array`;
      for (let i = 0; i < value.length; i++) {
        const problem = schema.items ? validateInput(schema.items, value[i], `${path}[${i}]`) : null;
        if (problem) return problem;
      }
      return null;
    case 'string':
      if (typeof value !== 'string') return `${label} must be a string`;
      if (schema.enum && !schema.enum.includes(value)) return `${label} must be one of ${schema.enum.join(', ')}`;
      return null;
    case 'integer':
      return Number.isInteger(value) ? null : `${label} must be an integer`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `${label} must be a number`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `${label} must be a boolean`;
  }
}

// --- text documents ---------------------------------------------------------------

export interface DocumentHost {
  doc: RichDocument;
  getBlocks(): Block[];
  setBlocks(blocks: Block[]): void;
}

const RESOURCE = 'resource:';

export function documentTools(host: DocumentHost): AgentTool[] {
  const toMarkdown = (blocks: Block[]): string => writeMarkdown({ ...host.doc, blocks }, { imageUrl: (key) => `${RESOURCE}${key}`, frontMatter: false }).trimEnd();
  const fromMarkdown = (md: string): Block[] =>
    md.trim()
      ? readMarkdown(md, {
          resolveImage: (src) => {
            const res = src.startsWith(RESOURCE) ? host.doc.resources.get(src.slice(RESOURCE.length)) : undefined;
            return res ? { data: res.data, mediaType: res.mediaType } : undefined;
          },
        }).blocks
      : [];
  return [
    {
      name: 'read_document',
      description:
        'Read the open text document. Returns each block (paragraph, heading, list item, table...) as Markdown prefixed by its index in brackets, e.g. "[3] ## Results". Equations are LaTeX between $...$ (inline) or $$...$$ (display). Diagrams are ```mermaid fenced blocks; executable code cells are ```python {run} or ```javascript {run} blocks, followed by their last output in ```text {output} (do not invent outputs: the user runs the cells). Images appear as ![](resource:KEY) and must be kept as is to preserve them.',
      input_schema: { type: 'object', properties: {} },
      mutates: false,
      run: async () => {
        const blocks = host.getBlocks();
        const parts = blocks.map((b, i) => `[${i}] ${toMarkdown([b]).replace(/\n/g, '\n    ')}`);
        return `${blocks.length} block(s).\n\n${parts.join('\n')}`;
      },
    },
    {
      name: 'replace_blocks',
      description:
        'Replace blocks [start, end) of the document with content written in Markdown (GitHub-flavoured: headings, **bold**, *italic*, lists, tables, links, code, $LaTeX$ and $$display LaTeX$$, Mermaid diagrams as ```mermaid fenced blocks, and code cells as ```python {run} blocks). Use start == end to insert before block `start` (start == block count appends), and an empty markdown string to delete. Indices refer to the latest read_document result; read again after edits.',
      input_schema: {
        type: 'object',
        properties: {
          start: { type: 'integer', description: 'First block index to replace.' },
          end: { type: 'integer', description: 'Index after the last block to replace.' },
          markdown: { type: 'string', description: 'New content in Markdown.' },
        },
        required: ['start', 'end', 'markdown'],
      },
      mutates: true,
      run: async (input) => {
        const blocks = host.getBlocks();
        const start = input.start as number;
        const end = input.end as number;
        if (start < 0 || end < start || end > blocks.length) throw new Error(`Invalid range [${start}, ${end}) for ${blocks.length} block(s).`);
        const added = fromMarkdown(input.markdown as string);
        const next = [...blocks.slice(0, start), ...added, ...blocks.slice(end)];
        host.setBlocks(next.length ? next : [{ type: 'paragraph', style: 'normal', runs: [] }]);
        return `Replaced ${end - start} block(s) with ${added.length} block(s); the document now has ${next.length} block(s).`;
      },
    },
    {
      name: 'find_replace',
      description: 'Replace plain text in the document (case-sensitive, within paragraphs and table cells). Formatting of the surrounding text is kept.',
      input_schema: {
        type: 'object',
        properties: { find: { type: 'string' }, replace: { type: 'string' }, all: { type: 'boolean', description: 'Replace every occurrence (default true).' } },
        required: ['find', 'replace'],
      },
      mutates: true,
      run: async (input) => {
        const find = input.find as string;
        const replace = input.replace as string;
        const all = input.all !== false;
        if (!find) throw new Error('find must not be empty.');
        let count = 0;
        const visit = (blocks: Block[]): void => {
          for (const b of blocks) {
            if (b.type === 'table') {
              for (const row of b.rows) for (const cell of row) visit(cell.blocks);
            } else if (b.type === 'paragraph') {
              for (const run of b.runs) {
                if (!isTextRun(run) || (!all && count)) continue;
                const n = run.text.split(find).length - 1;
                if (!n) continue;
                run.text = all ? run.text.split(find).join(replace) : run.text.replace(find, replace);
                count += all ? n : 1;
              }
              b.runs = normalizeRuns(b.runs);
            }
          }
        };
        const blocks = host.getBlocks();
        visit(blocks);
        if (count) host.setBlocks(blocks);
        return `${count} replacement(s).`;
      },
    },
  ];
}

// --- spreadsheets ---------------------------------------------------------------

export interface SheetHost {
  wb: Workbook;
  calc: Calculator;
  activeSheet(): number;
  /** Re-render after a change. */
  refresh(): void;
}

const MAX_READ_CELLS = 2000;

export function sheetTools(host: SheetHost): AgentTool[] {
  const sheetIndex = (name: unknown): number => {
    if (name === undefined) return host.activeSheet();
    const i = host.wb.sheets.findIndex((s) => s.name === name);
    if (i < 0) throw new Error(`No sheet named "${String(name)}". Sheets: ${host.wb.sheets.map((s) => s.name).join(', ')}.`);
    return i;
  };
  const show = (v: unknown): string => (isError(v) ? v.error : v === null || v === undefined ? '' : String(v));
  return [
    {
      name: 'list_sheets',
      description: 'List the sheets of the open workbook with their used range, and which one is active.',
      input_schema: { type: 'object', properties: {} },
      mutates: false,
      run: async () =>
        host.wb.sheets
          .map((s, i) => {
            const [rows, cols] = usedSize(s);
            const range = !rows ? 'empty' : rows === 1 && cols === 1 ? 'A1' : `A1:${refName(rows - 1, cols - 1)}`;
            return `${s.name} (${range})${i === host.activeSheet() ? ' [active]' : ''}`;
          })
          .join('\n'),
    },
    {
      name: 'read_sheet',
      description: 'Read the non-empty cells of a sheet (default: active sheet). One line per cell: reference, input (value or =formula), and the computed value for formulas, separated by tabs.',
      input_schema: { type: 'object', properties: { sheet: { type: 'string', description: 'Sheet name.' } } },
      mutates: false,
      run: async (input) => {
        const si = sheetIndex(input.sheet);
        const sheet = host.wb.sheets[si]!;
        const keys = [...sheet.cells.keys()]
          .map((k) => k.split(',').map(Number) as [number, number])
          .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const lines = keys.slice(0, MAX_READ_CELLS).map(([r, c]) => {
          const cell = sheet.cells.get(`${r},${c}`)!;
          const ref = `${colName(c)}${r + 1}`;
          return cell.formula ? `${ref}\t${cellInput(cell)}\t${show(host.calc.value(si, [r, c]))}` : `${ref}\t${cellInput(cell)}`;
        });
        if (keys.length > MAX_READ_CELLS) lines.push(`… ${keys.length - MAX_READ_CELLS} more cell(s) not shown.`);
        return `Sheet ${sheet.name}: ${keys.length} cell(s).\n${lines.join('\n')}`;
      },
    },
    {
      name: 'set_cells',
      description:
        'Set cells of a sheet (default: active sheet). Each value is typed like in the grid: numbers, TRUE/FALSE, dates, text, or a formula starting with "=" in Excel A1 syntax (e.g. =SUM(A1:A10), =IF(B2>0,"yes","no")). An empty string clears the cell. Text may contain $LaTeX$ equations, which are rendered.',
      input_schema: {
        type: 'object',
        properties: {
          sheet: { type: 'string', description: 'Sheet name.' },
          cells: {
            type: 'array',
            items: { type: 'object', properties: { ref: { type: 'string', description: 'A1 reference.' }, value: { type: 'string' } }, required: ['ref', 'value'] },
          },
        },
        required: ['cells'],
      },
      mutates: true,
      run: async (input) => {
        const si = sheetIndex(input.sheet);
        const sheet = host.wb.sheets[si]!;
        const cells = input.cells as { ref: string; value: string }[];
        for (const { ref } of cells) {
          const parsed = parseRef(ref.trim().toUpperCase());
          if (!parsed) throw new Error(`Invalid cell reference "${ref}" (use A1 style, without a sheet name).`);
        }
        for (const { ref, value } of cells) setInput(sheet, ref.trim().toUpperCase(), value);
        host.calc.invalidate();
        host.refresh();
        return `${cells.length} cell(s) updated in ${sheet.name}.`;
      },
    },
    {
      name: 'add_sheet',
      description: 'Add a new empty sheet at the end of the workbook.',
      input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      mutates: true,
      run: async (input) => {
        const name = (input.name as string).trim();
        if (!name || host.wb.sheets.some((s) => s.name === name)) throw new Error(`Choose a new, non-empty sheet name.`);
        host.wb.sheets.push(newSheet(name));
        host.calc.invalidate();
        host.refresh();
        return `Sheet ${name} added.`;
      },
    },
    {
      name: 'add_chart',
      description:
        'Add a chart drawn from a range of a sheet (SHEET-020). The first column of the range holds the categories (x values for scatter), each other column a series; with headers, the first row holds the series names. The chart is placed at `anchor` (default: right of the range).',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['column', 'bar', 'line', 'pie', 'scatter'] },
          range: { type: 'string', description: 'A1 range such as A1:C10' },
          title: { type: 'string' },
          headers: { type: 'boolean', description: 'First row holds series names (default true)' },
          anchor: { type: 'string', description: 'Top-left cell of the chart, e.g. E2' },
          sheet: { type: 'string' },
        },
        required: ['type', 'range'],
      },
      mutates: true,
      run: async (input) => {
        const si = sheetIndex(input.sheet);
        const range = parseRange(String(input.range));
        if (!range) throw new Error(`Invalid range ${String(input.range)}; use A1 notation like A1:C10.`);
        const at = input.anchor ? parseRef(String(input.anchor)) : undefined;
        const sheet = host.wb.sheets[si]!;
        const chart: Chart = {
          type: input.type as ChartType,
          range: `${refName(range.r1, range.c1)}:${refName(range.r2, range.c2)}`,
          headers: input.headers !== false,
          anchor: at ? { row: at.row, col: at.col } : { row: range.r1, col: range.c2 + 2 },
          width: 480,
          height: 300,
          ...(typeof input.title === 'string' && input.title.trim() ? { title: input.title.trim() } : {}),
        };
        (sheet.charts ??= []).push(chart);
        host.refresh();
        return `Chart added on ${sheet.name} at ${refName(chart.anchor.row, chart.anchor.col)}.`;
      },
    },
  ];
}

// --- presentations --------------------------------------------------------------

export interface SlideHost {
  pres: Presentation;
  refresh(): void;
}

const plain = (p: Paragraph): string => p.runs.map((r) => (isTextRun(r) ? r.text : 'math' in r ? `$${r.math}$` : '[image]')).join('');

const linesToParagraphs = (text: string, bullets: boolean): Paragraph[] =>
  text.split('\n').map((line) => {
    const p: Paragraph = { type: 'paragraph', style: 'normal', runs: line ? [{ text: line }] : [] };
    if (bullets) p.list = { ordered: false, level: 0 };
    return p;
  });

export function slideTools(host: SlideHost): AgentTool[] {
  const slideAt = (n: unknown): number => {
    const i = (n as number) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= host.pres.slides.length) throw new Error(`Slide numbers go from 1 to ${host.pres.slides.length}.`);
    return i;
  };
  const describe = (s: Shape): string =>
    `  - shape ${s.id}${s.placeholder ? ` (${s.placeholder})` : ''}: ${s.kind} at ${Math.round(s.x)},${Math.round(s.y)} size ${Math.round(s.width)}×${Math.round(s.height)}${s.paragraphs.length ? `\n      ${s.paragraphs.map(plain).join('\n      ')}` : ''}`;
  return [
    {
      name: 'read_presentation',
      description: 'Read the open presentation: slide size, then every slide (numbered from 1) with its shapes (id, placeholder, kind, position, text lines) and speaker notes.',
      input_schema: { type: 'object', properties: {} },
      mutates: false,
      run: async () =>
        [
          `${host.pres.slides.length} slide(s), ${host.pres.width}×${host.pres.height} px.`,
          ...host.pres.slides.map((slide, i) => [`Slide ${i + 1}:`, ...slide.shapes.map(describe), slide.notes ? `  notes: ${slide.notes}` : ''].filter(Boolean).join('\n')),
        ].join('\n'),
    },
    {
      name: 'set_shape_text',
      description: 'Replace the text of a shape. Lines are separated by \\n; use bullets=true for a bulleted list. Text may contain $LaTeX$ equations, which are rendered on the slide.',
      input_schema: {
        type: 'object',
        properties: { slide: { type: 'integer', description: 'Slide number (from 1).' }, shape_id: { type: 'integer' }, text: { type: 'string' }, bullets: { type: 'boolean' } },
        required: ['slide', 'shape_id', 'text'],
      },
      mutates: true,
      run: async (input) => {
        const slide = host.pres.slides[slideAt(input.slide)]!;
        const shape = slide.shapes.find((s) => s.id === input.shape_id);
        if (!shape || shape.kind === 'image') throw new Error(`No text shape ${String(input.shape_id)} on slide ${String(input.slide)}.`);
        shape.paragraphs = linesToParagraphs(input.text as string, input.bullets === true);
        host.refresh();
        return `Shape ${shape.id} updated.`;
      },
    },
    {
      name: 'add_slide',
      description: 'Add a title-and-content slide (after slide `after`, default: at the end) with a title and bullet points.',
      input_schema: {
        type: 'object',
        properties: { title: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } }, after: { type: 'integer', description: 'Insert after this slide number (0 = first).' }, notes: { type: 'string' } },
        required: ['title'],
      },
      mutates: true,
      run: async (input) => {
        const slide = contentSlide(host.pres.width, host.pres.height);
        const [title, body] = slide.shapes;
        title!.paragraphs = linesToParagraphs(input.title as string, false);
        const bullets = (input.bullets as string[] | undefined) ?? [];
        if (bullets.length) body!.paragraphs = linesToParagraphs(bullets.join('\n'), true);
        else slide.shapes = [title!];
        if (input.notes) slide.notes = input.notes as string;
        const after = input.after === undefined ? host.pres.slides.length : Math.max(0, Math.min(host.pres.slides.length, input.after as number));
        host.pres.slides.splice(after, 0, slide);
        host.refresh();
        return `Slide ${after + 1} added.`;
      },
    },
    {
      name: 'add_text_box',
      description: 'Add a text box to a slide at a position in pixels.',
      input_schema: {
        type: 'object',
        properties: { slide: { type: 'integer' }, text: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, font_size: { type: 'number' } },
        required: ['slide', 'text'],
      },
      mutates: true,
      run: async (input) => {
        const slide = host.pres.slides[slideAt(input.slide)]!;
        const shape = textShape('', {
          x: (input.x as number | undefined) ?? 80,
          y: (input.y as number | undefined) ?? 80,
          width: (input.width as number | undefined) ?? 600,
          height: (input.height as number | undefined) ?? 80,
          fontSize: (input.font_size as number | undefined) ?? 18,
        });
        shape.paragraphs = linesToParagraphs(input.text as string, false);
        slide.shapes.push(shape);
        host.refresh();
        return `Text box ${shape.id} added to slide ${String(input.slide)}.`;
      },
    },
    {
      name: 'delete_slide',
      description: 'Delete a slide (the presentation keeps at least one slide).',
      input_schema: { type: 'object', properties: { slide: { type: 'integer' } }, required: ['slide'] },
      mutates: true,
      run: async (input) => {
        const i = slideAt(input.slide);
        if (host.pres.slides.length === 1) throw new Error('A presentation keeps at least one slide.');
        host.pres.slides.splice(i, 1);
        host.refresh();
        return `Slide ${i + 1} deleted.`;
      },
    },
  ];
}

/** Run `before` (e.g. an undo snapshot) ahead of every mutating tool. */
export function beforeMutation(tools: AgentTool[], before: () => void): AgentTool[] {
  return tools.map((tool) =>
    tool.mutates
      ? {
          ...tool,
          run: (input) => {
            before();
            return tool.run(input);
          },
        }
      : tool,
  );
}

export interface ToolOutcome {
  ok: boolean;
  /** Result text, or the error explained to the model. */
  content: string;
  /** A mutating tool ran successfully. */
  mutated: boolean;
}

/** Validate, confirm (for mutating tools) and run one tool call; shared by every provider. */
export async function callTool(
  tools: Map<string, AgentTool>,
  name: string,
  input: unknown,
  confirm?: (tool: AgentTool, input: Record<string, unknown>) => Promise<boolean>,
): Promise<ToolOutcome> {
  const tool = tools.get(name);
  if (!tool) return { ok: false, content: `Unknown tool ${name}.`, mutated: false };
  const problem = validateInput(tool.input_schema, input);
  if (problem) return { ok: false, content: `Invalid input: ${problem}. Input received: ${JSON.stringify(input)}`, mutated: false };
  const args = input as Record<string, unknown>;
  if (tool.mutates && confirm && !(await confirm(tool, args))) return { ok: false, content: 'The user declined this change.', mutated: false };
  try {
    return { ok: true, content: await tool.run(args), mutated: !!tool.mutates };
  } catch (err) {
    return { ok: false, content: (err as Error).message, mutated: false };
  }
}
