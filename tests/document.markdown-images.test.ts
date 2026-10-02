import { describe, expect, it } from 'vitest';
import { imageRefs, readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { writeMdz } from '../src/document/mdz-writer';
import { writeDocx } from '../src/document/docx-writer';
import type { Paragraph } from '../src/document/model';
import { readZip } from '../src/core/zip';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const note = [
  '# Results',
  '',
  '![Voltage](<img/photo été.png> "Fig")',
  '',
  '<p align="center"><img src="img/diagram.png" alt="Diagram" width="300"></p>',
  '',
  'Inline <img src="img/icon.png" alt="icon"> and ![[logo.png]].',
  '',
].join('\n');

describe('MD-018 pictures of a Markdown note', () => {
  it('lists every picture reference: links, HTML and embeds', () => {
    expect(imageRefs(note).map((r) => decodeURI(r))).toEqual(['img/photo été.png', 'img/diagram.png', 'img/icon.png', 'logo.png']);
  });

  it('reads the pictures, keeps their links and writes them back as links', () => {
    const files = new Map(imageRefs(note).map((r) => [r, { data: PNG, mediaType: 'image/png', name: decodeURI(r).split('/').pop()! }]));
    const doc = readMarkdown(note, { resolveImage: (src) => files.get(src), keepImageLinks: true });
    const images = doc.blocks.flatMap((b) => (b as Paragraph).runs ?? []).filter((r) => 'image' in r);
    expect(images.map((r) => ('image' in r ? [!!r.image, r.alt ?? ''] : []))).toEqual([
      [true, 'Voltage'],
      [true, 'Diagram'],
      [true, 'icon'],
      [true, ''],
    ]);
    expect(doc.resources.size).toBe(1); // the same bytes, kept once
    const md = writeMarkdown(doc);
    expect(md).toContain('![Voltage](img/photo%20été.png "Fig")'.replace(' "Fig"', ''));
    expect(md).toContain('![Diagram](img/diagram.png)');
    expect(md).toContain('![[logo.png]]');
    expect(md).not.toContain('data:image');
  });

  it('embeds the pictures of a note read on its own in a standalone .md', () => {
    const files = new Map(imageRefs(note).map((r) => [r, { data: PNG, mediaType: 'image/png', name: 'p.png' }]));
    const md = writeMarkdown(readMarkdown(note, { resolveImage: (src) => files.get(src) }));
    expect(md).toContain('![Voltage](data:image/png;base64,');
  });

  it('embeds the pictures in MDZ and Word exports', () => {
    const files = new Map(imageRefs(note).map((r) => [r, { data: PNG, mediaType: 'image/png', name: 'p.png' }]));
    const doc = readMarkdown(note, { resolveImage: (src) => files.get(src) });
    const mdz = readZip(writeMdz(doc));
    expect(Object.keys(mdz).some((p) => /^assets\/images\/.+\.png$/.test(p))).toBe(true);
    expect(new TextDecoder().decode(mdz['index.md'])).toMatch(/!\[Voltage\]\(\.\/assets\/images\/[^)]+\.png\)/);
    const docx = readZip(writeDocx(doc));
    expect(Object.keys(docx).some((p) => /^word\/media\//.test(p))).toBe(true);
  });
});

describe('MD-018 pictures of a ZIP of notes', () => {
  it('reads pictures with accents and HTML pictures from the archive', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const { readMdz } = await import('../src/document/mdz-reader');
    const zip = zipSync({ 'notes/a.md': strToU8('# A\n\n![x](<img/photo été.png>)\n\n<img src="img/b.png" alt="b">\n'), 'notes/img/photo été.png': PNG, 'notes/img/b.png': PNG });
    const doc = await readMdz(zip);
    const images = doc.blocks.flatMap((b) => (b as Paragraph).runs ?? []).filter((r) => 'image' in r && r.image);
    expect(images).toHaveLength(2);
  });
});
