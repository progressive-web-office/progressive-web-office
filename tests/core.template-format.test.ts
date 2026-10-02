import { describe, expect, it } from 'vitest';
import { detectFormat } from '../src/core/format';
import { isTemplate, templateExtension, TEMPLATE_FORMATS, toTemplate } from '../src/core/template-format';
import { readZip, readZipText } from '../src/core/zip';
import { emptyDocument, paragraph } from '../src/document/model';
import { readDocument, writeDocument } from '../src/document/io';
import { newWorkbook, setInput } from '../src/sheet/model';
import { readWorkbook, writeWorkbook } from '../src/sheet/io';
import { emptyPresentation } from '../src/slides/model';
import { readPresentation, writePresentation } from '../src/slides/io';

const doc = { ...emptyDocument(), blocks: [paragraph('Dear …')] };
const wb = (() => {
  const w = newWorkbook();
  setInput(w.sheets[0]!, 'A1', '42');
  return w;
})();

describe('FILE-020 template formats', () => {
  it('names the template extension of each format', () => {
    expect(TEMPLATE_FORMATS.map((f) => `${f}:${templateExtension(f)}`)).toEqual(['odt:ott', 'docx:dotx', 'ods:ots', 'xlsx:xltx', 'odp:otp', 'pptx:potx']);
  });

  it.each(['odt', 'docx'] as const)('writes and reads a %s template', async (format) => {
    const bytes = toTemplate(writeDocument(doc, format), format);
    expect(detectFormat(`letter.${templateExtension(format)}`, bytes)).toBe(format);
    expect(isTemplate(bytes)).toBe(true);
    expect((await readDocument(format, bytes)).blocks).toEqual(doc.blocks);
    expect(isTemplate(writeDocument(doc, format))).toBe(false);
  });

  it.each(['ods', 'xlsx'] as const)('writes and reads a %s template', (format) => {
    const bytes = toTemplate(writeWorkbook(wb, format), format);
    expect(detectFormat(`budget.${templateExtension(format)}`, bytes)).toBe(format);
    expect(isTemplate(bytes)).toBe(true);
    expect(readWorkbook(format, bytes).sheets[0]!.cells.get('0,0')?.value).toBe(42);
  });

  it.each(['odp', 'pptx'] as const)('writes and reads a %s template', (format) => {
    const bytes = toTemplate(writePresentation(emptyPresentation(), format), format);
    expect(detectFormat(`talk.${templateExtension(format)}`, bytes)).toBe(format);
    expect(isTemplate(bytes)).toBe(true);
    expect(readPresentation(format, bytes).slides).toHaveLength(1);
  });

  it('declares the template media types', () => {
    const ott = readZip(toTemplate(writeDocument(doc, 'odt'), 'odt'));
    expect(readZipText(ott, 'mimetype')).toBe('application/vnd.oasis.opendocument.text-template');
    expect(readZipText(ott, 'META-INF/manifest.xml')).toMatch(/manifest:full-path="\/"[^>]*manifest:media-type="application\/vnd.oasis.opendocument.text-template"/);
    const dotx = readZip(toTemplate(writeDocument(doc, 'docx'), 'docx'));
    expect(readZipText(dotx, '[Content_Types].xml')).toContain('wordprocessingml.template.main+xml');
    expect(readZipText(dotx, '[Content_Types].xml')).not.toContain('wordprocessingml.document.main+xml');
  });

  it('leaves other files alone', () => {
    expect(isTemplate(new TextEncoder().encode('# Title'))).toBe(false);
    expect(isTemplate(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(false);
  });
});
