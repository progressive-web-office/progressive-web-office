/** Editing commands of the text editor (DOC-003..DOC-008). */
import { Fragment, type Mark, type MarkType, type Node as PmNode } from 'prosemirror-model';
import { NodeSelection, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { splitBlockAs } from 'prosemirror-commands';
import type { Align, ParagraphStyle } from '../model';
import { schema } from './schema';

const MAX_LEVEL = 8;

/** Paragraphs touched by the selection (with their positions). */
export function selectedParagraphs(state: EditorState): { node: PmNode; pos: number }[] {
  const out: { node: PmNode; pos: number }[] = [];
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === schema.nodes.paragraph) {
      out.push({ node, pos });
      return false;
    }
    return true;
  });
  if (!out.length) {
    const $from = state.selection.$from;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type === schema.nodes.paragraph) out.push({ node, pos: $from.before(d) });
    }
  }
  return out;
}

function updateParagraphs(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, change: (attrs: Record<string, unknown>) => Record<string, unknown> | null): boolean {
  const paragraphs = selectedParagraphs(state);
  if (!paragraphs.length) return false;
  if (!dispatch) return true;
  const tr = state.tr;
  for (const { node, pos } of paragraphs) {
    const next = change({ ...node.attrs });
    if (next) tr.setNodeMarkup(pos, undefined, next);
  }
  dispatch(tr.scrollIntoView());
  return true;
}

/** The style of the paragraph at the cursor. */
export function currentStyle(state: EditorState): ParagraphStyle {
  return (selectedParagraphs(state)[0]?.node.attrs.style as ParagraphStyle | undefined) ?? 'normal';
}

export const setStyle =
  (style: ParagraphStyle): Command =>
  (state, dispatch) =>
    updateParagraphs(state, dispatch, (a) => ({ ...a, style, ...(style !== 'normal' ? { listOrdered: null, listLevel: 0 } : {}) }));

export const setAlign =
  (align: Align): Command =>
  (state, dispatch) =>
    updateParagraphs(state, dispatch, (a) => ({ ...a, align: align === 'left' ? null : align }));

export function currentAlign(state: EditorState): Align {
  return (selectedParagraphs(state)[0]?.node.attrs.align as Align | null) ?? 'left';
}

/** Whether every selected paragraph is a list item of this kind. */
export function inList(state: EditorState, ordered?: boolean): boolean {
  const ps = selectedParagraphs(state);
  return ps.length > 0 && ps.every(({ node }) => node.attrs.listOrdered !== null && (ordered === undefined || node.attrs.listOrdered === ordered));
}

/** Turn the selected paragraphs into (or out of) a bulleted or numbered list. */
export const toggleList =
  (ordered: boolean): Command =>
  (state, dispatch) => {
    const remove = inList(state, ordered);
    return updateParagraphs(state, dispatch, (a) => (remove ? { ...a, listOrdered: null, listLevel: 0 } : { ...a, style: 'normal', listOrdered: ordered, listLevel: a.listOrdered === null ? 0 : a.listLevel }));
  };

/** Indent (+1) or outdent (-1) list items; false outside lists. */
export const shiftListLevel =
  (delta: 1 | -1): Command =>
  (state, dispatch) => {
    if (!inList(state)) return false;
    return updateParagraphs(state, dispatch, (a) => ({ ...a, listLevel: Math.max(0, Math.min(MAX_LEVEL, (a.listLevel as number) + delta)) }));
  };

/**
 * Enter: an empty list item leaves the list; headings are followed by normal
 * text; lists, quotes and alignment carry on. In code paragraphs Enter adds a
 * line, and Enter on an empty last line leaves the code.
 */
export const enter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const para = $from.parent;
  if (para.type !== schema.nodes.paragraph) return false;
  const a = para.attrs;
  if (empty && a.listOrdered !== null && para.content.size === 0) {
    if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(), undefined, { ...a, listOrdered: null, listLevel: 0 }));
    return true;
  }
  if (a.style === 'code' && empty) {
    const atEnd = $from.parentOffset === para.content.size;
    const last = para.lastChild;
    if (atEnd && last?.type === schema.nodes.hard_break) {
      if (dispatch) {
        const tr = state.tr.delete($from.pos - 1, $from.pos);
        tr.split($from.pos - 1, 1, [{ type: schema.nodes.paragraph!, attrs: { style: 'normal', align: null, listOrdered: null, listLevel: 0 } }]);
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break!.create()).scrollIntoView());
    return true;
  }
  return splitBlockAs((node, atEnd) => {
    const heading = /^h\d$/.test(node.attrs.style as string);
    return { type: schema.nodes.paragraph!, attrs: { ...node.attrs, style: heading && atEnd ? 'normal' : node.attrs.style } };
  })(state, dispatch);
};

