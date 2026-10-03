/**
 * `#tags` of a note of a folder shown as tags in the text (FOLDER-023), in
 * the colour given to them in the folder panel. Not in code.
 */
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';
import { inlineTags } from '../../folder/tags';
import { schema } from './schema';

/** The colour of a tag (a CSS colour), or undefined; null when the document is not a note of a folder. */
export type TagColourOf = (tag: string) => string | undefined | null;

const key = new PluginKey<DecorationSet>('noteTags');

function decorate(doc: PmNode, colourOf: TagColourOf): DecorationSet {
  if (colourOf('') === null) return DecorationSet.empty;
  const out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.attrs.style === 'code' || /^h\d$/.test(String(node.attrs.style))) return false;
    // Text pieces of the block, code and links left out.
    let text = '';
    const at: number[] = [];
    node.forEach((child, offset) => {
      const skip = !child.isText || schema.marks.code!.isInSet(child.marks) || schema.marks.link!.isInSet(child.marks);
      const s = skip ? ' '.repeat(child.isText ? child.text!.length : 1) : child.text!;
      for (let i = 0; i < s.length; i++) at.push(pos + 1 + offset + i);
      text += s;
    });
    for (const t of inlineTags(text)) {
      const colour = colourOf(t.tag);
      out.push(Decoration.inline(at[t.index]!, at[t.index + t.length - 1]! + 1, { class: 'note-tag', ...(colour ? { style: `--tag-colour: ${colour}` } : {}) }));
    }
    return false;
  });
  return DecorationSet.create(doc, out);
}

export function noteTagsPlugin(colourOf: TagColourOf): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_c, state) => decorate(state.doc, colourOf),
      apply: (tr, prev, _old, state) => (tr.docChanged || tr.getMeta(key) ? decorate(state.doc, colourOf) : prev),
    },
    props: { decorations: (state) => key.getState(state) },
  });
}

/** A transaction that draws the tags again (their colours changed). */
export const refreshNoteTags = (tr: import('prosemirror-state').Transaction): import('prosemirror-state').Transaction => tr.setMeta(key, true);
