import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { cellsAsBlocks } from '../src/document/code-cells';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import type { Paragraph, RichDocument } from '../src/document/model';

const doc = (hidden: boolean): RichDocument => ({
  blocks: [{ type: 'paragraph', style: 'normal', runs: [{ cell: 'print(6 * 7)', lang: 'python', ...(hidden ? { hidden: true } : {}), output: { text: '42\n' } }] }],
  resources: new Map(),
  meta: {},
});

describe('CODE-013 cells whose code is hidden', () => {
  it('keeps the hidden code in Markdown with the {run hide} flag', () => {
    const md = writeMarkdown(doc(true));
    expect(md).toContain('```python {run hide}\nprint(6 * 7)\n```');
    expect(md).toContain('```text {output}\n42\n```');
    expect((readMarkdown(md).blocks[0] as Paragraph).runs).toEqual((doc(true).blocks[0] as Paragraph).runs);
    expect(writeMarkdown(doc(false))).toContain('```python {run}\n');
  });

  it('keeps it through the editor', () => {
    expect(pmToBlocks(blocksToPm(doc(true).blocks))).toEqual(doc(true).blocks);
    expect(pmToBlocks(blocksToPm(doc(false).blocks))).toEqual(doc(false).blocks);
  });

  it('writes only the output of a hidden cell in other formats', () => {
    const shown = cellsAsBlocks(doc(false)).blocks as Paragraph[];
    expect(shown.map((p) => p.runs.map((r) => ('text' in r ? r.text : '')).join(''))).toEqual(['print(6 * 7)', '42']);
    const hidden = cellsAsBlocks(doc(true)).blocks as Paragraph[];
    expect(hidden.map((p) => p.runs.map((r) => ('text' in r ? r.text : '')).join(''))).toEqual(['42']);
  });
});