/** Backspace at the start of a list item or styled paragraph removes the list or style first. */
export const backspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0 || $from.parent.type !== schema.nodes.paragraph) return false;
  const a = $from.parent.attrs;
  if (a.listOrdered !== null) {
    if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(), undefined, a.listLevel > 0 ? { ...a, listLevel: a.listLevel - 1 } : { ...a, listOrdered: null, listLevel: 0 }));
    return true;
  }
  if (a.style === 'quote' || a.style === 'code') {
    if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(), undefined, { ...a, style: 'normal' }));
    return true;
  }
  return false;
};

export function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

/** The link around the cursor, if any. */
export function linkAt(state: EditorState): Mark | undefined {
  return schema.marks.link!.isInSet(state.selection.$from.marks()) ?? undefined;
}

/** Link the selection, or insert the URL as a linked text at the cursor. */
export const setLink =
  (href: string): Command =>
  (state, dispatch) => {
    if (!dispatch) return true;
    const mark = schema.marks.link!.create({ href });
    const { from, to, empty } = state.selection;
    if (empty) dispatch(state.tr.insert(from, schema.text(href, [mark])).scrollIntoView());
    else dispatch(state.tr.removeMark(from, to, schema.marks.link).addMark(from, to, mark).scrollIntoView());
    return true;
  };

/** Insert an inline atom (image, equation…) at the cursor, replacing the selection. */
export const insertInline =
  (node: PmNode): Command =>
  (state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
    return true;
  };

/**
 * Insert a block-like atom (diagram, code cell) in its own paragraph: it replaces
 * an empty paragraph, otherwise goes after the current one, and an empty
 * paragraph follows when it would be the last block.
 */
export const insertOnOwnLine =
  (node: PmNode): Command =>
  (state, dispatch) => {
    if (!dispatch) return true;
    const $from = state.selection.$from;
    const holder = schema.nodes.paragraph!.create(null, node);
    const tr = state.tr;
    const depth = Math.max(1, $from.depth);
    const parent = $from.node(depth);
    let pos: number;
    if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
      pos = $from.before(depth);
      tr.replaceWith(pos, pos + parent.nodeSize, holder);
    } else {
      pos = $from.after(depth);
      tr.insert(pos, holder);
    }
    const after = pos + holder.nodeSize;
    if (after >= tr.doc.content.size || tr.doc.resolve(after).parent !== tr.doc.resolve(pos).parent || tr.doc.nodeAt(after) === null) {
      if (tr.doc.nodeAt(after) === null) tr.insert(after, schema.nodes.paragraph!.create());
    }
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(after + 1, tr.doc.content.size))));
    dispatch(tr.scrollIntoView());
    return true;
  };

/** A rows × cols table with empty cells, followed by an empty paragraph. */
export const insertTable =
  (rows = 3, cols = 3): Command =>
  (state, dispatch) => {
    if (!dispatch) return true;
    const cell = () => schema.nodes.table_cell!.create(null, schema.nodes.paragraph!.create());
    const table = schema.nodes.table!.create(null, Array.from({ length: rows }, () => schema.nodes.table_row!.create(null, Array.from({ length: cols }, cell))));
    const $from = state.selection.$from;
    const pos = $from.depth > 0 ? $from.after(1) : state.doc.content.size;
    const tr = state.tr.insert(pos, Fragment.from([table, schema.nodes.paragraph!.create()]));
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 3)));
    dispatch(tr.scrollIntoView());
    return true;
  };

export const insertRule: Command = (state, dispatch) => {
  if (!dispatch) return true;
  const $from = state.selection.$from;
  const pos = $from.depth > 0 ? $from.after(1) : state.doc.content.size;
  const tr = state.tr.insert(pos, Fragment.from([schema.nodes.horizontal_rule!.create(), schema.nodes.paragraph!.create()]));
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 2)));
  dispatch(tr.scrollIntoView());
  return true;
};

/** The atom node selected or at a position. */
export function selectedNode(state: EditorState): PmNode | undefined {
  return state.selection instanceof NodeSelection ? state.selection.node : undefined;
}
