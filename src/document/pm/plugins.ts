/** Keyboard, input rules and decorations of the text editor (DOC-003, COLLAB-003). */
import { baseKeymap, chainCommands, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { InputRule, inputRules } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { Plugin, PluginKey, TextSelection, type Command, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { columnResizing, goToNextCell, tableEditing } from 'prosemirror-tables';
import { findTypedMath } from '../../math/inline';
import type { ParagraphStyle } from '../model';
import { searchPlugin } from './search';
import { backspace, insertRule, changeIndent, clearFormatting, enter, setAlign, setStyle, shiftListLevel, toggleList } from './commands';
import { schema } from './schema';

/** Paragraph style rule: `# ` → heading, `> ` → quote, `- ` → list… */
function blockRule(re: RegExp, attrs: (m: RegExpMatchArray) => Record<string, unknown>): InputRule {
  return new InputRule(re, (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    const para = $start.parent;
    if (para.type !== schema.nodes.paragraph || para.attrs.style === 'code') return null;
    return state.tr.delete(start, end).setNodeMarkup($start.before(), undefined, { ...para.attrs, ...attrs(match) });
  });
}

/** `$…$` and `$$…$$` typed in text become equations (TEX-005). */
const typedMath = new InputRule(/\$$/, (state, _match, start, end) => {
  const $start = state.doc.resolve(start);
  if ($start.parent.attrs.style === 'code' || schema.marks.code!.isInSet($start.marks())) return null;
  const before = $start.parent.textBetween(0, $start.parentOffset, undefined, '￼') + '$';
  const found = findTypedMath(before);
  if (!found) return null;
  const from = $start.start() + found.start;
  return state.tr.replaceWith(from, end, schema.nodes.math!.create({ math: found.latex, display: found.display }));
});

export function editorInputRules(): Plugin {
  const heading = (level: number): ParagraphStyle => `h${level}` as ParagraphStyle;
  return inputRules({
    rules: [
      blockRule(/^(#{1,6})\s$/, (m) => ({ style: heading(m[1]!.length), listOrdered: null, listLevel: 0 })),
      blockRule(/^>\s$/, () => ({ style: 'quote', listOrdered: null, listLevel: 0 })),
      blockRule(/^```$/, () => ({ style: 'code', listOrdered: null, listLevel: 0 })),
      blockRule(/^\s*([-+*])\s$/, () => ({ style: 'normal', listOrdered: false, listLevel: 0 })),
      blockRule(/^(\d+)[.)]\s$/, () => ({ style: 'normal', listOrdered: true, listLevel: 0 })),
      typedMath,
    ],
  });
}

export interface EditorActions {
  footnote(): void;
  find(replace: boolean): void;
  link(): void;
  math(): void;
  diagram(): void;
}

export function editorKeymap(actions: EditorActions): Plugin[] {
  const run =
    (fn: () => void): Command =>
    () => {
      fn();
      return true;
    };
  return [
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Mod-Shift-z': redo,
      'Mod-b': toggleMark(schema.marks.bold!),
      'Mod-i': toggleMark(schema.marks.italic!),
      'Mod-u': toggleMark(schema.marks.underline!),
      'Mod-Shift-x': toggleMark(schema.marks.strike!),
      'Mod-Shift-k': toggleMark(schema.marks.smallCaps!),
      'Mod-`': toggleMark(schema.marks.code!),
      'Mod-Shift-8': toggleList(false),
      'Mod-Shift-7': toggleList(true),
      'Mod-l': setAlign('left'),
      'Mod-e': setAlign('center'),
      'Mod-r': setAlign('right'),
      'Mod-j': setAlign('justify'),
      'Mod-Alt-0': setStyle('normal'),
      'Mod-Alt-1': setStyle('h1'),
      'Mod-Alt-2': setStyle('h2'),
      'Mod-Alt-3': setStyle('h3'),
      'Mod-k': run(actions.link),
      'Mod-Space': clearFormatting,
      'Mod-Enter': insertRule(true),
      'Mod-]': changeIndent(1),
      'Mod-[': changeIndent(-1),
      'Mod-f': run(() => actions.find(false)),
      'Mod-Alt-f': run(actions.footnote),
      'Mod-h': run(() => actions.find(true)),
      'Mod-m': run(actions.math),
      'Mod-Shift-d': run(actions.diagram),
      Tab: chainCommands(goToNextCell(1), shiftListLevel(1)),
      'Shift-Tab': chainCommands(goToNextCell(-1), shiftListLevel(-1)),
      Enter: enter,
      'Shift-Enter': (state, dispatch) => {
        if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break!.create()).scrollIntoView());
        return true;
      },
      Backspace: backspace,
    }),
    keymap(baseKeymap),
  ];
}

// --- where the other participants are (COLLAB-003) ---------------------------

export interface PeerMarker {
  name: string;
  color: string;
  /** Index of the top-level block they are in. */
  block: number;
}

export const peersKey = new PluginKey<PeerMarker[]>('peers');

export function peersPlugin(): Plugin<PeerMarker[]> {
  return new Plugin<PeerMarker[]>({
    key: peersKey,
    state: {
      init: () => [],
      apply: (tr, value) => (tr.getMeta(peersKey) as PeerMarker[] | undefined) ?? value,
    },
    props: {
      decorations(state: EditorState) {
        const peers = peersKey.getState(state) ?? [];
        if (!peers.length) return DecorationSet.empty;
        const byBlock = new Map<number, PeerMarker[]>();
        for (const p of peers) byBlock.set(p.block, [...(byBlock.get(p.block) ?? []), p]);
        const decos: Decoration[] = [];
        let index = 0;
        state.doc.forEach((node, offset) => {
          const here = byBlock.get(index++);
          if (here) decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'peer-here', style: `--peer: ${here[0]!.color}`, 'data-peer': here.map((p) => p.name).join(', ') }));
        });
        return DecorationSet.create(state.doc, decos);
      },
    },
  });
}

/**
 * The browser reports caret moves (End, arrows…) with a `selectionchange`
 * event that comes asynchronously; a key pressed right after (Enter, Delete…)
 * would act on the previous selection, e.g. replace a line that was selected
 * a moment before. Read the DOM selection first on every key press.
 */
function syncSelectionOnKey(): Plugin {
  return new Plugin({
    props: {
      handleKeyDown(view: EditorView) {
        const sel = view.dom.ownerDocument.getSelection();
        if (!sel?.anchorNode || !sel.focusNode || !view.dom.contains(sel.anchorNode) || !view.dom.contains(sel.focusNode)) return false;
        try {
          const anchor = view.posAtDOM(sel.anchorNode, sel.anchorOffset);
          const head = view.posAtDOM(sel.focusNode, sel.focusOffset);
          const { state } = view;
          if (state.selection instanceof TextSelection && (state.selection.anchor !== anchor || state.selection.head !== head)) {
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, anchor, head)));
          }
        } catch {
          /* inside a node view: leave the selection to ProseMirror */
        }
        return false;
      },
    },
  });
}

export function basePlugins(actions: EditorActions): Plugin[] {
  return [syncSelectionOnKey(), editorInputRules(), ...editorKeymap(actions), history(), dropCursor(), gapCursor(), columnResizing(), tableEditing(), peersPlugin(), searchPlugin()];
}
