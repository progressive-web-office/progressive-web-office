import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@pdfme/pdf-lib';
import { applyEdits, inspectPdf, type NewField } from '../src/pdf/forms';
import { answersTable, answersWorkbook, readPdfAnswers } from '../src/forms/collect';
import { getCell } from '../src/sheet/model';
import { writeWorkbook, readWorkbook } from '../src/sheet/io';

async function blankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return doc.save();
}

const DESIGN: NewField[] = [
  { kind: 'text', name: 'Name', page: 0, rect: [100, 700, 200, 20], required: true },
  { kind: 'multiline', name: 'Comments', page: 0, rect: [100, 600, 300, 80] },
  { kind: 'checkbox', name: 'Newsletter', page: 0, rect: [100, 560, 14, 14] },
  { kind: 'dropdown', name: 'Level', page: 0, rect: [100, 520, 120, 20], options: ['Beginner', 'Expert'] },
  { kind: 'radio', name: 'Size', page: 0, rect: [100, 480, 14, 14], option: 'S' },
  { kind: 'radio', name: 'Size', page: 0, rect: [140, 480, 14, 14], option: 'L' },
  { kind: 'text', name: 'Age', page: 0, rect: [100, 440, 60, 20] },
];

describe('FORM-001 designing a PDF form', () => {
  it('makes real AcroForm fields of the fields drawn', async () => {
    const pdf = await applyEdits(await blankPdf(), { values: {}, stamps: [], flatten: false, newFields: DESIGN });
    const info = await inspectPdf(pdf);
    expect(info.fields.map((f) => [f.name, f.type])).toEqual([
      ['Name', 'text'],
      ['Comments', 'text'],
      ['Newsletter', 'checkbox'],
      ['Level', 'dropdown'],
      ['Size', 'radio'],
      ['Age', 'text'],
    ]);
    expect(info.fields.find((f) => f.name === 'Comments')!.multiline).toBe(true);
    expect(info.fields.find((f) => f.name === 'Level')!.options).toEqual(['Beginner', 'Expert']);
    expect(info.fields.find((f) => f.name === 'Size')!.options).toEqual(['S', 'L']);
    // Where it was drawn (the border around it).
    info.fields.find((f) => f.name === 'Name')!.widgets[0]!.rect.forEach((v, i) => expect(Math.abs(v - [100, 700, 200, 20][i]!)).toBeLessThanOrEqual(1));
  });

  it('removes and renames fields', async () => {
    const pdf = await applyEdits(await blankPdf(), { values: {}, stamps: [], flatten: false, newFields: DESIGN });
    const changed = await applyEdits(pdf, { values: {}, stamps: [], flatten: false, removedFields: ['Comments'], renamedFields: { Age: 'Age (years)' } });
    expect((await inspectPdf(changed)).fields.map((f) => f.name)).toEqual(['Name', 'Newsletter', 'Level', 'Size', 'Age (years)']);
  });
});

describe('FORM-002 compiling the answers of filled forms', () => {
  it('makes one row per file, one column per field', async () => {
    const form = await applyEdits(await blankPdf(), { values: {}, stamps: [], flatten: false, newFields: DESIGN });
    const fill = (values: Record<string, string | boolean>) => applyEdits(form, { values, stamps: [], flatten: false });
    const forms = await Promise.all([
      readPdfAnswers('ada.pdf', await fill({ Name: 'Ada', Newsletter: true, Level: 'Expert', Size: 'S', Age: '36' })),
      readPdfAnswers('alan.pdf', await fill({ Name: 'Alan', Comments: 'Hello', Age: '041' })),
      readPdfAnswers('broken.pdf', new Uint8Array([1, 2, 3])),
    ]);
    expect(forms[2]!.error).toBeTruthy();
    const table = answersTable(forms);
    expect(table.header).toEqual(['File', 'Name', 'Comments', 'Newsletter', 'Level', 'Size', 'Age']);
    expect(table.rows).toEqual([
      ['ada.pdf', 'Ada', null, true, 'Expert', 'S', 36],
      // A code with a leading zero stays text.
      ['alan.pdf', 'Alan', 'Hello', false, null, null, '041'],
    ]);
    const wb = answersWorkbook(table);
    expect(getCell(wb.sheets[0]!, 'B2')?.value).toBe('Ada');
    expect(getCell(wb.sheets[0]!, 'A1')?.style?.bold).toBe(true);
    // As a spreadsheet file.
    const back = readWorkbook('xlsx', writeWorkbook(wb, 'xlsx'));
    expect(getCell(back.sheets[0]!, 'G2')?.value).toBe(36);
  });
});
