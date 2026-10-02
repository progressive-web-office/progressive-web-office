/**
 * Code cells whose output is out of date (CODE-014): a cell they depend on
 * changed or ran since. Kept as positions mapped through the changes of the
 * document, not saved with it.
 */
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

interface Change {
  stale?: number[];
  fresh?: number[];
}

export const cellStateKey = new PluginKey<number[]>('cell-state');

export function cellStatePlugin(label: () => string): Plugin<number[]> {
  return new Plugin<number[]>({
    key: cellStateKey,
    state: {
      init: () => [],
      apply(tr, positions, _old, state) {
        let out = tr.docChanged ? positions.map((p) => tr.mapping.map(p, -1)) : positions;
        const change = tr.getMeta(cellStateKey) as Change | undefined;
        if (change?.fresh) out = out.filter((p) => !change.fresh!.includes(p));
        if (change?.stale) out = [...out, ...change.stale];
        const doc = state.doc;
        return [...new Set(out)].filter((p) => p >= 0 && p < doc.content.size && doc.nodeAt(p)?.type.name === 'code_cell').sort((a, b) => a - b);
      },
    },
    props: {
      decorations(state) {
        const positions = cellStateKey.getState(state) ?? [];
        if (!positions.length) return DecorationSet.empty;
        const text = label();
        return DecorationSet.create(
          state.doc,
          positions.map((p) => Decoration.node(p, p + state.doc.nodeAt(p)!.nodeSize, { class: 'code-stale', 'data-stale': text, title: text })),
        );
      },
    },
  });
}

export const stalePositions = (state: EditorState): number[] => cellStateKey.getState(state) ?? [];

export const markCells = (tr: Transaction, change: Change): Transaction => tr.setMeta(cellStateKey, change);
