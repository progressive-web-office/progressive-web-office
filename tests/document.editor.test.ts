import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../src/document/editor';
import { readDocument } from '../src/document/io';
import { emptyDocument, paragraph } from '../src/document/model';
import { richSample } from './fixtures';

const ctx = () => ({ changed: vi.fn(), statusChanged: vi.fn(), choose: vi.fn() });
let editor: DocumentEditor | undefined;
afterEach(() => {
  editor?.destroy();
  editor?.element.remove();
});

describe('DOC-003 document editor view', () => {
  it('renders the document in an editable page', () => {
    editor = new DocumentEditor(richSample(), ctx());
    document.body.append(editor.element);
    const page = editor.element.querySelector('[contenteditable="true"]')!;
    expect(page.querySelector('h1')?.textContent).toBe('Main title');
    expect(page.querySelectorAll('img')).toHaveLength(1);
  });

  it.each(['docx', 'odt', 'mdz'] as const)('saves what is displayed (%s round-trip)', async (format) => {
    const sample = richSample();
    editor = new DocumentEditor(sample, ctx());
    document.body.append(editor.element);
    const back = await readDocument(format, await editor.save(format));
    const strip = (x: unknown) => JSON.parse(JSON.stringify(x).replace(/,"width":\d+,"height":\d+/g, '').replace(/"image":"[0-9a-f]+"/g, '"image":"K"'));
    const expected = format === 'mdz' ? sample.blocks.map((b) => (b.type === 'paragraph' ? (({ align: _a, ...r }) => r)(b) : b)) : sample.blocks;
    expect(strip(back.blocks)).toEqual(strip(expected));
  });

  it('DOC-010 reports word and character counts', () => {
    const doc = emptyDocument();
    doc.blocks = [paragraph('one two three')];
    editor = new DocumentEditor(doc, ctx());
    expect(editor.status()).toBe('3 words · 13 characters');
  });

  it('UI-003 toolbar controls have accessible names', () => {
    editor = new DocumentEditor(emptyDocument(), ctx());
    for (const el of Array.from(editor.element.querySelectorAll('button, select'))) {
      expect(el.getAttribute('aria-label') ?? el.textContent?.trim(), el.outerHTML).toBeTruthy();
    }
  });
});
