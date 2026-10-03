/**
 * Inserting a snippet (DOC-037): its Markdown becomes text of the document,
 * then its places to type are visited in order with Tab (Shift+Tab goes
 * back); Escape, or typing elsewhere, leaves them.
 */
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { Slice, type Node as PmNode } from 'prosemirror-model';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { STOP_END, STOP_SEP, STOP_START } from '../snippets';

interface Stops {
  ranges: { from: number; to: number }[];
  index: number;
}

const key = new PluginKey<Stops | null>('snippetStops');

/** The characters of the text between `from` and `to`, with their positions. */
function charsBetween(doc: PmNode, from: number, to: number): { text: string; at: number[] } {
  let text = '';
  const at: number[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true;
    const start = Math.max(from, pos);
    const end = Math.min(to, pos + node.nodeSize);
    for (let p = start; p < end; p++) {
      text += node.text![p - pos];
      at.push(p);
    }
    return false;
  });
  return { text, at };
}

/** Insert `doc` (a snippet read as a document) at the selection and select its first place to type. */
export function insertSnippet(view: EditorView, snippet: PmNode): void {
  const { state } = view;
  const start = state.selection.from;
  // One paragraph goes inline; several blocks are inserted like a paste.
  const single = snippet.childCount === 1 && snippet.firstChild!.isTextblock && snippet.firstChild!.attrs.style === 'normal';
  let tr = state.tr.replaceSelection(single ? new Slice(snippet.firstChild!.content, 0, 0) : new Slice(snippet.content, 1, 1));
  const end = tr.mapping.map(state.selection.to, 1);
  // The marks of the places to type: START n SEP default END.
  const { text, at } = charsBetween(tr.doc, start, end);
  const re = new RegExp(`${STOP_START}(\\d+)${STOP_SEP}([^${STOP_END}]*)${STOP_END}`, 'g');
  const found: { n: number; open: [number, number]; close: number }[] = [];
  for (const m of text.matchAll(re)) {
    const i = m.index!;
    const sep = i + 1 + m[1]!.length;
    found.push({ n: Number(m[1]), open: [at[i]!, at[sep]! + 1], close: at[i + m[0].length - 1]! });
  }
  const steps = tr.steps.length;
  // Remove the marks from the end, so that earlier positions stay right.
  const marks = found.flatMap((f) => [f.open, [f.close, f.close + 1] as [number, number]]).sort((a, b) => b[0] - a[0]);
  for (const [a, b] of marks) tr = tr.delete(a, b);
  const map = (p: number, assoc: number): number => tr.mapping.slice(steps).map(p, assoc);
  const order = (n: number): number => (n === 0 ? Infinity : n);
  const ranges = found
    .map((f) => ({ n: f.n, from: map(f.open[1], -1), to: map(f.close, -1) }))
    .sort((a, b) => order(a.n) - order(b.n) || a.from - b.from)
    .map(({ from, to }) => ({ from, to }));
  if (ranges.length) {
    tr = tr.setSelection(TextSelection.create(tr.doc, ranges[0]!.from, ranges[0]!.to));
    tr.setMeta(key, ranges.length > 1 ? { ranges, index: 0 } : null);
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

function move(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, by: number): boolean {
  const stops = key.getState(state);
  if (!stops) return false;
  const index = stops.index + by;
  if (index < 0) return true;
  const r = stops.ranges[index];
  if (!r) {
    dispatch?.(state.tr.setMeta(key, null));
    return false;
  }
  dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, r.from, r.to)).setMeta(key, index === stops.ranges.length - 1 ? null : { ...stops, index }).scrollIntoView());
  return true;
}

export function snippetStopsPlugin(): Plugin<Stops | null> {
  return new Plugin<Stops | null>({
    key,
    state: {
      init: () => null,
      apply(tr, prev) {
        const meta = tr.getMeta(key) as Stops | null | undefined;
        if (meta !== undefined) return meta;
        if (!prev || !tr.docChanged) return prev;
        return { ...prev, ranges: prev.ranges.map((r) => ({ from: tr.mapping.map(r.from, -1), to: tr.mapping.map(r.to, 1) })) };
      },
    },
    props: {
      handleKeyDown(view, event) {
        if (!key.getState(view.state)) return false;
        if (event.key === 'Tab') {
          move(view.state, view.dispatch, event.shiftKey ? -1 : 1);
          return true;
        }
        if (event.key === 'Escape') {
          view.dispatch(view.state.tr.setMeta(key, null));
          return true;
        }
        return false;
      },
      // The places still to visit are outlined.
      decorations(state) {
        const stops = key.getState(state);
        if (!stops) return null;
        return DecorationSet.create(
          state.doc,
          stops.ranges.slice(stops.index + 1).map((r) => (r.from === r.to ? Decoration.widget(r.from, () => Object.assign(document.createElement('span'), { className: 'snippet-stop-empty' })) : Decoration.inline(r.from, r.to, { class: 'snippet-stop' }))),
        );
      },
    },
  });
}
