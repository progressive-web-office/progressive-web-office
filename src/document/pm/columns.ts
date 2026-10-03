/** DOC-049: setting blocks in columns, and taking them out again. */
import { NodeRange, type Node as PmNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import { cleanColumns, type ColumnLayout } from '../model';
import { schema } from './schema';

/** The columns holding the selection, and where they start. */
export function columnsAt(state: EditorState): { node: PmNode; pos: number } | undefined {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type === schema.nodes.columns) return { node, pos: $from.before(d) };
  }
  return undefined;
}

export const columnsOf = (node: PmNode): ColumnLayout => ({
  count: node.attrs.count as number,
  ...(node.attrs.gap !== null ? { gap: node.attrs.gap as number } : {}),
  ...(node.attrs.rule ? { rule: true } : {}),
});

/**
 * Set the blocks of the selection in these columns (or the columns holding it),
 * or, for a single column, take them out of their columns.
 */
export function setColumns(layout: ColumnLayout | undefined): Command {
  return (state, dispatch) => {
    const c = cleanColumns(layout);
    const attrs = c ? { count: c.count, gap: c.gap ?? null, rule: !!c.rule } : null;
    const at = columnsAt(state);
    if (at) {
      if (dispatch) {
        const tr = state.tr;
        if (attrs) tr.setNodeMarkup(at.pos, undefined, attrs);
        else tr.replaceWith(at.pos, at.pos + at.node.nodeSize, at.node.content);
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    if (!attrs) return false;
    const { $from, $to } = state.selection;
    if ($from.depth < 1) return false;
    const start = state.doc.resolve($from.before(1));
    const end = state.doc.resolve($to.depth < 1 ? $to.pos : $to.after(1));
    let ok = true;
    state.doc.nodesBetween(start.pos, end.pos, (node, pos) => {
      if (pos >= start.pos && node.type === schema.nodes.columns) ok = false;
      return false;
    });
    if (!ok) return false;
    if (dispatch) dispatch(state.tr.wrap(new NodeRange(start, end, 0), [{ type: schema.nodes.columns!, attrs }]).scrollIntoView());
    return true;
  };
}
