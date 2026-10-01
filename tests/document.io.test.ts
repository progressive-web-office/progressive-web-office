import { describe, expect, it } from 'vitest';
import { readDocument, writeDocument } from '../src/document/io';
import { detectFormat } from '../src/core/format';
import { richSample } from './fixtures';

describe('FILE-006 document conversions', () => {
  it.each(['docx', 'odt', 'md', 'mdz'] as const)('writes %s that is detected and read back', async (format) => {
    const bytes = writeDocument(richSample(), format);
    const name = `x.${format}`;
    expect(detectFormat(name, bytes)).toBe(format);
    const doc = await readDocument(format, bytes);
    expect(doc.blocks.length).toBeGreaterThan(5);
  });

  it('converts docx -> odt -> md keeping headings', async () => {
    const odt = writeDocument(await readDocument('docx', writeDocument(richSample(), 'docx')), 'odt');
    const md = new TextDecoder().decode(writeDocument(await readDocument('odt', odt), 'md'));
    expect(md).toMatch(/^# Main title$/m);
    expect(md).toMatch(/^## Section$/m);
  });
});
