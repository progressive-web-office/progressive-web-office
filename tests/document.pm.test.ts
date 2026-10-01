import { describe, expect, it } from 'vitest';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { schema } from '../src/document/pm/schema';
import { readDocument, writeDocument } from '../src/document/io';
import { normalizeRuns, type Block } from '../src/document/model';

const MARKDOWN = `# Title

Some **bold**, *italic*, ~~struck~~, \`code\` and a [link](https://example.org).
A second line.

## Lists

- one
- two
  - nested
1. first
2. second

> A quote

\`\`\`
code block
  indented
\`\`\`

| A | B |
|---|---|
| 1 | **2** |

---

Inline $x^2$ and display:

$$\\int_0^1 f$$

\`\`\`mermaid
graph TD; A-->B
\`\`\`

\`\`\`python {run}
print(1)
\`\`\`
\`\`\`text {output}
1
\`\`\`
`;

/** Blocks with runs normalised, as editors would see them. */
const norm = (blocks: Block[]): Block[] =>
  blocks.map((b) =>
    b.type === 'paragraph'
      ? { ...b, runs: normalizeRuns(b.runs) }
      : b.type === 'table'
        ? { ...b, rows: b.rows.map((r) => r.map((c) => ({ blocks: c.blocks.map((p) => ({ ...p, runs: normalizeRuns(p.runs) })) }))) }
        : b,
  );

describe('DOC-018 ProseMirror document model', () => {
  it('converts a rich Markdown document without loss', async () => {
    const doc = await readDocument('md', new TextEncoder().encode(MARKDOWN));
    const pm = blocksToPm(doc.blocks);
    pm.check(); // valid against the schema
    expect(pmToBlocks(pm)).toEqual(norm(doc.blocks));
    // Every kind of content made it through.
    const types = new Set<string>();
    pm.descendants((n) => void types.add(n.type.name));
    for (const t of ['paragraph', 'table', 'table_cell', 'horizontal_rule', 'hard_break', 'math', 'diagram', 'code_cell']) expect(types).toContain(t);
  });

  it('converts documents read from DOCX and ODT without loss', async () => {
    const md = await readDocument('md', new TextEncoder().encode(MARKDOWN));
    for (const format of ['docx', 'odt'] as const) {
      const doc = await readDocument(format, writeDocument(md, format));
      const pm = blocksToPm(doc.blocks);
      pm.check();
      expect(pmToBlocks(pm)).toEqual(norm(doc.blocks));
    }
  });

  it('keeps alignment, list levels, images, sizes and colours', () => {
    const blocks: Block[] = [
      { type: 'paragraph', style: 'normal', align: 'center', runs: [{ text: 'Big red', size: 18, color: '#cc0000', bold: true }] },
      { type: 'paragraph', style: 'normal', list: { ordered: true, level: 2 }, runs: [{ text: 'deep' }] },
      { type: 'paragraph', style: 'normal', runs: [{ image: 'img1', alt: 'A cat', width: 120, height: 80 }, { text: ' tail\nbreak', italic: true }] },
      { type: 'paragraph', style: 'normal', runs: [] },
    ];
    expect(pmToBlocks(blocksToPm(blocks))).toEqual(blocks);
  });

  it('always yields a valid document, even when empty', () => {
    const pm = blocksToPm([]);
    pm.check();
    expect(pmToBlocks(pm)).toEqual([{ type: 'paragraph', style: 'normal', runs: [] }]);
    expect(schema.nodes.table).toBeDefined();
  });
});
