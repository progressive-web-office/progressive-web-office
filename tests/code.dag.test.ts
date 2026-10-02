import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/code/reactive';
import { cellStates, dagSource, edgesOf } from '../src/code/dag';

const py = (defs: string[], refs: string[]) => ({ lang: 'python' as const, deps: { defs, refs } });

describe('CODE-015 dependency graph of the cells', () => {
  // 0 defines a, b; 1 uses a; 2 uses a and b and errs; 3 uses 2's c; 4 alone, never run.
  const cells = [py(['a', 'b'], []), py(['d'], ['a', 'print']), py(['c'], ['a', 'b']), py([], ['c']), py(['_x'], [])];
  const graph = buildGraph(cells);

  it('labels each link with the names it carries', () => {
    expect(edgesOf(cells, graph)).toEqual([
      { from: 0, to: 1, names: ['a'] },
      { from: 0, to: 2, names: ['a', 'b'] },
      { from: 2, to: 3, names: ['c'] },
    ]);
  });

  it('gives each cell a state: run, failed, blocked by a failed cell, out of date, not run', () => {
    const outputs = [{ text: '' }, { text: '1' }, { text: 'Error', error: true }, { text: 'NameError', error: true }, undefined];
    expect(cellStates(graph, outputs, new Set([1]))).toEqual(['ok', 'stale', 'error', 'blocked', 'new']);
    // A name defined twice is an error of the graph itself.
    const twice = buildGraph([py(['x'], []), py(['x'], [])]);
    expect(cellStates(twice, [{ text: '' }, { text: '' }], new Set())).toEqual(['error', 'error']);
  });

  it('writes a Mermaid flowchart with escaped labels and one class per state', () => {
    const source = dagSource(
      [
        { label: '1 · Python', defs: ['a', 'b'], state: 'ok' },
        { label: '2 · "JS" <x>', defs: [], state: 'error' },
      ],
      [{ from: 0, to: 1, names: ['a'] }],
    );
    expect(source).toContain('flowchart TB');
    expect(source).toContain('c0["1 · Python<br/>a, b"]:::ok');
    expect(source).toContain('c1["2 · #quot;JS#quot; #lt;x#gt;"]:::error');
    expect(source).toContain('c0 -->|a| c1');
    expect(source).toMatch(/classDef blocked .*stroke-dasharray/);
  });
});
