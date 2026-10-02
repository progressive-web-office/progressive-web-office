import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { readDocx } from '../src/document/docx-reader';
import { writeDocx } from '../src/document/docx-writer';
import { readOdt } from '../src/document/odt-reader';
import { writeOdt } from '../src/document/odt-writer';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { schema } from '../src/document/pm/schema';
import { acceptAll, changesOf, decide, trackTransaction } from '../src/document/changes';
import type { Paragraph, RichDocument } from '../src/document/model';
import { readZip, readZipText } from '../src/core/zip';

const ANN = { author: 'Ann', date: '2026-10-02T09:30:00Z' };
const BOB = { author: 'Bob', date: '2026-10-02T10:00:00Z' };

const sample = (): RichDocument => ({
  blocks: [{ type: 'paragraph', style: 'normal', runs: [{ text: 'The ' }, { text: 'quick ', inserted: ANN }, { text: 'brown', deleted: BOB }, { text: ' fox.' }] }],
  resources: new Map(),
  meta: {},
});
const runs = (doc: RichDocument): unknown => (doc.blocks[0] as Paragraph).runs;

describe('REV-005 tracked changes: formats', () => {
  it('writes and reads Word insertions and deletions', () => {
    const bytes = writeDocx(sample());
    const xml = readZipText(readZip(bytes), 'word/document.xml')!;
    expect(xml).toContain('<w:ins w:id="1" w:author="Ann" w:date="2026-10-02T09:30:00Z"><w:r><w:t xml:space="preserve">quick </w:t></w:r></w:ins>');
    expect(xml).toContain('<w:del w:id="2" w:author="Bob" w:date="2026-10-02T10:00:00Z"><w:r><w:delText xml:space="preserve">brown</w:delText></w:r></w:del>');
    expect(runs(readDocx(bytes))).toEqual(runs(sample()));
  });

  it('writes and reads OpenDocument tracked changes', () => {
    const bytes = writeOdt(sample());
    const xml = readZipText(readZip(bytes), 'content.xml')!;
    expect(xml).toMatch(/<text:tracked-changes>.*<text:changed-region [^>]*text:id="ct1"[^>]*><text:insertion><office:change-info><dc:creator>Ann<\/dc:creator><dc:date>2026-10-02T09:30:00Z<\/dc:date><\/office:change-info><\/text:insertion><\/text:changed-region>/);
    expect(xml).toMatch(/<text:deletion><office:change-info><dc:creator>Bob<\/dc:creator>.*<\/office:change-info><text:p>brown<\/text:p><\/text:deletion>/);
    expect(xml).toMatch(/<text:change-start text:change-id="ct1"\/>quick(<text:s\/>| )<text:change-end text:change-id="ct1"\/><text:change text:change-id="ct2"\/>/);
    expect(runs(readOdt(bytes))).toEqual(runs(sample()));
  });

  it('writes and reads CriticMarkup additions and deletions', () => {
    const md = writeMarkdown(sample());
    expect(md).toContain('The {++quick ++}{--brown--} fox.');
    expect(runs(readMarkdown(md))).toEqual([{ text: 'The ' }, { text: 'quick ', inserted: {} }, { text: 'brown', deleted: {} }, { text: ' fox.' }]);
  });

  it('accepts every change for formats without them', () => {
    expect(runs(acceptAll(sample()))).toEqual([{ text: 'The quick  fox.' }]);
  });
});

describe('REV-005 tracked changes: editing', () => {
  const state = (): EditorState => EditorState.create({ doc: blocksToPm(sample().blocks), schema });
  const text = (s: EditorState): unknown => (pmToBlocks(s.doc)[0] as Paragraph).runs;

  it('keeps the changes through the editor', () => {
    expect(text(state())).toEqual(runs(sample()));
  });

  it('records typing as an insertion and deleting as a deletion', () => {
    let s = EditorState.create({ doc: blocksToPm([{ type: 'paragraph', style: 'normal', runs: [{ text: 'abc' }] }]), schema });
    const by = { author: 'Cy', date: '2026-10-02T11:00:00Z' };
    // Typing "X" after "a".
    s = s.apply(trackTransaction(s, s.tr.insertText('X', 2), by));
    expect(text(s)).toEqual([{ text: 'a' }, { text: 'X', inserted: by }, { text: 'bc' }]);
    // Deleting "b": it stays, struck out.
    s = s.apply(trackTransaction(s, s.tr.delete(3, 4), by));
    expect(text(s)).toEqual([{ text: 'a' }, { text: 'X', inserted: by }, { text: 'b', deleted: by }, { text: 'c' }]);
    // Deleting an insertion removes it for good.
    s = s.apply(trackTransaction(s, s.tr.delete(2, 3), by));
    expect(text(s)).toEqual([{ text: 'a' }, { text: 'b', deleted: by }, { text: 'c' }]);
    // Replacing a selection: the old text struck out, the new text inserted after it.
    s = s.apply(trackTransaction(s, s.tr.setSelection(TextSelection.create(s.doc, 3, 4)).replaceSelectionWith(schema.text('Z')), by));
    expect(text(s)).toEqual([{ text: 'a' }, { text: 'bc', deleted: by }, { text: 'Z', inserted: by }]);
  });

  it('lists, accepts and rejects changes', () => {
    let s = state();
    const changes = changesOf(s.doc);
    expect(changes.map((c) => [c.kind, c.text, c.author])).toEqual([
      ['insert', 'quick ', 'Ann'],
      ['delete', 'brown', 'Bob'],
    ]);
    s = s.apply(decide(s, changes[0]!, true)!);
    expect(text(s)).toEqual([{ text: 'The quick ' }, { text: 'brown', deleted: BOB }, { text: ' fox.' }]);
    s = s.apply(decide(s, changesOf(s.doc)[0]!, false)!);
    expect(text(s)).toEqual([{ text: 'The quick brown fox.' }]);
  });
});
