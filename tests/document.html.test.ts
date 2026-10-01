import { describe, expect, it } from 'vitest';
import { emptyDocument, paragraph, type Block, type Paragraph } from '../src/document/model';
import { blocksToDom, domToBlocks, sanitizeHtml, isSafeUrl } from '../src/document/html';

const toHtml = (blocks: Block[]): string => {
  const div = document.createElement('div');
  div.append(blocksToDom(blocks, document, () => undefined));
  return div.innerHTML;
};
const fromHtml = (html: string): Block[] => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return domToBlocks(div, () => undefined);
};

describe('DOC-003 model <-> HTML bridge', () => {
  it('renders headings, alignment and inline formatting', () => {
    const html = toHtml([
      paragraph('Title', { style: 'h1' }),
      { type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: 'b', bold: true }, { text: 'i', italic: true }] },
    ]);
    expect(html).toBe('<h1>Title</h1><p style="text-align: center;"><strong>b</strong><em>i</em></p>');
  });

  it('round-trips nested lists, tables, quotes, code and links', () => {
    const blocks: Block[] = [
      paragraph('one', { list: { ordered: true, level: 0 } }),
      paragraph('sub', { list: { ordered: false, level: 1 } }),
      paragraph('two', { list: { ordered: true, level: 0 } }),
      { type: 'table', rows: [[{ blocks: [paragraph('A1')] }, { blocks: [paragraph('B1')] }]] },
      paragraph('said', { style: 'quote' }),
      paragraph('let x = 1;\nx++;', { style: 'code' }),
      { type: 'paragraph', style: 'normal', runs: [{ text: 'site', link: 'https://example.org' }, { text: ' and ' }, { text: 'f()', code: true }] },
      { type: 'rule' },
    ];
    expect(fromHtml(toHtml(blocks))).toEqual(blocks);
  });

  it('parses contenteditable output with CSS styles and stray text', () => {
    const blocks = fromHtml(
      'loose <span style="font-weight: bold">bold</span><div style="text-align:right"><span style="text-decoration: underline line-through">u</span></div>',
    );
    expect(blocks).toEqual([
      { type: 'paragraph', style: 'normal', runs: [{ text: 'loose ' }, { text: 'bold', bold: true }] },
      { type: 'paragraph', style: 'normal', align: 'right', runs: [{ text: 'u', underline: true, strike: true }] },
    ] satisfies Paragraph[]);
  });

  it('collapses whitespace and converts <br> to line breaks', () => {
    expect(fromHtml('<p>  a \n  b<br>c&nbsp;&nbsp;d </p>')).toEqual([
      { type: 'paragraph', style: 'normal', runs: [{ text: 'a b\nc  d' }] },
    ]);
  });
});

describe('DOC-008 paste sanitisation', () => {
  it('drops scripts, event handlers and dangerous URLs', () => {
    const html = sanitizeHtml(
      '<p onclick="alert(1)">Hi<script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="http://evil/x.png" onerror="alert(1)"></p><style>p{}</style>',
    );
    expect(html).toBe('<p>Hix</p>');
  });

  it('accepts only safe URL schemes', () => {
    expect(isSafeUrl('https://a.b')).toBe(true);
    expect(isSafeUrl('mailto:a@b')).toBe(true);
    expect(isSafeUrl('./assets/images/a.png')).toBe(true);
    expect(isSafeUrl('#anchor')).toBe(true);
    expect(isSafeUrl(' JavaScript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,x')).toBe(false);
    expect(isSafeUrl('vbscript:x')).toBe(false);
  });

  it('keeps an empty document editable', () => {
    expect(toHtml(emptyDocument().blocks)).toBe('<p><br></p>');
  });
});

describe('font size and colour runs (presentations)', () => {
  it('round-trips size (pt) and colour through the DOM', () => {
    const blocks: Block[] = [{ type: 'paragraph', style: 'normal', runs: [{ text: 'Big', size: 32, color: '#ff0000', bold: true }, { text: ' small', size: 12 }] }];
    expect(fromHtml(toHtml(blocks))).toEqual(blocks);
  });
  it('reads pasted rgb() colours and px sizes', () => {
    expect(fromHtml('<p><span style="color: rgb(0, 128, 255); font-size: 16px">x</span></p>')).toEqual([
      { type: 'paragraph', style: 'normal', runs: [{ text: 'x', size: 12, color: '#0080ff' }] },
    ]);
  });
});
