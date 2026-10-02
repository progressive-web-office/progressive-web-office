/**
 * The dependency graph of the code cells, drawn for the user (CODE-015): one
 * node per cell, coloured by its state, and one link per dependency, labelled
 * with the names it carries.
 */
import { ancestors, type CellGraph, type GraphCell } from './reactive';

/** ok: run; error: failed (or invalid in the graph); blocked: a cell it uses failed; stale: out of date; new: not run. */
export type CellState = 'ok' | 'error' | 'blocked' | 'stale' | 'new';

export interface DagEdge {
  from: number;
  to: number;
  names: string[];
}

export interface DagNode {
  label: string;
  defs: string[];
  state: CellState;
}

const shared = (n: string): boolean => !n.startsWith('_');

export function edgesOf(cells: GraphCell[], g: CellGraph): DagEdge[] {
  const out: DagEdge[] = [];
  g.parents.forEach((from, to) => {
    for (const j of from) {
      const defs = new Set(cells[j]!.deps?.defs ?? []);
      out.push({ from: j, to, names: [...new Set(cells[to]!.deps?.refs ?? [])].filter((n) => shared(n) && defs.has(n)).sort() });
    }
  });
  return out.sort((a, b) => a.from - b.from || a.to - b.to);
}

export function cellStates(g: CellGraph, outputs: ({ text: string; error?: boolean } | undefined)[], stale: Set<number>): CellState[] {
  const failed = new Set<number>();
  outputs.forEach((o, i) => {
    if (g.errors.has(i) || o?.error) failed.add(i);
  });
  return outputs.map((o, i) => {
    if (g.errors.has(i)) return 'error';
    if (o?.error) return [...ancestors(g, [i])].some((a) => failed.has(a)) ? 'blocked' : 'error';
    if (stale.has(i)) return 'stale';
    return o ? 'ok' : 'new';
  });
}

const escape = (s: string): string => s.replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');

/** Colours readable in both themes, with a dashed border where colour alone would not tell. */
const CLASSES: Record<CellState, string> = {
  ok: 'fill:#d4edda,stroke:#28a745,stroke-width:2px,color:#155724',
  error: 'fill:#f8d7da,stroke:#dc3545,stroke-width:3px,color:#721c24',
  blocked: 'fill:#fff3cd,stroke:#c78a00,stroke-width:2px,stroke-dasharray:5,color:#5c4300',
  stale: 'fill:#e2e3e5,stroke:#6c757d,stroke-width:2px,stroke-dasharray:3,color:#383d41',
  new: 'fill:#ffffff,stroke:#8a94a3,stroke-width:1px,color:#1c2430',
};

export function dagSource(nodes: DagNode[], edges: DagEdge[]): string {
  const lines = ['flowchart TB'];
  nodes.forEach((n, i) => {
    const defs = n.defs.filter(shared);
    lines.push(`  c${i}["${escape(n.label)}${defs.length ? `<br/>${escape(defs.join(', '))}` : ''}"]:::${n.state}`);
  });
  edges.forEach((e, k) => {
    lines.push(`  c${e.from} -->${e.names.length ? `|${escape(e.names.join(', '))}|` : ''} c${e.to}`);
    // A failure travels along the link.
    if (nodes[e.from]?.state === 'error' || nodes[e.from]?.state === 'blocked') {
      if (nodes[e.to]?.state === 'blocked') lines.push(`  linkStyle ${k} stroke:#dc3545,stroke-width:3px`);
    }
  });
  for (const [state, style] of Object.entries(CLASSES)) lines.push(`  classDef ${state} ${style}`);
  return lines.join('\n');
}
