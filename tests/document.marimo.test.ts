import { describe, expect, it } from 'vitest';
import { cellDefs, isMarimo, readMarimo, writeMarimo } from '../src/document/marimo';
import type { Paragraph } from '../src/document/model';
import { MARIMO_NB } from './fixtures-marimo';

describe('DOC-039 marimo notebooks', () => {
  it('recognises a marimo notebook', () => {
    expect(isMarimo(MARIMO_NB)).toBe(true);
    expect(isMarimo('import marimo\nprint(1)\n')).toBe(false);
  });

  it('reads text cells as text and the others as Python cells', () => {
    const doc = readMarimo(MARIMO_NB);
    const cells = doc.blocks.flatMap((b) => (b.type === 'paragraph' ? b.runs.filter((r) => 'cell' in r) : []));
    expect(cells.map((c) => ('cell' in c ? c.cell : ''))).toEqual(['import marimo as mo', 'x = 0', 'y = 1', 'x']);
    const text = doc.blocks.find((b): b is Paragraph => b.type === 'paragraph' && b.cellHeader !== undefined)!;
    expect(text.runs.map((r) => ('text' in r ? r.text : '')).join('')).toContain('marimo knows how your cells are related');
    expect(doc.blocks.some((b) => b.type === 'paragraph' && b.runs.some((r) => 'text' in r && r.bold && r.text === 'variables'))).toBe(true);
  });

  it('gives the file back when nothing changed', () => {
    expect(writeMarimo(readMarimo(MARIMO_NB))).toBe(MARIMO_NB);
  });

  it('writes an edited cell with its arguments and returned names', () => {
    const doc = readMarimo(MARIMO_NB);
    const cell = doc.blocks.flatMap((b) => (b.type === 'paragraph' ? b.runs : [])).find((r) => 'cell' in r && r.cell === 'y = 1') as { cell: string };
    cell.cell = 'y = x + 1\nz, w = y, 2';
    const out = writeMarimo(doc);
    expect(out).toContain('@app.cell\ndef _(x):\n    y = x + 1\n    z, w = y, 2\n    return (w, y, z)\n');
    expect(out).toContain('@app.cell\ndef _():\n    x = 0\n    return (x,)\n');
  });

  it('finds the names a cell defines', () => {
    expect(cellDefs('import numpy as np\nfrom math import pi, tau as T\nimport os.path\ndef f(a):\n    b = 1\nclass C: pass\nx = y = 2\n_private = 3\nfor i in range(3):\n    pass\ns = "a = 1"')).toEqual(['C', 'T', 'f', 'i', 'np', 'os', 'pi', 's', 'x', 'y']);
  });
});
