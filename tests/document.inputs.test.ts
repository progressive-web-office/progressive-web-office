import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { readDocument, writeDocument } from '../src/document/io';
import { allParagraphs, isInputRun, type InputRun, type RichDocument } from '../src/document/model';
import { blocksToDom, domToBlocks } from '../src/document/html';
import { readZip, readZipText } from '../src/core/zip';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';

const inputs = (d: RichDocument): InputRun[] => allParagraphs(d.blocks).flatMap((p) => p.runs.filter(isInputRun));
const SOURCE = [
  'Name: [Jeanne MARTIN]{.input name="Name"}',
  '',
  'Class: []{.input name="Class" required}',
  '',
  '[x]{.checkbox name="Photos"} I agree to photos, [ ]{.checkbox name="Bus"} bus.',
  '',
  'Lunch: [Yes]{.choice name="Lunch" options="Yes|No|Maybe"}, [a \\] b]{.input name="Odd \\"name\\""}',
  '',
].join('\n');
const EXPECTED: InputRun[] = [
  { input: 'text', name: 'Name', value: 'Jeanne MARTIN' },
  { input: 'text', name: 'Class', required: true },
  { input: 'checkbox', name: 'Photos', checked: true },
  { input: 'checkbox', name: 'Bus', checked: false },
  { input: 'dropdown', name: 'Lunch', value: 'Yes', options: ['Yes', 'No', 'Maybe'] },
  { input: 'text', name: 'Odd "name"', value: 'a ] b' },
];
const noRequired = (runs: InputRun[]) => runs.map(({ required: _r, ...r }) => r);

describe('FORM-003 form fields in text documents', () => {
  it('reads and writes Markdown bracketed spans', () => {
    const doc = readMarkdown(SOURCE);
    expect(inputs(doc)).toEqual(EXPECTED);
    expect(writeMarkdown(doc)).toContain('[Jeanne MARTIN]{.input name="Name"}');
    expect(inputs(readMarkdown(writeMarkdown(doc)))).toEqual(EXPECTED);
    // A link stays a link.
    expect(inputs(readMarkdown('[x](https://example.org) [y]{.other}\n'))).toEqual([]);
  });

  it.each(['odt', 'docx'] as const)('keeps its fields and answers in %s', async (format) => {
    const back = await readDocument(format, writeDocument(readMarkdown(SOURCE), format));
    expect(noRequired(inputs(back))).toEqual(noRequired(EXPECTED));
  });

  it('writes LibreOffice fields and Word content controls', () => {
    const doc = readMarkdown(SOURCE);
    const odt = readZipText(readZip(writeDocument(doc, 'odt')), 'content.xml')!;
    expect(odt).toContain('<text:text-input text:description="Name">Jeanne MARTIN</text:text-input>');
    expect(odt).toContain('<text:drop-down text:name="Lunch"><text:label text:value="Yes" text:current-selected="true"/>');
    const docx = readZipText(readZip(writeDocument(doc, 'docx')), 'word/document.xml')!;
    expect(docx).toContain('<w:tag w:val="Name"/><w:text/>');
    expect(docx).toContain('<w14:checkbox><w14:checked w14:val="1"/>');
    expect(docx).toContain('<w:listItem w:displayText="Maybe" w:value="Maybe"/>');
  });

  it('prints in LaTeX as boxes and lines', () => {
    const tex = new TextDecoder().decode(writeDocument(readMarkdown(SOURCE), 'tex'));
    expect(tex).toContain('$\\boxtimes$ I agree to photos, $\\square$ bus.');
    expect(tex).toContain('\\underline{\\hspace{4cm}}');
    expect(tex).toContain('\\usepackage{amssymb}');
  });

  it('goes through HTML as real controls, and through the editor', () => {
    const doc = readMarkdown(SOURCE);
    const host = document.createElement('div');
    host.append(blocksToDom(doc.blocks, document, () => undefined));
    const box = host.querySelector<HTMLInputElement>('input[type="checkbox"][name="Bus"]')!;
    box.checked = true;
    expect(inputs({ ...doc, blocks: domToBlocks(host, () => undefined) }).find((r) => r.name === 'Bus')?.checked).toBe(true);
    expect(inputs({ ...doc, blocks: pmToBlocks(blocksToPm(doc.blocks)) })).toEqual(EXPECTED);
  });
});
