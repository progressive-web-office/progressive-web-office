import { describe, expect, it } from 'vitest';
import { documentTools, sheetTools, slideTools, validateInput, type AgentTool } from '../src/ai/tools';
import { addResource, emptyDocument, paragraph, type Block } from '../src/document/model';
import { newWorkbook } from '../src/sheet/model';
import { Calculator } from '../src/sheet/engine';
import { emptyPresentation } from '../src/slides/model';
import { PNG_1PX } from './fixtures';

const tool = (tools: AgentTool[], name: string) => tools.find((t) => t.name === name)!;

describe('validateInput', () => {
  const schema = {
    type: 'object',
    properties: { a: { type: 'integer' }, b: { type: 'string' }, c: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] } } },
    required: ['a'],
  } as const;
  it('accepts valid input and reports the first problem otherwise', () => {
    expect(validateInput(schema, { a: 1, b: 'x', c: [{ ref: 'A1' }] })).toBeNull();
    expect(validateInput(schema, {})).toBe('a is required');
    expect(validateInput(schema, { a: 1.5 })).toBe('a must be an integer');
    expect(validateInput(schema, { a: 1, c: [{}] })).toBe('c[0].ref is required');
    expect(validateInput(schema, 'x')).toBe('input must be an object');
  });
});

describe('AI-001 document tools', () => {
  const setup = () => {
    const doc = emptyDocument();
    const key = addResource(doc, PNG_1PX, 'image/png');
    let blocks: Block[] = [paragraph('Title', { style: 'h1' }), paragraph('Hello world.'), { type: 'paragraph', style: 'normal', runs: [{ image: key }] }];
    const tools = documentTools({ doc, getBlocks: () => blocks, setBlocks: (b) => (blocks = b) });
    return { tools, get blocks() { return blocks; }, key };
  };

  it('reads numbered blocks as Markdown with image placeholders', async () => {
    const s = setup();
    const out = await tool(s.tools, 'read_document').run({});
    expect(out).toContain('[0] # Title');
    expect(out).toContain('[1] Hello world.');
    expect(out).toContain(`[2] ![](resource:${s.key})`);
  });

  it('replaces, inserts and deletes blocks from Markdown with LaTeX math (AI-005)', async () => {
    const s = setup();
    await tool(s.tools, 'replace_blocks').run({ start: 1, end: 2, markdown: 'Energy: $E=mc^2$\n\n- a\n- b' });
    expect(s.blocks[1]).toEqual({ type: 'paragraph', style: 'normal', runs: [{ text: 'Energy: ' }, { math: 'E=mc^2' }] });
    expect(s.blocks).toHaveLength(5);
    expect(s.blocks[4]).toMatchObject({ runs: [{ image: s.key }] });
    await tool(s.tools, 'replace_blocks').run({ start: 0, end: 1, markdown: '' });
    expect(s.blocks).toHaveLength(4);
  });

  it('rejects out-of-range edits and does find/replace', async () => {
    const s = setup();
    await expect(tool(s.tools, 'replace_blocks').run({ start: 2, end: 9, markdown: 'x' })).rejects.toThrow(/range/);
    expect(await tool(s.tools, 'find_replace').run({ find: 'world', replace: 'PWO' })).toBe('1 replacement(s).');
    expect(s.blocks[1]).toEqual(paragraph('Hello PWO.'));
  });
});

describe('AI-001 spreadsheet tools', () => {
  const setup = () => {
    const wb = newWorkbook();
    const calc = new Calculator(wb);
    let refreshed = 0;
    const tools = sheetTools({ wb, calc, activeSheet: () => 0, refresh: () => refreshed++ });
    return { wb, tools, refreshed: () => refreshed };
  };

  it('adds a chart from a range (SHEET-020)', async () => {
    const s = setup();
    expect(await tool(s.tools, 'add_chart').run({ type: 'line', range: 'a1:b5', title: 'Trend' })).toBe('Chart added on Sheet1 at D1.');
    expect(s.wb.sheets[0]!.charts).toEqual([{ type: 'line', range: 'A1:B5', headers: true, anchor: { row: 0, col: 3 }, width: 480, height: 300, title: 'Trend' }]);
    await expect(tool(s.tools, 'add_chart').run({ type: 'pie', range: 'nope' })).rejects.toThrow(/Invalid range/);
  });

  it('writes values and formulas and reads computed values (AI-005)', async () => {
    const s = setup();
    expect(await tool(s.tools, 'set_cells').run({ cells: [{ ref: 'A1', value: '2' }, { ref: 'A2', value: '3' }, { ref: 'A3', value: '=SUM(A1:A2)' }, { ref: 'B1', value: 'Total' }] })).toBe('4 cell(s) updated in Sheet1.');
    expect(s.refreshed()).toBe(1);
    const out = await tool(s.tools, 'read_sheet').run({});
    expect(out).toContain('A3\t=SUM(A1:A2)\t5');
    expect(out).toContain('B1\tTotal');
  });

  it('adds sheets and rejects bad references', async () => {
    const s = setup();
    await tool(s.tools, 'add_sheet').run({ name: 'Data' });
    expect(s.wb.sheets.map((x) => x.name)).toEqual(['Sheet1', 'Data']);
    await tool(s.tools, 'set_cells').run({ sheet: 'Data', cells: [{ ref: 'C2', value: 'x' }] });
    expect(await tool(s.tools, 'list_sheets').run({})).toContain('Data (A1:C2)');
    await expect(tool(s.tools, 'set_cells').run({ cells: [{ ref: 'nope', value: '1' }] })).rejects.toThrow(/reference/);
  });
});

describe('AI-001 presentation tools', () => {
  it('reads slides, sets shape text and adds slides', async () => {
    const pres = emptyPresentation();
    const tools = slideTools({ pres, refresh: () => undefined });
    const shapeId = pres.slides[0]!.shapes[0]!.id;
    expect(await tool(tools, 'read_presentation').run({})).toContain(`shape ${shapeId} (title)`);
    await tool(tools, 'set_shape_text').run({ slide: 1, shape_id: shapeId, text: 'Kinetic energy $\\frac{1}{2}mv^2$' });
    expect(pres.slides[0]!.shapes[0]!.paragraphs[0]!.runs).toEqual([{ text: 'Kinetic energy $\\frac{1}{2}mv^2$' }]);
    await tool(tools, 'add_slide').run({ title: 'Plan', bullets: ['One', 'Two'] });
    expect(pres.slides).toHaveLength(2);
    const body = pres.slides[1]!.shapes[1]!;
    expect(body.paragraphs.map((p) => p.runs)).toEqual([[{ text: 'One' }], [{ text: 'Two' }]]);
    await tool(tools, 'delete_slide').run({ slide: 1 });
    expect(pres.slides).toHaveLength(1);
  });
});
