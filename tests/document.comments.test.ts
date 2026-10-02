import { describe, expect, it } from 'vitest';
import { readDocx } from '../src/document/docx-reader';
import { writeDocx } from '../src/document/docx-writer';
import { readOdt } from '../src/document/odt-reader';
import { writeOdt } from '../src/document/odt-writer';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { commentThreads, pruneComments } from '../src/document/comments';
import type { DocComment, Paragraph, RichDocument } from '../src/document/model';
import { readZip, readZipText } from '../src/core/zip';

const COMMENTS: DocComment[] = [
  { id: 'c1', author: 'Ann Lee', initials: 'AL', date: '2026-10-02T09:30:00Z', text: 'Check this word.\nAnd this line.' },
  { id: 'c2', author: 'Bob', initials: 'B', date: '2026-10-02T10:00:00Z', text: 'Across two paragraphs', resolved: true },
  { id: 'c3', author: 'Bob', initials: 'B', date: '2026-10-02T11:00:00Z', text: 'Fixed.', parent: 'c1' },
];

const sample = (): RichDocument => ({
  blocks: [
    { type: 'paragraph', style: 'normal', runs: [{ text: 'Hello ' }, { text: 'world', bold: true, comments: ['c1'] }, { text: ' and ' }, { text: 'more', comments: ['c2'] }] },
    { type: 'paragraph', style: 'normal', runs: [{ text: 'next', comments: ['c2'] }, { text: ' paragraph.' }] },
  ],
  resources: new Map(),
  meta: {},
  comments: COMMENTS.map((c) => ({ ...c })),
});

const runsOf = (doc: RichDocument): unknown[] => doc.blocks.map((b) => (b as Paragraph).runs);

describe('REV-001 comments: model and editor', () => {
  it('orders threads by position, replies under their comment', () => {
    const threads = commentThreads(sample());
    expect(threads.map((th) => [th.comment.id, th.replies.map((r) => r.id), th.quote])).toEqual([
      ['c1', ['c3'], 'world'],
      ['c2', [], 'more next'],
    ]);
  });

  it('drops comments whose text was deleted, with their replies', () => {
    const doc = sample();
    (doc.blocks[0] as Paragraph).runs.splice(1, 1);
    pruneComments(doc);
    expect(doc.comments!.map((c) => c.id)).toEqual(['c2']);
  });

  it('keeps the comment ranges through the editor', () => {
    const doc = sample();
    expect(pmToBlocks(blocksToPm(doc.blocks))).toEqual(doc.blocks);
    const overlap: Paragraph = { type: 'paragraph', style: 'normal', runs: [{ text: 'a', comments: ['c1'] }, { text: 'b', comments: ['c1', 'c2'] }, { text: 'c', comments: ['c2'] }] };
    expect(pmToBlocks(blocksToPm([overlap]))).toEqual([overlap]);
  });
});

describe('REV-002 comments in DOCX', () => {
  it('writes Word comments with their ranges, replies and resolved state', () => {
    const zip = readZip(writeDocx(sample()));
    const body = readZipText(zip, 'word/document.xml')!;
    expect(body).toMatch(/<w:commentRangeStart w:id="0"\/>.*world.*<w:commentRangeEnd w:id="0"\/><w:r><w:rPr><w:rStyle w:val="CommentReference"\/><\/w:rPr><w:commentReference w:id="0"\/><\/w:r>/);
    expect(body).toMatch(/<w:commentRangeStart w:id="1"\/>.*more.*<\/w:p>.*next.*<w:commentRangeEnd w:id="1"\/>/);
    const comments = readZipText(zip, 'word/comments.xml')!;
    expect(comments).toContain('<w:comment w:id="0" w:author="Ann Lee" w:date="2026-10-02T09:30:00Z" w:initials="AL">');
    expect(comments).toContain('Check this word.');
    const ext = readZipText(zip, 'word/commentsExtended.xml')!;
    expect(ext).toMatch(/w15:paraId="[0-9A-F]{8}" w15:done="1"/);
    expect(ext).toMatch(/w15:paraIdParent="[0-9A-F]{8}"/);
    expect(readZipText(zip, '[Content_Types].xml')).toContain('wordprocessingml.comments+xml');
    expect(readZipText(zip, 'word/_rels/document.xml.rels')).toContain('relationships/comments"');
  });

  it('reads back the comments and their ranges', () => {
    const back = readDocx(writeDocx(sample()));
    expect(back.comments).toEqual(COMMENTS);
    expect(runsOf(back)).toEqual(runsOf(sample()));
  });
});

describe('REV-003 comments in ODT', () => {
  it('writes annotations with their ranges', () => {
    const content = readZipText(readZip(writeOdt(sample())), 'content.xml')!;
    expect(content).toMatch(/<office:annotation office:name="__Annotation__1"( [^>]*)?><dc:creator>Ann Lee<\/dc:creator><dc:date>2026-10-02T09:30:00Z<\/dc:date>/);
    expect(content).toContain('<text:p>Check this word.</text:p><text:p>And this line.</text:p></office:annotation>');
    expect(content).toMatch(/world.*<office:annotation-end office:name="__Annotation__1"\/>/);
    expect(content).toContain('loext:resolved="true"');
    expect(content).toContain('loext:parent-name="__Annotation__1"');
  });

  it('reads back the comments and their ranges', () => {
    const back = readOdt(writeOdt(sample()));
    expect(back.comments).toEqual(COMMENTS);
    expect(runsOf(back)).toEqual(runsOf(sample()));
  });
});

describe('REV-004 comments in Markdown (CriticMarkup)', () => {
  it('writes highlighted text followed by the comments', () => {
    const md = writeMarkdown(sample());
    expect(md).toContain('Hello {==**world**==}{>>Ann Lee: Check this word. And this line.<<}{>>Bob: Fixed.<<}');
    expect(md).toContain('{==more==}\n\n{==next==}{>>Bob: Across two paragraphs<<} paragraph.');
  });

  it('reads back threads and comments across paragraphs', async () => {
    const back = readMarkdown(writeMarkdown(sample()));
    expect(back.comments).toEqual([
      { id: 'c1', author: 'Ann Lee', text: 'Check this word. And this line.' },
      { id: 'c2', author: 'Bob', text: 'Fixed.', parent: 'c1' },
      { id: 'c3', author: 'Bob', text: 'Across two paragraphs' },
    ]);
    expect(runsOf(back)).toEqual([
      [{ text: 'Hello ' }, { text: 'world', bold: true, comments: ['c1'] }, { text: ' and ' }, { text: 'more', comments: ['c3'] }],
      [{ text: 'next', comments: ['c3'] }, { text: ' paragraph.' }],
    ]);
  });

  it('reads CriticMarkup comments', async () => {
    const doc = readMarkdown('A {==key idea==}{>>Ann: Explain it.<<} here, and a note{>>Just a remark<<}.\n');
    expect(doc.comments).toEqual([
      { id: 'c1', author: 'Ann', text: 'Explain it.' },
      { id: 'c2', text: 'Just a remark' },
    ]);
    // A comment on no highlighted text is on the word before it.
    expect((doc.blocks[0] as Paragraph).runs).toEqual([{ text: 'A ' }, { text: 'key idea', comments: ['c1'] }, { text: ' here, and a ' }, { text: 'note', comments: ['c2'] }, { text: '.' }]);
  });
});
