/**
 * The panel showing the dependency graph of the code cells (CODE-015): the
 * graph (Mermaid), a legend, and the same links as a list for the keyboard
 * and screen readers. Clicking a cell in either goes to it.
 */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { dagSource, type CellState, type DagEdge, type DagNode } from './dag';

export interface DagView {
  nodes: DagNode[];
  edges: DagEdge[];
  /** Said above the graph (e.g. dependencies not known yet). */
  hint?: string;
}

export interface DagHooks {
  view(): Promise<DagView>;
  goTo(index: number): void;
}

const STATES: CellState[] = ['ok', 'stale', 'error', 'blocked', 'new'];
const STATE_KEY: Record<CellState, MessageKey> = { ok: 'code.dagOk', stale: 'code.dagStale', error: 'code.dagError', blocked: 'code.dagBlocked', new: 'code.dagNew' };

export class DagPanel {
  readonly element: HTMLElement;
  private readonly graph = h('div', { class: 'dag-graph' });
  private readonly list = h('ol', { class: 'dag-list' });
  private readonly hint = h('p', { class: 'hint', hidden: true });
  private timer: ReturnType<typeof setTimeout> | undefined;
  private highlighted: number | undefined;
  private rendering = 0;

  constructor(private readonly hooks: DagHooks) {
    this.element = h(
      'section',
      { class: 'doc-dag', 'aria-label': t('code.dag'), hidden: true },
      h('div', { class: 'dag-head' }, h('h2', {}, t('code.dag')), button(t('code.dagRefresh'), () => void this.refresh(), { text: '↻', className: 'icon' }), button(t('code.dagClose'), () => this.close(), { text: '✕', className: 'icon' })),
      h('p', { class: 'dag-legend' }, ...STATES.map((s) => h('span', { class: `dag-key dag-${s}` }, t(STATE_KEY[s])))),
      this.hint,
      this.graph,
      h('details', { class: 'dag-details' }, h('summary', {}, t('code.dagAsList')), this.list),
    );
  }

  get open(): boolean {
    return !this.element.hidden;
  }

  /** Show the panel; `cell` is drawn out and brought into view. */
  async show(cell?: number): Promise<void> {
    this.element.hidden = false;
    this.highlighted = cell;
    await this.refresh();
    this.element.scrollIntoView({ block: 'nearest' });
  }

  close(): void {
    this.element.hidden = true;
    this.highlighted = undefined;
  }

  /** Refresh soon (after a change of the document), when shown. */
  later(): void {
    if (!this.open) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), 700);
  }

  async refresh(): Promise<void> {
    if (!this.open) return;
    const run = ++this.rendering;
    const view = await this.hooks.view();
    if (run !== this.rendering) return;
    this.hint.hidden = !view.hint;
    this.hint.textContent = view.hint ?? '';
    this.renderList(view);
    if (!view.nodes.length) {
      this.graph.replaceChildren(h('p', { class: 'hint' }, t('code.dagEmpty')));
      return;
    }
    try {
      const { renderDiagramSvg } = await import('../diagram/mermaid');
      const { svg } = await renderDiagramSvg(dagSource(view.nodes, view.edges));
      if (run !== this.rendering) return;
      // Strict Mermaid output: no script, no HTML label.
      const root = document.importNode(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement, true);
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', t('code.dag'));
      this.graph.replaceChildren(root);
      for (const node of root.querySelectorAll<SVGGElement>('g.node')) {
        const index = Number(/(?:^|-)c(\d+)-\d+$/.exec(node.id)?.[1] ?? node.dataset.id?.slice(1));
        if (!Number.isInteger(index)) continue;
        node.dataset.cell = String(index);
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => this.hooks.goTo(index));
        if (index === this.highlighted) node.classList.add('dag-current');
      }
    } catch {
      this.graph.replaceChildren(h('p', { class: 'hint' }, t('code.dagFailed')));
    }
  }

  private renderList(view: DagView): void {
    this.list.replaceChildren(
      ...view.nodes.map((n, i) => {
        const uses = view.edges.filter((e) => e.to === i);
        const usedBy = view.edges.filter((e) => e.from === i);
        const cell = (j: number): string => view.nodes[j]!.label;
        return h(
          'li',
          { class: `dag-item dag-${n.state}` },
          button(n.label, () => this.hooks.goTo(i), { className: 'link' }),
          ` — ${t(STATE_KEY[n.state])}`,
          n.defs.filter((d) => !d.startsWith('_')).length ? h('div', {}, t('code.dagDefines', { names: n.defs.filter((d) => !d.startsWith('_')).join(', ') })) : '',
          uses.length ? h('div', {}, t('code.dagUses', { list: uses.map((e) => `${cell(e.from)} (${e.names.join(', ')})`).join(' ; ') })) : '',
          usedBy.length ? h('div', {}, t('code.dagUsedBy', { list: usedBy.map((e) => cell(e.to)).join(' ; ') })) : '',
        );
      }),
    );
  }
}
