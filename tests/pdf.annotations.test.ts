// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFHexString, PDFName } from '@pdfme/pdf-lib';
import { applyEdits } from '../src/pdf/forms';
import { pdfDate } from '../src/pdf/annotations';

describe('PDF-018 annotations', () => {
  it('writes highlights and notes as standard annotations', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const bytes = await doc.save();
    const out = await applyEdits(bytes, {
      values: {},
      stamps: [],
      flatten: false,
      notes: [
        { kind: 'highlight', page: 0, boxes: [[72, 700, 200, 714], [72, 686, 150, 700]], text: 'Unclear', author: 'Ann Lee', date: '2026-10-02T09:30:00Z' },
        { kind: 'note', page: 0, boxes: [[300, 400, 320, 420]], text: 'Good — très bien', author: 'Ann Lee' },
      ],
    });
    const back = await PDFDocument.load(out);
    const annots = back.getPage(0).node.Annots()!;
    expect(annots.size()).toBe(2);
    const first = back.context.lookup(annots.get(0)) as import('@pdfme/pdf-lib').PDFDict;
    expect(first.get(PDFName.of('Subtype'))).toBe(PDFName.of('Highlight'));
    expect((first.get(PDFName.of('Contents')) as PDFHexString).decodeText()).toBe('Unclear');
    expect((first.get(PDFName.of('T')) as PDFHexString).decodeText()).toBe('Ann Lee');
    expect(first.get(PDFName.of('QuadPoints'))!.toString()).toBe('[ 72 714 200 714 72 700 200 700 72 700 150 700 72 686 150 686 ]');
    expect(first.get(PDFName.of('AP'))).toBeTruthy();
    const second = back.context.lookup(annots.get(1)) as import('@pdfme/pdf-lib').PDFDict;
    expect(second.get(PDFName.of('Subtype'))).toBe(PDFName.of('Text'));
    expect((second.get(PDFName.of('Contents')) as PDFHexString).decodeText()).toBe('Good — très bien');
  });

  it('writes PDF dates', () => {
    expect(pdfDate('2026-10-02T09:30:05Z')).toBe('D:20261002093005Z');
  });
});
