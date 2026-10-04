import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFTextField } from '@pdfme/pdf-lib';
import { applyEdits, inspectPdf } from '../src/pdf/forms';
import { checkValue, formatActions, inputPattern, parseDate, parseFormatScripts, type FieldFormat } from '../src/pdf/field-format';

const blank = async (): Promise<Uint8Array> => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return doc.save();
};
const edits = { values: {}, stamps: [], flatten: false };

describe('FORM-005 the format of a text field', () => {
  it('checks numbers, integers, dates, e-mail, phone and patterns of one’s own; an empty value always passes', () => {
    const ok = (f: FieldFormat, ...values: string[]): boolean[] => values.map((v) => checkValue(f, v));
    expect(ok({ kind: 'number', decimals: 2 }, '12', '-3.5', '4,25', '1.234', 'abc', '')).toEqual([true, true, true, false, false, true]);
    expect(ok({ kind: 'integer' }, '42', '-7', '4.2')).toEqual([true, true, false]);
    expect(ok({ kind: 'date', pattern: 'dd/mm/yyyy' }, '04/10/2026', '31/02/2026', '2026-10-04')).toEqual([true, false, false]);
    expect(ok({ kind: 'date', pattern: 'yyyy-mm-dd' }, '2026-10-04')).toEqual([true]);
    expect(ok({ kind: 'email' }, 'a@b.fr', 'a@b', 'a b@c.fr')).toEqual([true, false, false]);
    expect(ok({ kind: 'phone' }, '+33 6 12 34 56 78', '01.23.45.67.89', '12')).toEqual([true, true, false]);
    // The whole value must match the pattern.
    expect(ok({ kind: 'regex', pattern: '[A-Z]{2}\\d{3}' }, 'AB123', 'xAB123', 'AB1234')).toEqual([true, false, false]);
    expect(parseDate('dd/mm/yy', '04/10/26')).toEqual({ d: 4, m: 10, y: 2026 });
    expect(inputPattern({ kind: 'regex', pattern: '[A-Z]+' })).toBe('[A-Z]+');
    expect(inputPattern({ kind: 'regex', pattern: '(' })).toBeUndefined();
  });

  it('writes the standard scripts of PDF readers, and reads the format back from them', () => {
    const number = formatActions({ kind: 'number', decimals: 2 }, 'bad');
    expect(number.K).toContain('AFNumber_Keystroke(2');
    expect(parseFormatScripts(number)).toEqual({ kind: 'number', decimals: 2 });
    const regex: FieldFormat = { kind: 'regex', pattern: '[A-Z]{2}\\d{3}', message: 'Two letters, three digits' };
    expect(parseFormatScripts(formatActions(regex, 'bad'))).toEqual(regex);
    // A file made elsewhere, with the standard date functions only.
    expect(parseFormatScripts({ K: 'AFDate_KeystrokeEx("mm/dd/yyyy");' })).toEqual({ kind: 'date', pattern: 'mm/dd/yyyy' });
  });
});

describe('FORM-005 the properties of the fields of a PDF form', () => {
  it('writes them in the file and reads them back', async () => {
    const bytes = await applyEdits(await blank(), {
      ...edits,
      newFields: [
        { kind: 'text', name: 'Code', page: 0, rect: [50, 700, 200, 20], required: true, settings: { tooltip: 'Your client code', maxLength: 5, comb: true, align: 'center', fontSize: 12, defaultValue: 'AB1', format: { kind: 'regex', pattern: '[A-Z]{2}\\d{3}' } } },
        { kind: 'dropdown', name: 'Town', page: 0, rect: [50, 650, 200, 20], options: ['Paris', 'Lyon'], settings: { editable: true, sorted: true, defaultValue: 'Lyon', readOnly: true } },
        { kind: 'checkbox', name: 'Agree', page: 0, rect: [50, 600, 14, 14], settings: { checked: true } },
      ],
    });
    const info = await inspectPdf(bytes);
    const code = info.fields.find((f) => f.name === 'Code')!;
    expect(code).toMatchObject({ tooltip: 'Your client code', required: true, maxLength: 5, comb: true, align: 'center', value: 'AB1', format: { kind: 'regex', pattern: '[A-Z]{2}\\d{3}' } });
    expect(info.fields.find((f) => f.name === 'Town')).toMatchObject({ editable: true, sorted: true, value: 'Lyon', readOnly: true });
    expect(info.fields.find((f) => f.name === 'Agree')).toMatchObject({ value: true });
    // The scripts are those other readers run.
    const doc = await PDFDocument.load(bytes);
    const aa = (doc.getForm().getField('Code') as PDFTextField).acroField.dict.lookup(PDFName.of('AA'), PDFDict);
    expect(aa.has(PDFName.of('V'))).toBe(true);
  });

  it('changes the properties of fields already in the file, and cuts a value longer than a new limit', async () => {
    const first = await applyEdits(await blank(), { ...edits, newFields: [{ kind: 'text', name: 'Name', page: 0, rect: [50, 700, 200, 20] }] });
    const second = await applyEdits(first, { ...edits, values: { Name: 'Sébastien' }, fieldSettings: { Name: { maxLength: 4, tooltip: 'First name', format: { kind: 'email' } } } });
    const name = (await inspectPdf(second)).fields.find((f) => f.name === 'Name')!;
    expect(name).toMatchObject({ maxLength: 4, value: 'Séba', tooltip: 'First name', format: { kind: 'email' } });
    // And removes them.
    const third = await applyEdits(second, { ...edits, fieldSettings: { Name: { maxLength: 0, tooltip: '', format: undefined } } });
    const plain = (await inspectPdf(third)).fields.find((f) => f.name === 'Name')!;
    expect(plain.maxLength).toBeUndefined();
    expect(plain.tooltip).toBeUndefined();
    expect(plain.format).toBeUndefined();
  });
});
