import { describe, expect, it } from 'vitest';
import { modelRef, putBuffers, refsOf, removeBuffers } from '../src/code/widgets/state';
import { pureWheel, wheelList } from '../src/code/widgets/packages';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { cellsAsBlocks } from '../src/document/code-cells';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import type { CodeCellRun, Paragraph, RichDocument } from '../src/document/model';

describe('CODE-016 widget state on the wire', () => {
  it('takes binary values out of the state and puts them back', () => {
    const data = new Float32Array([1, 2, 3]);
    const { state, paths, buffers } = removeBuffers({ value: 2, series: { y: data, name: 'a' }, list: [new Uint8Array([7])] });
    expect(state).toEqual({ value: 2, series: { y: null, name: 'a' }, list: [null] });
    expect(paths).toEqual([['series', 'y'], ['list', 0]]);
    const back = putBuffers(state, paths, buffers) as { series: { y: DataView }; list: DataView[] };
    expect(back.series.y.getFloat32(4, true)).toBe(2);
    expect(back.list[0]!.getUint8(0)).toBe(7);
  });

  it('reads references to other widgets (AFM and Jupyter forms)', () => {
    expect(modelRef('anywidget:abc')).toBe('abc');
    expect(modelRef('IPY_MODEL_def')).toBe('def');
    expect(modelRef('text')).toBeUndefined();
    expect(refsOf({ children: ['IPY_MODEL_a', 'IPY_MODEL_b'], layout: 'IPY_MODEL_c', control: 'anywidget:d', label: 'x' })).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('CODE-016 packages', () => {
  it('reads a list of wheels relative to it, as the instruments demos publish it', () => {
    expect(wheelList('# core first\nanywidget_instruments-0.1-py3-none-any.whl\n\nindustrial/x-0.1-py3-none-any.whl  # then\n', 'https://example.org/demo/public/wheel.txt')).toEqual([
      'https://example.org/demo/public/anywidget_instruments-0.1-py3-none-any.whl',
      'https://example.org/demo/public/industrial/x-0.1-py3-none-any.whl',
    ]);
  });

  it('picks the pure-Python wheel of a release of the package index', () => {
    expect(
      pureWheel({
        urls: [
          { packagetype: 'sdist', filename: 'x-1.0.tar.gz', url: 'https://f/x-1.0.tar.gz' },
          { packagetype: 'bdist_wheel', filename: 'x-1.0-cp312-cp312-manylinux.whl', url: 'https://f/bin.whl' },
          { packagetype: 'bdist_wheel', filename: 'x-1.0-py3-none-any.whl', url: 'https://f/x-1.0-py3-none-any.whl' },
        ],
      }),
    ).toBe('https://f/x-1.0-py3-none-any.whl');
    expect(pureWheel({ urls: [] })).toBeUndefined();
  });
});

describe('CODE-016 widgets in the document', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const doc = (): RichDocument => ({
    blocks: [{ type: 'paragraph', style: 'normal', runs: [{ cell: 'gauge', lang: 'python', output: { text: '', widgets: [{ id: 'm1', snapshot: 'w1' }] } }] }],
    resources: new Map([['w1', { data: PNG, mediaType: 'image/png' }]]),
    meta: {},
  });

  it('keeps a widget as its picture in Markdown', () => {
    const md = writeMarkdown(doc());
    expect(md).toMatch(/!\[Widget\]\(data:image\/png;base64,[^)]+ "widget"\)/);
    const back = readMarkdown(md);
    const run = (back.blocks[0] as Paragraph).runs[0] as CodeCellRun;
    expect(run.output?.widgets).toHaveLength(1);
    expect(back.resources.get(run.output!.widgets![0]!.snapshot!)?.data).toEqual(PNG);
  });

  it('keeps it through the editor, and exports its picture to other formats', () => {
    expect(pmToBlocks(blocksToPm(doc().blocks))).toEqual(doc().blocks);
    const out = cellsAsBlocks(doc()).blocks as Paragraph[];
    expect(out.at(-1)!.runs).toEqual([{ image: 'w1', alt: 'Output' }]);
  });
});
