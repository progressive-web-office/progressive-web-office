import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { findMatches, gotoMatch, replaceAll, replaceCurrent, searchKey, searchPlugin, setQuery } from '../src/document/pm/search';
import { paragraph, type Block } from '../src/document/model';

const blocks: Block[] = [
  paragraph('The cat sat on the mat.'),
  { type: 'paragraph', style: 'normal', runs: [{ text: 'Cat' , bold: true }, { math: 'x' }, { text: 'alog, concat' }] },
];
const text = (s: EditorState) => pmToBlocks(s.doc).map((b) => (b.type === 'paragraph' ? b.runs.map((r) => ('text' in r ? r.text : '¤')).join('') : ''));

function stateWith(query: Parameters<typeof setQuery>[1]): EditorState {
  const s = EditorState.create({ doc: blocksToPm(blocks), plugins: [searchPlugin()] });
  return s.apply(setQuery(s.tr, query));
}

describe('DOC-019 find and replace', () => {
  it('finds text across formatting, with case, whole-word and regex options', () => {
    const doc = blocksToPm(blocks);
    const words = (q: Parameters<typeof findMatches>[1]) => findMatches(doc, q).map((m) => doc.textBetween(m.from, m.to));
    expect(words({ text: 'cat' })).toEqual(['cat', 'Cat', 'cat']);
    expect(words({ text: 'cat', caseSensitive: true })).toEqual(['cat', 'cat']);
    expect(words({ text: 'cat', wholeWord: true })).toEqual(['cat', 'Cat']); // an equation is not a letter
    expect(words({ text: '[cm]at', regex: true })).toEqual(['cat', 'mat', 'Cat', 'cat']);
    // An equation between two words is not text.
    expect(words({ text: 'catalog' })).toEqual([]);
  });

  it('reports an invalid regular expression instead of failing', () => {
    const s = stateWith({ text: '(', regex: true });
    expect(searchKey.getState(s)).toMatchObject({ matches: [], current: -1 });
    expect(searchKey.getState(s)!.error).toBeTruthy();
  });

  it('moves between matches and replaces one or all in a single undo step', () => {
    let s = stateWith({ text: 'at' });
    expect(searchKey.getState(s)!.matches).toHaveLength(5); // cat sat mat Cat concat
    s = s.apply(gotoMatch(s, 1)!);
    expect(searchKey.getState(s)!.current).toBe(1);
    s = s.apply(replaceCurrent(s, 'EE')!);
    expect(text(s)[0]).toBe('The cat sEE on the mat.');
    expect(searchKey.getState(s)!.matches).toHaveLength(4);
    const all = replaceAll(s, '_')!;
    expect(all.count).toBe(4);
    s = s.apply(all.tr);
    expect(text(s)).toEqual(['The c_ sEE on the m_.', 'C_¤alog, conc_']);
    // Formatting of the surrounding text is kept.
    expect(pmToBlocks(s.doc)[1]).toMatchObject({ runs: [{ text: 'C_', bold: true }, { math: 'x' }, { text: 'alog, conc_' }] });
  });

  it('expands regex groups in the replacement', () => {
    let s = stateWith({ text: '(\\w)at', regex: true });
    s = s.apply(replaceAll(s, '$1og')!.tr);
    expect(text(s)[0]).toBe('The cog sat on the mog.'.replace('sat', 'sog'));
  });
});
