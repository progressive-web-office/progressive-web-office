import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { readDocument, writeDocumentAsync } from '../src/document/io';
import { emptyDocument, type Block, type RichDocument } from '../src/document/model';
import { blocksToDom, domToBlocks } from '../src/document/html';
import { readZip, readZipText } from '../src/core/zip';

const mathDoc = (): RichDocument => {
  const doc = emptyDocument();
  doc.blocks = [
    { type: 'paragraph', style: 'normal', runs: [{ text: 'Energy ' }, { math: 'E=mc^{2}' }, { text: ' and more.' }] },
    { type: 'paragraph', style: 'normal', runs: [{ math: '\\frac{a+b}{2}', display: true }] },
  ];
  return doc;
};
const norm = (blocks: Block[]) => JSON.parse(JSON.stringify(blocks).replace(/"math":"([^"]*)"/g, (_m, s: string) => `"math":"${s.replace(/\s+/g, '').replace(/\{(\w)\}/g, '$1')}"`));

describe('MATH-003 Markdown equations', () => {
  it('parses $inline$ and $$display$$ math, ignoring escaped and currency dollars', () => {
    expect(readMarkdown('Cost $5 and $10, \\$x\\$, area $\\pi r^2$.\n\n$$\n\\int_0^1 x\\,dx\n$$\n').blocks).toEqual([
      { type: 'paragraph', style: 'normal', runs: [{ text: 'Cost $5 and $10, $x$, area ' }, { math: '\\pi r^2' }, { text: '.' }] },
      { type: 'paragraph', style: 'normal', runs: [{ math: '\\int_0^1 x\\,dx', display: true }] },
    ]);
  });

  it('writes math back as $...$ and $$...$$', () => {
    const md = writeMarkdown(mathDoc());
    expect(md).toBe('Energy $E=mc^{2}$ and more\\.\n\n$$\n\\frac{a+b}{2}\n$$\n'.replace('more\\.', 'more.'));
    expect(readMarkdown(md).blocks).toEqual(mathDoc().blocks);
  });
});

describe('MATH-005 / MATH-004 DOCX and ODT equations', () => {
  it('writes OMML into DOCX and reads it back as LaTeX', async () => {
    const bytes = await writeDocumentAsync(mathDoc(), 'docx');
    const xml = readZipText(readZip(bytes), 'word/document.xml')!;
    expect(xml).toContain('<m:oMath>');
    expect(xml).toContain('<m:oMathPara>');
    const back = await readDocument('docx', bytes);
    expect(norm(back.blocks)).toEqual(norm(mathDoc().blocks));
  });

  it('embeds MathML formula objects into ODT and reads them back', async () => {
    const bytes = await writeDocumentAsync(mathDoc(), 'odt');
    const zip = readZip(bytes);
    expect(readZipText(zip, 'Formula1/content.xml')).toContain('<annotation encoding="application/x-tex">E=mc^{2}</annotation>');
    expect(readZipText(zip, 'META-INF/manifest.xml')).toContain('application/vnd.oasis.opendocument.formula');
    const back = await readDocument('odt', bytes);
    expect(back.blocks).toEqual(mathDoc().blocks);
  });
});

describe('MATH-001 editor bridge', () => {
  it('renders equations as non-editable math elements and reads them back', () => {
    const div = document.createElement('div');
    div.append(blocksToDom(mathDoc().blocks, document, () => undefined));
    const spans = div.querySelectorAll<HTMLElement>('span.math');
    expect(spans).toHaveLength(2);
    expect(spans[0]!.contentEditable).toBe('false');
    expect(domToBlocks(div, () => undefined)).toEqual(mathDoc().blocks);
  });
});
