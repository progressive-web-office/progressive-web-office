import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName } from '@pdfme/pdf-lib';
import { applyEdits, inspectPdf } from '../src/pdf/forms';
import { PNG_1PX } from './fixtures';

async function formPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  doc.addPage([600, 800]);
  const form = doc.getForm();
  const name = form.createTextField('name');
  name.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
  const agree = form.createCheckBox('agree');
  agree.addToPage(page, { x: 50, y: 650, width: 15, height: 15 });
  const color = form.createRadioGroup('color');
  color.addOptionToPage('red', page, { x: 50, y: 600, width: 15, height: 15 });
  color.addOptionToPage('blue', page, { x: 80, y: 600, width: 15, height: 15 });
  const country = form.createDropdown('country');
  country.addOptions(['France', 'Spain']);
  country.addToPage(page, { x: 50, y: 550, width: 100, height: 20 });
  return doc.save();
}

describe('PDF-008 form inspection', () => {
  it('lists fields with their type, options, value and widget rectangles', async () => {
    const info = await inspectPdf(await formPdf());
    expect(info.pageCount).toBe(2);
    expect(info.readOnlyReason).toBeUndefined();
    const byName = Object.fromEntries(info.fields.map((f) => [f.name, f]));
    expect(byName.name).toMatchObject({ type: 'text', value: '' });
    const [w] = byName.name!.widgets;
    expect(w!.page).toBe(0);
    // pdf-lib grows the rectangle by half the border width
    w!.rect.forEach((v, i) => expect(Math.abs(v - [50, 700, 200, 20][i]!)).toBeLessThanOrEqual(1));
    expect(byName.agree).toMatchObject({ type: 'checkbox', value: false });
    expect(byName.color).toMatchObject({ type: 'radio', options: ['red', 'blue'] });
    expect(byName.color!.widgets.map((w) => w.option)).toEqual(['red', 'blue']);
    expect(byName.country).toMatchObject({ type: 'dropdown', options: ['France', 'Spain'] });
  });

  it('reports PDFs without forms', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const info = await inspectPdf(await doc.save());
    expect(info.fields).toEqual([]);
  });

  it('PDF-015 reports XFA forms as read-only', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.getForm().createTextField('x').addToPage(doc.getPage(0), { x: 10, y: 10, width: 50, height: 20 });
    doc.getForm().acroForm.dict.set(PDFName.of('XFA'), doc.context.obj([]));
    // pdf-lib strips XFA when refreshing appearances on save
    const info = await inspectPdf(await doc.save({ updateFieldAppearances: false }));
    expect(info.readOnlyReason).toMatch(/XFA/);
  });

  it('rejects non-PDF data', async () => {
    await expect(inspectPdf(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});

describe('PDF-009..013 saving filled forms, signatures and text', () => {
  it('writes field values readable by other PDF tools', async () => {
    const out = await applyEdits(await formPdf(), {
      values: { name: 'Ada Lovelace', agree: true, color: 'blue', country: 'Spain' },
      stamps: [],
      flatten: false,
    });
    const form = (await PDFDocument.load(out)).getForm();
    expect(form.getTextField('name').getText()).toBe('Ada Lovelace');
    expect(form.getCheckBox('agree').isChecked()).toBe(true);
    expect(form.getRadioGroup('color').getSelected()).toBe('blue');
    expect(form.getDropdown('country').getSelected()).toEqual(['Spain']);
  });

  it('PDF-010 flattens fields when asked', async () => {
    const out = await applyEdits(await formPdf(), { values: { name: 'x' }, stamps: [], flatten: true });
    expect((await PDFDocument.load(out)).getForm().getFields()).toHaveLength(0);
  });

  it('PDF-012 / PDF-013 embeds signature images and free text on the chosen page', async () => {
    const out = await applyEdits(await formPdf(), {
      values: {},
      stamps: [
        { kind: 'image', page: 1, x: 100, y: 100, width: 120, height: 40, png: PNG_1PX },
        { kind: 'text', page: 1, x: 100, y: 80, width: 100, height: 14, text: '2026-10-01', size: 12 },
      ],
      flatten: false,
    });
    const doc = await PDFDocument.load(out);
    const resources = doc.getPage(1).node.Resources()!;
    const xobjects = resources.lookup(PDFName.of('XObject'));
    expect(xobjects).toBeDefined();
  });
});
