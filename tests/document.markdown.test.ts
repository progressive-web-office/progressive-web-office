import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { paragraph, type Block, type RichDocument } from '../src/document/model';
import { PNG_1PX, richSample } from './fixtures';

const md = (text: string) => readMarkdown(text).blocks;

describe('MD-001 Markdown reader', () => {
  it('parses headings, emphasis, code, links and breaks', () => {
    expect(md('# T\n\nSome **bold** and *it* ~~s~~ `c` [l](https://x.y)  \nnext')).toEqual([
      paragraph('T', { style: 'h1' }),
      {
        type: 'paragraph',
        style: 'normal',
        runs: [
          { text: 'Some ' },
          { text: 'bold', bold: true },
          { text: ' and ' },
          { text: 'it', italic: true },
          { text: ' ' },
          { text: 's', strike: true },
          { text: ' ' },
          { text: 'c', code: true },
          { text: ' ' },
          { text: 'l', link: 'https://x.y' },
          { text: '\nnext' },
        ],
      },
    ]);
  });

  it('parses nested lists, quotes, fences, rules and GFM tables', () => {
    const blocks = md('- a\n  1. b\n- c\n\n> q\n\n```js\nx = 1\ny\n```\n\n---\n\n| h | i |\n|---|---|\n| 1 | **2** |\n');
    expect(blocks).toEqual([
      paragraph('a', { list: { ordered: false, level: 0 } }),
      paragraph('b', { list: { ordered: true, level: 1 } }),
      paragraph('c', { list: { ordered: false, level: 0 } }),
      paragraph('q', { style: 'quote' }),
      paragraph('x = 1\ny', { style: 'code' }),
      { type: 'rule' },
      {
        type: 'table',
        header: true,
        rows: [
          [{ blocks: [paragraph('h')] }, { blocks: [paragraph('i')] }],
          [{ blocks: [paragraph('1')] }, { blocks: [{ type: 'paragraph', style: 'normal', runs: [{ text: '2', bold: true }] }] }],
        ],
      },
    ] satisfies Block[]);
  });

  it('MD-003 treats raw HTML as text (except <u> and <br>)', () => {
    expect(md('<script>alert(1)</script>\n\nx <b onclick="y">z</b> <u>under</u>')).toEqual([
      paragraph('<script>alert(1)</script>'),
      { type: 'paragraph', style: 'normal', runs: [{ text: 'x <b onclick="y">z</b> ' }, { text: 'under', underline: true }] },
    ]);
  });

  it('embeds data: URI images and keeps other image references as external', () => {
    const b64 = btoa(String.fromCharCode(...PNG_1PX));
    const doc = readMarkdown(`![px](data:image/png;base64,${b64}) ![far](https://e.org/a.png)`);
    const p = doc.blocks[0] as { runs: unknown[] };
    const key = [...doc.resources.keys()][0]!;
    expect(p.runs).toEqual([{ image: key, alt: 'px' }, { text: ' ' }, { image: '', alt: 'far', src: 'https://e.org/a.png' }]);
    expect(doc.resources.get(key)!.data).toEqual(PNG_1PX);
  });

  it('resolves relative images through a resolver', () => {
    const doc = readMarkdown('![x](./assets/images/p.png)', {
      resolveImage: (src) => (src === './assets/images/p.png' ? { data: PNG_1PX, mediaType: 'image/png', name: 'p.png' } : undefined),
    });
    expect(doc.resources.size).toBe(1);
  });
});

describe('MD-002 Markdown writer', () => {
  const roundTrip = (doc: RichDocument) => readMarkdown(writeMarkdown(doc)).blocks;

  it('round-trips the rich sample (except alignment, which Markdown cannot express)', () => {
    const doc = richSample();
    const expected = doc.blocks.map((b) => (b.type === 'paragraph' ? (({ align: _a, ...rest }) => rest)(b) : b));
    const back = readMarkdown(writeMarkdown(doc, { imageUrl: (key) => `img/${key}.png` }), {
      resolveImage: (src) => {
        const key = /img\/(.+)\.png/.exec(src)?.[1];
        const res = key ? doc.resources.get(key) : undefined;
        return res && { data: res.data, mediaType: res.mediaType };
      },
    }).blocks;
    // image sizes are not representable in Markdown
    const strip = (bs: Block[]) => JSON.parse(JSON.stringify(bs).replace(/,"width":\d+,"height":\d+/g, ''));
    expect(strip(back)).toEqual(strip(expected));
  });

  it('escapes Markdown syntax in text', () => {
    const doc: RichDocument = { blocks: [paragraph('# not *a* heading [x] 1. `y` <b>')], resources: new Map(), meta: {} };
    expect(roundTrip(doc)).toEqual(doc.blocks);
  });

  it('keeps delimiters valid around spaces and nested formats', () => {
    const doc: RichDocument = {
      blocks: [
        {
          type: 'paragraph',
          style: 'normal',
          runs: [{ text: 'a ' }, { text: 'b ', bold: true }, { text: 'c', bold: true, italic: true }, { text: ' d', italic: true }, { text: ' e' }],
        },
      ],
      resources: new Map(),
      meta: {},
    };
    // Output: `a **b *c*** *d* e` — whitespace at a closing boundary moves outside the markers.
    expect(roundTrip(doc)).toEqual([
      {
        type: 'paragraph',
        style: 'normal',
        runs: [{ text: 'a ' }, { text: 'b ', bold: true }, { text: 'c', bold: true, italic: true }, { text: ' ' }, { text: 'd', italic: true }, { text: ' e' }],
      },
    ]);
  });

  it('writes data: URIs for images by default (self-contained .md)', () => {
    const text = writeMarkdown(richSample());
    expect(text).toMatch(/!\[pixel\]\(data:image\/png;base64,[A-Za-z0-9+/=]+\)/);
  });
});
