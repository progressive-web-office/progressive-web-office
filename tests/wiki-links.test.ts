import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { frontMatterAliases, frontMatterId, newNoteId, newNoteText, noteId, parseWikiLinks, renameWikiLinks, resolveNote } from '../src/document/wiki-links';

const MD = 'See [[PID control]], [[notes/Tuning#Ziegler|the method]] and [[#Intro]].\n\n![[diagram.png]] ![[Glossary]]\n';

describe('FOLDER-005 wiki links between notes', () => {
  it('reads links, headings, aliases and embeds', () => {
    const [p, q] = readMarkdown(MD).blocks as { runs: unknown[] }[];
    expect(p!.runs).toEqual([
      { text: 'See ' },
      { text: 'PID control', link: 'wiki:PID control' },
      { text: ', ' },
      { text: 'the method', link: 'wiki:notes/Tuning#Ziegler' },
      { text: ' and ' },
      { text: 'Intro', link: 'wiki:#Intro' },
      { text: '.' },
    ]);
    expect(q!.runs).toEqual([{ image: '', src: 'diagram.png', title: 'embed' }, { text: ' ' }, { text: 'Glossary', link: 'wiki:!Glossary' }]);
  });

  it('writes them back as they were', () => {
    expect(writeMarkdown(readMarkdown(MD), { frontMatter: false })).toBe(MD);
  });

  it('parses, resolves and renames links', () => {
    expect(parseWikiLinks('[[a]] ![[b#h|B]]').map((l) => [l.target, l.heading, l.alias, l.embed])).toEqual([
      ['a', undefined, undefined, false],
      ['b', 'h', 'B', true],
    ]);
    const notes = ['PID control.md', 'notes/Tuning.md', 'notes/PID control.md', 'archive/Old.md'];
    expect(resolveNote('PID control', notes, 'notes/today.md')).toBe('notes/PID control.md'); // same folder first
    expect(resolveNote('PID control', notes, 'index.md')).toBe('PID control.md');
    expect(resolveNote('notes/Tuning', notes, 'index.md')).toBe('notes/Tuning.md');
    expect(resolveNote('Ancient', notes, 'index.md', new Map([['archive/Old.md', ['Ancient']]]))).toBe('archive/Old.md');
    expect(resolveNote('Missing', notes, 'index.md')).toBeUndefined();
    expect(renameWikiLinks('[[Tuning]] [[notes/Tuning#Z|z]] ![[tuning]] [[Other]]', 'Tuning', 'Settings')).toEqual({ text: '[[Settings]] [[notes/Settings#Z|z]] ![[Settings]] [[Other]]', count: 3 });
  });

  it('reads aliases from the front matter', () => {
    expect(frontMatterAliases('---\ntitle: A\naliases: [Alpha, "First"]\n---\n# A')).toEqual(['Alpha', 'First']);
    expect(frontMatterAliases('---\naliases:\n  - Alpha\n  - Beta\ntags: [x]\n---\n')).toEqual(['Alpha', 'Beta']);
    expect(frontMatterAliases('# no front matter')).toEqual([]);
  });
});

describe('FOLDER-005 note vault', async () => {
  const { MemoryProvider, readText } = await import('../src/fs');
  const { NoteVault } = await import('../src/folder/vault');
  const files = {
    'index.md': '# Index\n\n[[Control]] and [the plan](notes/plan.md).',
    'notes/plan.md': '---\naliases: [Roadmap]\n---\n# Plan\n\nSee [[Control#PID|PID]].',
    'notes/control.md': '# Control',
    'other.md': 'Nothing here, [[Roadmap]].',
  };

  it('finds backlinks through names, aliases and relative links', async () => {
    const vault = new NoteVault(new MemoryProvider('m', 'M', files));
    expect((await vault.backlinks('notes/control.md')).map((b) => b.from)).toEqual(['index.md', 'notes/plan.md']);
    expect((await vault.backlinks('notes/plan.md')).map((b) => b.from)).toEqual(['index.md', 'other.md']);
    expect(await vault.resolve('Roadmap', 'other.md')).toBe('notes/plan.md');
    // FOLDER-025: with the words around the link.
    expect((await vault.backlinks('notes/control.md'))[1]!.context).toBe('See [[Control#PID|PID]].');
  });

  it('updates links when a note is renamed', async () => {
    const p = new MemoryProvider('m', 'M', files);
    const vault = new NoteVault(p);
    await p.move('notes/control.md', 'notes/regulation.md');
    expect(await vault.renameLinks('notes/control.md', 'notes/regulation.md')).toEqual(['index.md', 'notes/plan.md']);
    expect(await readText(p, 'notes/plan.md')).toContain('See [[regulation#PID|PID]].');
    expect(await readText(p, 'index.md')).toContain('[[regulation]] and');
  });
});

describe('FOLDER-024 note identifiers', () => {
  it('reads the identifier at the start of a note name, or in its front matter', () => {
    expect(noteId('notes/202410031530 Entropy.md')).toBe('202410031530');
    expect(noteId('20241003-entropy.md')).toBe('20241003');
    expect(noteId('2024 plan.md')).toBeUndefined();
    expect(noteId('Entropy.md')).toBeUndefined();
    expect(frontMatterId('---\nid: 202410031530\ntitle: E\n---\n# E\n')).toBe('202410031530');
    expect(frontMatterId('# E\n')).toBeUndefined();
  });

  it('links by identifier: [[202410031530]] goes to the note named or marked with it', () => {
    const notes = ['index.md', 'z/202410031530 Entropy.md', 'other.md'];
    expect(resolveNote('202410031530', notes, 'index.md')).toBe('z/202410031530 Entropy.md');
    expect(resolveNote('20991231', notes, 'index.md', new Map([['other.md', ['20991231']]]))).toBe('other.md');
  });

  it('gives a new note an identifier from the date and time', () => {
    expect(newNoteId(new Date(2024, 9, 3, 15, 30, 12))).toBe('202410031530');
    expect(newNoteText('202410031530', 'Entropy')).toBe('---\nid: 202410031530\n---\n# Entropy\n');
  });
});
