import { beforeEach, describe, expect, it } from 'vitest';
import { expandSnippet, loadSnippets, mergeSnippets, placesToType, saveSnippets, type Snippet } from '../src/document/snippets';

describe('DOC-037 snippets', () => {
  beforeEach(() => localStorage.clear());
  const now = new Date(2026, 9, 3, 14, 5);

  it('fills the date, the title and the clipboard, and keeps unknown fields', () => {
    expect(expandSnippet('${isodate} ${date} ${time} — ${title} — ${clipboard} ${other}', { now, lang: 'en-GB', title: 'Report', clipboard: 'copied' })).toBe('2026-10-03 3 October 2026 14:05 — Report — copied ${other}');
    expect(expandSnippet('${weekday}', { now, lang: 'fr' })).toBe('samedi');
  });

  it('finds the places to type, in order, the final cursor last', () => {
    const { text, stops } = placesToType(expandSnippet('# ${1:Title}\n\n${0}Date: ${2:today}, by ${1:Title}', { now }));
    expect(text).toBe('# Title\n\nDate: today, by Title');
    expect(stops).toEqual([
      { n: 1, from: 2, to: 7 },
      { n: 1, from: 25, to: 30 },
      { n: 2, from: 15, to: 20 },
      { n: 0, from: 9, to: 9 },
    ]);
  });

  it('keeps the user snippets and merges the lists by name', () => {
    saveSnippets([{ name: 'sig', body: 'Best regards' }]);
    expect(loadSnippets()).toEqual([{ name: 'sig', body: 'Best regards', origin: 'mine' }]);
    const s = (name: string, origin: Snippet['origin']): Snippet => ({ name, body: origin, origin });
    expect(mergeSnippets([s('Sig', 'folder')], [s('sig', 'mine'), s('todo', 'mine')], [s('todo', 'builtin')]).map((x) => `${x.name}:${x.origin}`)).toEqual(['Sig:folder', 'todo:mine']);
  });
});
