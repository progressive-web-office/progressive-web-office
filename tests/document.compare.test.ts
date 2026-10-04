import { describe, expect, it } from 'vitest';
import { compareDocuments } from '../src/document/compare';
import { acceptAll } from '../src/document/changes';
import type { Block, Paragraph, RichDocument, TextRun } from '../src/document/model';

const p = (text: string, extra: Partial<Paragraph> = {}): Paragraph => ({ type: 'paragraph', style: 'normal', runs: text ? [{ text }] : [], ...extra });
const doc = (...blocks: Block[]): RichDocument => ({ blocks, meta: {}, resources: new Map() }) as unknown as RichDocument;
const by = { author: 'v2.odt' };
const text = (b: Block, filter: (r: TextRun) => boolean = () => true) => (b as Paragraph).runs.map((r) => r as TextRun).filter(filter).map((r) => r.text).join('');
/** The text with [-deleted-] and {+inserted+} marks. */
const marked = (b: Block) => (b as Paragraph).runs.map((r) => ((r as TextRun).deleted ? `[-${(r as TextRun).text}-]` : (r as TextRun).inserted ? `{+${(r as TextRun).text}+}` : (r as TextRun).text)).join('');

describe('DOC-052 comparing two versions', () => {
  it('marks the words changed in a paragraph', () => {
    const r = compareDocuments(doc(p('The quick brown fox jumps.')), doc(p('The quick red fox leaps high.')), by);
    expect(r.doc.blocks.map(marked)).toEqual(['The quick [-brown-]{+red+} fox [-jumps-]{+leaps high+}.']);
    expect([r.inserted, r.deleted, r.paragraphs]).toEqual([3, 2, 1]);
    const run = (r.doc.blocks[0] as Paragraph).runs.find((x) => (x as TextRun).inserted) as TextRun;
    expect(run.inserted).toEqual(by);
  });

  it('finds paragraphs added, removed and kept, and becomes either version', () => {
    const before = doc(p('Title', { style: 'h1' }), p('First paragraph.'), p('Removed paragraph about something else entirely.'), p('Last one.'));
    const after = doc(p('Title', { style: 'h1' }), p('First paragraph, longer now.'), p('Last one.'), p('A brand new ending.'));
    const r = compareDocuments(before, after, by);
    expect(r.doc.blocks.map(marked)).toEqual(['Title', 'First paragraph{+, longer now+}.', '[-Removed paragraph about something else entirely.-]', 'Last one.', '{+A brand new ending.+}']);
    // Accepting every change gives the newer version.
    expect(acceptAll(r.doc).blocks.map((b) => text(b))).toEqual(after.blocks.map((b) => text(b)));
    // The older one: what is not inserted.
    expect(r.doc.blocks.map((b) => text(b, (x) => !x.inserted)).filter(Boolean)).toEqual(before.blocks.map((b) => text(b)));
  });

  it('keeps the formatting of the newer version and ignores changes already tracked', () => {
    const before = doc(p('', { runs: [{ text: 'Plain ' }, { text: 'old', deleted: { author: 'x' } }, { text: 'words' }] }));
    const after = doc(p('', { runs: [{ text: 'Plain ', bold: true }, { text: 'words' }] }));
    const r = compareDocuments(before, after, by);
    expect(r.inserted + r.deleted).toBe(0);
    expect(((r.doc.blocks[0] as Paragraph).runs[0] as TextRun).bold).toBe(true);
  });

  it('counts other blocks changed', () => {
    const table = { type: 'rule' } as Block;
    const r = compareDocuments(doc(p('a'), table), doc(p('a')), by);
    expect(r.otherBlocks).toBe(1);
    expect(r.doc.blocks).toHaveLength(1);
  });
});
