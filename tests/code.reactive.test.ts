import { describe, expect, it } from 'vitest';
import { buildGraph, planRun, scriptDeps } from '../src/code/reactive';

const py = (defs: string[], refs: string[]) => ({ lang: 'python' as const, deps: { defs, refs } });
const js = (defs: string[], refs: string[]) => ({ lang: 'javascript' as const, deps: { defs, refs } });

describe('CODE-014 reactive cells: dependency graph', () => {
  it('links a cell to the cells defining the names it uses, by language', () => {
    const g = buildGraph([py(['a'], []), py(['b'], ['a']), js(['a'], []), js(['c'], ['a', 'b'])]);
    expect(g.parents).toEqual([[], [0], [], [2]]);
    expect(g.children).toEqual([[1], [], [3], []]);
    expect(g.errors.size).toBe(0);
  });

  it('reports a name defined in several cells, and cycles', () => {
    const g = buildGraph([py(['x'], []), py(['x'], []), py(['p'], ['q']), py(['q'], ['p']), py(['r'], ['p'])]);
    expect(g.errors.get(0)).toEqual({ kind: 'multiple', name: 'x', cells: [0, 1] });
    expect(g.errors.get(1)).toEqual({ kind: 'multiple', name: 'x', cells: [0, 1] });
    expect(g.errors.get(2)).toEqual({ kind: 'cycle', cells: [2, 3] });
    expect(g.errors.has(4)).toBe(false);
  });

  it('keeps names starting with _ to their cell, and ignores a cell using its own names', () => {
    const g = buildGraph([py(['_i', 'n'], ['n']), py(['_i'], ['_i', 'n'])]);
    expect(g.errors.size).toBe(0);
    expect(g.parents).toEqual([[], [0]]);
  });
});

describe('CODE-014 reactive cells: what runs', () => {
  // 0 → 1 → 2, 0 → 3; 4 alone.
  const g = buildGraph([py(['a'], []), py(['b'], ['a']), py(['c'], ['b']), py(['d'], ['a']), py(['e'], [])]);

  it('lazy: runs the cell and its stale ancestors, marks its descendants stale', () => {
    expect(planRun(g, [1], 'lazy', new Set([0]))).toEqual({ run: [0, 1], stale: [2, 3] });
    expect(planRun(g, [0], 'lazy', new Set())).toEqual({ run: [0], stale: [1, 2, 3] });
  });

  it('automatic: also runs the descendants, in dependency order', () => {
    expect(planRun(g, [0], 'auto', new Set())).toEqual({ run: [0, 1, 2, 3], stale: [] });
  });

  it('runs every cell in dependency order, not document order', () => {
    const h = buildGraph([py(['b'], ['a']), py(['a'], [])]);
    expect(planRun(h, [0, 1], 'lazy', new Set())).toEqual({ run: [1, 0], stale: [] });
  });

  it('does not run a cell in error nor what depends on it', () => {
    const h = buildGraph([py(['x'], []), py(['x'], []), py(['y'], ['x']), py(['z'], [])]);
    expect(planRun(h, [0, 1, 2, 3], 'lazy', new Set())).toEqual({ run: [3], stale: [2] });
  });
});

describe('CODE-014 reactive cells: sharing the names of JavaScript cells', () => {
  it('reads the names the cell uses and publishes those it defines', () => {
    const code = scriptDeps('const total = price * qty;\nconsole.log(total);', { defs: ['total'], refs: ['price', 'qty'] });
    expect(code).toBe('const { price, qty } = globalThis.__pwoScope;const total = price * qty;\nconsole.log(total);\n;Object.assign(globalThis.__pwoScope, { total });');
    expect(scriptDeps('console.log(1)', { defs: [], refs: [] })).toBe('console.log(1)');
  });
});
