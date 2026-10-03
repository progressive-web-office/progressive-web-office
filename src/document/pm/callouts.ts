/**
 * Callouts (MD-019): a quote whose first line is `[!NOTE] Title` (Obsidian,
 * GitHub alerts) is drawn as a coloured box, by type; the text stays as it is.
 */
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';

const MARKER = /^\[!([A-Za-z][\w-]*)\][+-]?/;

/** Usual types and their aliases, by colour family. */
const FAMILIES: Record<string, string[]> = {
  note: ['note', 'info', 'todo'],
  abstract: ['abstract', 'summary', 'tldr'],
  tip: ['tip', 'hint', 'important', 'success', 'check', 'done'],
  question: ['question', 'help', 'faq'],
  warning: ['warning', 'caution', 'attention'],
  danger: ['danger', 'error', 'failure', 'fail', 'missing', 'bug'],
  example: ['example', 'quote', 'cite'],
};

/** The colour family of a callout type (unknown types look like notes). */
export function calloutFamily(type: string): string {
  const t = type.toLowerCase();
  return Object.keys(FAMILIES).find((f) => FAMILIES[f]!.includes(t)) ?? 'note';
}

/** For each paragraph: the callout it belongs to, if any, and whether it is the marker line. */
export function calloutSpans(paragraphs: { quote: boolean; text: string }[]): ({ family: string; head: boolean } | null)[] {
  let current: string | null = null;
  return paragraphs.map((p) => {
    if (!p.quote) return (current = null);
    const m = MARKER.exec(p.text);
    if (m) {
      current = calloutFamily(m[1]!);
      return { family: current, head: true };
    }
    return current ? { family: current, head: false } : null;
  });
}

const key = new PluginKey<DecorationSet>('callouts');

function decorate(doc: PmNode): DecorationSet {
  const blocks: { pos: number; node: PmNode }[] = [];
  doc.forEach((node, pos) => {
    if (node.isTextblock) blocks.push({ pos, node });
    else blocks.push({ pos: -1, node });
  });
  const spans = calloutSpans(blocks.map(({ node }) => ({ quote: node.isTextblock && node.attrs.style === 'quote', text: node.isTextblock ? node.textContent.slice(0, 40) : '' })));
  const out: Decoration[] = [];
  spans.forEach((s, i) => {
    if (!s) return;
    const { pos, node } = blocks[i]!;
    out.push(Decoration.node(pos, pos + node.nodeSize, { class: `callout callout-${s.family}${s.head ? ' callout-head' : ''}` }));
  });
  return DecorationSet.create(doc, out);
}

export function calloutPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_c, state) => decorate(state.doc),
      apply: (tr, prev, _o, state) => (tr.docChanged ? decorate(state.doc) : prev),
    },
    props: { decorations: (state) => key.getState(state) },
  });
}
