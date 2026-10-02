/**
 * Typography as you type (DOC-031) and text transforms of the selection or
 * the whole document (DOC-032), keeping the formatting of the text.
 */
import { InputRule, inputRules } from 'prosemirror-inputrules';
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorState, Plugin, Transaction } from 'prosemirror-state';
import { schema } from './pm/schema';
import { curlyQuotes, dashesAndEllipsis, frenchSpaceBefore, frenchSpacing, isFrench, opensQuote, quotesFor, removeDoubleSpaces, sentenceCase, straightenQuotes, titleCase, zapGremlins } from './typography';

export interface TypographyOptions {
  enabled(): boolean;
  /** The document's language (BCP 47). */
  lang(): string;
}

const textBefore = (state: EditorState, pos: number): string => {
  const $pos = state.doc.resolve(pos);
  return $pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼');
};

/** Input rules: curly quotes, dashes, ellipsis, French spacing. */
export function typographyRules(opts: TypographyOptions): Plugin {
  const rule = (re: RegExp, handler: (state: EditorState, match: RegExpMatchArray, start: number, end: number) => Transaction | null): InputRule =>
    new InputRule(re, (state, match, start, end) => (opts.enabled() && state.doc.resolve(start).parent.attrs.style !== 'code' ? handler(state, match, start, end) : null), { inCodeMark: false });
  return inputRules({
    rules: [
      rule(/–-$/, (state, _m, start, end) => state.tr.insertText('—', start, end)),
      rule(/(?<![-–])--$/, (state, _m, start, end) => state.tr.insertText('–', start, end)),
      rule(/\.\.\.$/, (state, _m, start, end) => state.tr.insertText('…', start, end)),
      rule(/"$/, (state, _m, start, end) => {
        const before = textBefore(state, start);
        const q = quotesFor(opts.lang());
        if (opensQuote(before)) return state.tr.insertText(q.open, start, end);
        const spaces = /[   ]*$/.exec(before)![0].length;
        return state.tr.insertText(q.close, start - spaces, end);
      }),
      rule(/'$/, (state, _m, start, end) => {
        const before = textBefore(state, start);
        const q = quotesFor(opts.lang());
        return state.tr.insertText(/[\p{L}\p{N}]$/u.test(before) || !opensQuote(before) ? '’' : q.openSingle, start, end);
      }),
      rule(/[;:!?]$/, (state, match, start, end) => {
        if (!isFrench(opts.lang())) return null;
        const res = frenchSpaceBefore(textBefore(state, start), match[0]);
        return res ? state.tr.insertText(res.space + match[0], start - res.replace, end) : null;
      }),
    ],
  });
}

export type TransformId = 'curly' | 'straight' | 'french' | 'dashes' | 'spaces' | 'gremlins' | 'sentence' | 'title' | 'upper' | 'lower' | 'join';

export const TRANSFORMS: TransformId[] = ['curly', 'straight', 'french', 'dashes', 'spaces', 'gremlins', 'join', 'sentence', 'title', 'upper', 'lower'];

const textFns: Record<Exclude<TransformId, 'join'>, (s: string, lang: string) => string> = {
  curly: curlyQuotes,
  straight: (s) => straightenQuotes(s),
  french: (s) => frenchSpacing(s),
  dashes: (s) => dashesAndEllipsis(s),
  spaces: (s) => removeDoubleSpaces(s),
  gremlins: (s) => zapGremlins(s),
  sentence: sentenceCase,
  title: titleCase,
  upper: (s, lang) => s.toLocaleUpperCase(lang),
  lower: (s, lang) => s.toLocaleLowerCase(lang),
};

/** Lines that do not end a sentence are joined with the next paragraph (text pasted from a PDF). */
function joinLines(state: EditorState, from: number, to: number): Transaction {
  const tr = state.tr;
  const paragraphs: { pos: number; node: PmNode }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === schema.nodes.paragraph) {
      paragraphs.push({ pos, node });
      return false;
    }
    return true;
  });
  // From the end, so that the positions before stay valid.
  for (let i = paragraphs.length - 1; i > 0; i--) {
    const prev = paragraphs[i - 1]!;
    const cur = paragraphs[i]!;
    const plain = (n: PmNode): boolean => n.attrs.style === 'normal' && n.attrs.listOrdered === null;
    if (prev.pos + prev.node.nodeSize !== cur.pos || !plain(prev.node) || !plain(cur.node)) continue;
    const text = prev.node.textContent.trimEnd();
    if (!text || !cur.node.textContent.trim() || /[.!?…:;»"”)\]]$/.test(text)) continue;
    const end = cur.pos;
    tr.join(end);
    // A space where the line ended, unless the word was cut with a hyphen.
    const at = tr.mapping.map(end);
    if (/[\p{L}]-$/u.test(text)) tr.delete(at - 1, at);
    else if (!/\s$/.test(prev.node.textContent)) tr.insertText(' ', at);
  }
  // Line breaks inside the paragraphs.
  tr.doc.nodesBetween(tr.mapping.map(from), tr.mapping.map(to), (node, pos) => {
    if (node.type === schema.nodes.hard_break) tr.replaceWith(tr.mapping.map(pos), tr.mapping.map(pos + 1), schema.text(' '));
  });
  return tr;
}

/** The transform applied to the selection, or to the whole document when nothing is selected. */
export function transformText(state: EditorState, id: TransformId, lang: string): Transaction {
  const { from, to } = state.selection.empty ? { from: 0, to: state.doc.content.size } : state.selection;
  if (id === 'join') return joinLines(state, from, to);
  const fn = textFns[id];
  const tr = state.tr;
  // Paragraph by paragraph: sentences and quotes run across formatted parts.
  const blocks: { pos: number; node: PmNode }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      blocks.push({ pos, node });
      return false;
    }
    return true;
  });
  for (const { pos, node } of blocks.reverse()) {
    if (node.type.spec.code || node.attrs.style === 'code') continue;
    const parts: { from: number; to: number; text: string; marks: PmNode['marks'] }[] = [];
    node.forEach((child, offset) => {
      if (!child.isText || schema.marks.code!.isInSet(child.marks)) return;
      const a = Math.max(from, pos + 1 + offset);
      const b = Math.min(to, pos + 1 + offset + child.nodeSize);
      if (b <= a) return;
      const start = a - (pos + 1 + offset);
      parts.push({ from: a, to: b, text: child.text!.slice(start, start + (b - a)), marks: child.marks });
    });
    if (!parts.length) continue;
    const whole = parts.map((p) => p.text).join('');
    const out = fn(whole, lang);
    if (out === whole) continue;
    if (out.length === whole.length) {
      // Same length (case, quotes of one character): each part keeps its formatting.
      let at = whole.length;
      for (const p of [...parts].reverse()) {
        at -= p.text.length;
        const text = out.slice(at, at + p.text.length);
        if (text !== p.text) tr.replaceWith(p.from, p.to, schema.text(text, p.marks));
      }
    } else {
      for (const p of [...parts].reverse()) {
        const text = fn(p.text, lang);
        if (text !== p.text) tr.replaceWith(p.from, p.to, text ? schema.text(text, p.marks) : []);
      }
    }
  }
  return tr;
}
