/**
 * Writing aids drawn over the text (DOC-033, DOC-035): readability of each
 * paragraph, and the paragraph of the cursor in focus mode.
 */
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { readability } from '../readability';
import { schema } from './schema';

export interface WritingOptions {
  readability: boolean;
  focus: boolean;
  lang: string;
}

export const writingKey = new PluginKey<WritingOptions>('pwo-writing');

function decorations(state: EditorState, opts: WritingOptions, label: (score: number, level: string, wps: number) => string): DecorationSet {
  const decos: Decoration[] = [];
  if (opts.readability) {
    state.doc.descendants((node, pos) => {
      if (node.type !== schema.nodes.paragraph) return true;
      if (node.attrs.style === 'normal' || node.attrs.style === 'quote') {
        const r = readability(node.textContent, opts.lang);
        if (r) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: `read-${r.level}`, title: label(r.score, r.level, r.sentenceLength) }));
      }
      return false;
    });
  }
  if (opts.focus) {
    const $from = state.selection.$from;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type === schema.nodes.paragraph) {
        const start = $from.before(d);
        decos.push(Decoration.node(start, start + $from.node(d).nodeSize, { class: 'is-current' }));
        break;
      }
    }
  }
  return DecorationSet.create(state.doc, decos);
}

/** The plugin; its options change with `tr.setMeta(writingKey, options)`. */
export function writingPlugin(label: (score: number, level: string, wps: number) => string): Plugin<WritingOptions> {
  return new Plugin<WritingOptions>({
    key: writingKey,
    state: {
      init: () => ({ readability: false, focus: false, lang: 'en' }),
      apply: (tr, value) => (tr.getMeta(writingKey) as WritingOptions | undefined) ?? value,
    },
    props: {
      decorations(state) {
        const opts = writingKey.getState(state);
        return opts && (opts.readability || opts.focus) ? decorations(state, opts, label) : null;
      },
    },
  });
}
