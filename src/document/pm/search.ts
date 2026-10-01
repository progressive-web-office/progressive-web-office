/** Find and replace in the text editor (DOC-019). */
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';
import { closeHistory } from 'prosemirror-history';

export interface SearchQuery {
  text: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export interface Match {
  from: number;
  to: number;
}

export interface SearchState {
  query: SearchQuery;
  matches: Match[];
  /** Index of the current match, -1 when none. */
  current: number;
  /** The regular expression is invalid. */
  error?: string;
}

export const searchKey = new PluginKey<SearchState>('search');

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The regular expression for a query (null when empty). Throws on an invalid pattern. */
export function queryRegExp(q: SearchQuery): RegExp | null {
  if (!q.text) return null;
  let source = q.regex ? q.text : escapeRe(q.text);
  if (q.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  return new RegExp(source, `gu${q.caseSensitive ? '' : 'i'}`);
}

/** All matches in the document; atoms count as one character that never matches. */
export function findMatches(doc: PmNode, q: SearchQuery): Match[] {
  const re = queryRegExp(q);
  if (!re) return [];
  const out: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Text of the block with each inline node mapped to its document position.
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) positions.push(start + i);
        text += child.text;
      } else {
        positions.push(start);
        text += child.type.name === 'hard_break' ? '\n' : '￼';
      }
    });
    positions.push(pos + 1 + node.content.size);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (!m[0].length) {
        re.lastIndex++;
        continue;
      }
      if (m[0].includes('￼')) continue;
      out.push({ from: positions[m.index]!, to: positions[m.index + m[0].length - 1]! + 1 });
    }
    return false;
  });
  return out;
}

function compute(doc: PmNode, query: SearchQuery, near: number): SearchState {
  try {
    const matches = findMatches(doc, query);
    const current = matches.length ? Math.max(0, matches.findIndex((m) => m.from >= near)) : -1;
    return { query, matches, current };
  } catch (err) {
    return { query, matches: [], current: -1, error: (err as Error).message };
  }
}

export function searchPlugin(): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchKey,
    state: {
      init: () => ({ query: { text: '' }, matches: [], current: -1 }),
      apply(tr, value, _old, state) {
        const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined;
        if (meta?.query) return compute(state.doc, meta.query, state.selection.from);
        if (meta && typeof meta.current === 'number') return { ...value, current: meta.current };
        if (tr.docChanged && value.query.text) {
          const next = compute(state.doc, value.query, tr.mapping.map(value.matches[value.current]?.from ?? state.selection.from));
          return next;
        }
        return value;
      },
    },
    props: {
      decorations(state: EditorState) {
        const s = searchKey.getState(state);
        if (!s?.matches.length) return DecorationSet.empty;
        return DecorationSet.create(
          state.doc,
          s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? 'search-match current' : 'search-match' })),
        );
      },
    },
  });
}

export function setQuery(tr: Transaction, query: SearchQuery): Transaction {
  return tr.setMeta(searchKey, { query });
}

/** Move to the next (or previous) match and select it. */
export function gotoMatch(state: EditorState, dir: 1 | -1): Transaction | null {
  const s = searchKey.getState(state);
  if (!s?.matches.length) return null;
  const current = (s.current + dir + s.matches.length) % s.matches.length;
  const m = s.matches[current]!;
  return state.tr.setMeta(searchKey, { current }).setSelection(TextSelection.create(state.doc, m.from, m.to)).scrollIntoView();
}

/** The replacement text, with $1… groups when searching with a regular expression. */
function replacement(state: EditorState, m: Match, q: SearchQuery, value: string): string {
  if (!q.regex) return value;
  const re = queryRegExp({ ...q, wholeWord: false })!;
  const found = state.doc.textBetween(m.from, m.to, '\n', '￼');
  return found.replace(new RegExp(`^(?:${re.source})$`, re.flags.replace('g', '')), value);
}

/** Replace the current match and go to the next one. */
export function replaceCurrent(state: EditorState, value: string): Transaction | null {
  const s = searchKey.getState(state);
  const m = s?.matches[s.current];
  if (!s || !m) return null;
  const text = replacement(state, m, s.query, value);
  // Each replacement is its own undo step, never merged with the typing before it.
  const tr = closeHistory(state.tr);
  if (text) tr.insertText(text, m.from, m.to);
  else tr.delete(m.from, m.to);
  const after = tr.mapping.map(m.to);
  tr.setSelection(TextSelection.create(tr.doc, after));
  return tr.scrollIntoView();
}

/** Replace every match in one undoable step; returns the number replaced. */
export function replaceAll(state: EditorState, value: string): { tr: Transaction; count: number } | null {
  const s = searchKey.getState(state);
  if (!s?.matches.length) return null;
  const tr = closeHistory(state.tr);
  for (let i = s.matches.length - 1; i >= 0; i--) {
    const m = s.matches[i]!;
    const text = replacement(state, m, s.query, value);
    if (text) tr.insertText(text, m.from, m.to);
    else tr.delete(m.from, m.to);
  }
  return { tr, count: s.matches.length };
}
