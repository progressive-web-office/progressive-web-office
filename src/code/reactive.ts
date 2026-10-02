/**
 * Reactive code cells (CODE-014): each cell defines names and uses names; a
 * cell depends on the cells defining the names it uses (within a language).
 * Cells then run in the order of their dependencies, not of the document, and
 * running a cell marks the cells depending on it as out of date (lazy) or
 * runs them too (automatic). A name is defined in one cell only, and names
 * starting with `_` stay local to their cell.
 */
import type { CodeLang } from '../document/model';

export type Reactivity = 'off' | 'lazy' | 'auto';

export interface CellDeps {
  /** Names the cell defines at its top level. */
  defs: string[];
  /** Names the cell uses without defining them. */
  refs: string[];
}

export interface GraphCell {
  lang: CodeLang;
  /** Undefined when unknown (the analysis failed): the cell is then on its own. */
  deps?: CellDeps;
}

export type CellError = { kind: 'multiple'; name: string; cells: number[] } | { kind: 'cycle'; cells: number[] };

export interface CellGraph {
  /** By cell index (document order): the cells it depends on, and those depending on it. */
  parents: number[][];
  children: number[][];
  errors: Map<number, CellError>;
}

const shared = (name: string): boolean => !name.startsWith('_');

export function buildGraph(cells: GraphCell[]): CellGraph {
  const n = cells.length;
  const definers = new Map<string, number[]>();
  cells.forEach((c, i) => {
    for (const name of new Set(c.deps?.defs ?? [])) {
      if (!shared(name)) continue;
      const key = `${c.lang}:${name}`;
      definers.set(key, [...(definers.get(key) ?? []), i]);
    }
  });
  const errors = new Map<number, CellError>();
  for (const [key, at] of definers) {
    if (at.length < 2) continue;
    const name = key.slice(key.indexOf(':') + 1);
    for (const i of at) if (!errors.has(i)) errors.set(i, { kind: 'multiple', name, cells: at });
  }
  const parents: number[][] = Array.from({ length: n }, () => []);
  const children: number[][] = Array.from({ length: n }, () => []);
  cells.forEach((c, i) => {
    const own = new Set(c.deps?.defs ?? []);
    const from = new Set<number>();
    for (const name of c.deps?.refs ?? []) {
      if (!shared(name) || own.has(name)) continue;
      for (const j of definers.get(`${c.lang}:${name}`) ?? []) if (j !== i) from.add(j);
    }
    parents[i] = [...from].sort((a, b) => a - b);
    for (const j of parents[i]!) children[j]!.push(i);
  });
  for (const scc of cyclesOf(parents)) for (const i of scc) if (!errors.has(i)) errors.set(i, { kind: 'cycle', cells: scc });
  return { parents, children, errors };
}

/** Strongly connected components of more than one cell (Tarjan). */
function cyclesOf(parents: number[][]): number[][] {
  const index = new Map<number, number>();
  const low = new Map<number, number>();
  const stack: number[] = [];
  const onStack = new Set<number>();
  const out: number[][] = [];
  let next = 0;
  const visit = (v: number): void => {
    index.set(v, next);
    low.set(v, next++);
    stack.push(v);
    onStack.add(v);
    for (const w of parents[v]!) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const scc: number[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) out.push(scc.sort((a, b) => a - b));
    }
  };
  parents.forEach((_, v) => {
    if (!index.has(v)) visit(v);
  });
  return out;
}

const closure = (edges: number[][], from: Iterable<number>): Set<number> => {
  const seen = new Set<number>();
  const todo = [...from];
  while (todo.length) {
    for (const j of edges[todo.pop()!]!) {
      if (!seen.has(j)) {
        seen.add(j);
        todo.push(j);
      }
    }
  }
  return seen;
};

export const descendants = (g: CellGraph, cells: Iterable<number>): Set<number> => closure(g.children, cells);
export const ancestors = (g: CellGraph, cells: Iterable<number>): Set<number> => closure(g.parents, cells);

/** `cells` in an order where each cell comes after those it depends on; document order otherwise. */
export function dependencyOrder(g: CellGraph, cells: Iterable<number>): number[] {
  const set = new Set(cells);
  const waiting = new Map<number, number>();
  for (const i of set) waiting.set(i, g.parents[i]!.filter((j) => set.has(j)).length);
  const ready = [...set].filter((i) => waiting.get(i) === 0).sort((a, b) => a - b);
  const out: number[] = [];
  while (ready.length) {
    const i = ready.shift()!;
    out.push(i);
    for (const c of g.children[i]!) {
      if (!set.has(c)) continue;
      const left = waiting.get(c)! - 1;
      waiting.set(c, left);
      if (left === 0) {
        ready.push(c);
        ready.sort((a, b) => a - b);
      }
    }
  }
  return out;
}

/**
 * What runs when the user runs `targets`: their out-of-date ancestors first,
 * then the targets, then (automatic) what depends on them; cells in error and
 * what depends on them do not run and are out of date.
 */
export function planRun(g: CellGraph, targets: number[], mode: Exclude<Reactivity, 'off'>, stale: Set<number>): { run: number[]; stale: number[] } {
  const wanted = new Set(targets);
  for (const a of ancestors(g, targets)) if (stale.has(a)) wanted.add(a);
  if (mode === 'auto') for (const d of descendants(g, targets)) wanted.add(d);
  const blocked = new Set<number>([...g.errors.keys()]);
  for (const d of descendants(g, blocked)) blocked.add(d);
  const run = dependencyOrder(g, [...wanted].filter((i) => !blocked.has(i)));
  const ran = new Set(run);
  const out = new Set<number>();
  for (const d of descendants(g, ran)) if (!ran.has(d)) out.add(d);
  for (const i of wanted) if (!ran.has(i) && !g.errors.has(i)) out.add(i);
  return { run, stale: [...out].sort((a, b) => a - b) };
}

/**
 * A JavaScript cell is a module of its own: it reads the names it uses from
 * the scope shared by the cells of the document, and publishes those it defines.
 */
export function scriptDeps(code: string, deps: CellDeps): string {
  const refs = deps.refs.filter(shared);
  const defs = deps.defs.filter(shared);
  if (!refs.length && !defs.length) return code;
  // On the first line, so that line numbers of errors do not move.
  const head = refs.length ? `const { ${refs.join(', ')} } = globalThis.__pwoScope;` : '';
  const tail = defs.length ? `\n;Object.assign(globalThis.__pwoScope, { ${defs.join(', ')} });` : '';
  return head + code + tail;
}
