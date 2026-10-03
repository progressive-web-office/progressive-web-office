import { describe, expect, it } from 'vitest';
import { StringStream } from '@codemirror/language';
import { markdownMode, sourceLangOf } from '../src/document/source-mode';

const tokens = (lines: string[]) => {
  const state = markdownMode.startState!(2);
  return lines.map((line) => {
    const stream = new StringStream(line, 4, 2);
    const out: [string, string | null][] = [];
    while (!stream.eol()) {
      const style = markdownMode.token(stream, state);
      out.push([stream.current(), style ?? null]);
      stream.start = stream.pos;
    }
    return out;
  });
};

describe('DOC-044 source mode', () => {
  it('knows which files have a source', () => {
    expect(sourceLangOf('notes.md')).toBe('markdown');
    expect(sourceLangOf('paper.TEX')).toBe('latex');
    expect(sourceLangOf('letter.docx')).toBeUndefined();
    expect(sourceLangOf(undefined)).toBeUndefined();
  });

  it('colours Markdown: headings, emphasis, code, math, links, fences', () => {
    const [heading, text, fence, inFence, close, math] = tokens(['## Plan', 'A **b** `c` $x$ [l](u)', '```python', 'x = 1', '```', '$$']);
    expect(heading).toEqual([['## Plan', 'header']]);
    expect(text!.filter(([, s]) => s)).toEqual([['**b**', 'strong'], ['`c`', 'string'], ['$x$', 'string'], ['[l](u)', 'link']]);
    expect(fence).toEqual([['```python', 'meta']]);
    expect(inFence).toEqual([['x = 1', 'string']]);
    expect(close).toEqual([['```', 'meta']]);
    expect(math).toEqual([['$$', 'string']]);
  });
});
