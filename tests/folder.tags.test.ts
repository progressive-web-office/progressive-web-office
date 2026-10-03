import { describe, expect, it } from 'vitest';
import { MemoryProvider } from '../src/fs';
import { noteTags, renameTag } from '../src/folder/tags';
import { NoteVault } from '../src/folder/vault';

describe('FOLDER-017 tags of notes', () => {
  it('reads tags from the front matter (tags, keywords) and #tags in the text', () => {
    const text = [
      '---',
      'title: Plan',
      'tags: [physics, Lab]',
      'keywords:',
      '  - optics',
      '---',
      '# Heading, not a tag',
      'A #todo and #course/semester-1, not#this, not a colour #fff3 nor `#code`.',
      '```',
      '#not-in-code',
      '```',
      'See https://example.org/#anchor.',
    ].join('\n');
    expect(noteTags(text)).toEqual(['physics', 'Lab', 'optics', 'todo', 'course/semester-1']);
    expect(noteTags('tags: not front matter #one')).toEqual(['one']);
    expect(noteTags('---\ntags: a, b\n---\nx')).toEqual(['a', 'b']);
  });

  it('renames a tag everywhere in a note, ignoring case', () => {
    const text = '---\ntags: [physics, lab]\n---\nA #Physics note, #physics/optics stays, #physicsX too.';
    const { text: out, count } = renameTag(text, 'physics', 'science');
    expect(count).toBe(2);
    expect(out).toBe('---\ntags: [science, lab]\n---\nA #science note, #physics/optics stays, #physicsX too.');
  });
});

describe('FOLDER-017/FOLDER-018 tags and links across the folder', () => {
  const vault = () =>
    new NoteVault(
      new MemoryProvider('m', 'M', {
        'a.md': '---\ntags: [physics]\n---\nSee [[b]] and [c](sub/c.md). #todo',
        'b.md': 'Back to [[a]]. #todo',
        'sub/c.md': 'Nothing.',
      }),
    );
  const notes = ['a.md', 'b.md', 'sub/c.md'];

  it('counts the notes of each tag', async () => {
    const tags = await vault().tags(notes);
    expect([...tags].map(([t, n]) => [t, n])).toEqual([
      ['todo', ['a.md', 'b.md']],
      ['physics', ['a.md']],
    ]);
  });

  it('gives the links between the notes', async () => {
    expect(await vault().links(notes)).toEqual([
      { from: 'a.md', to: 'b.md' },
      { from: 'a.md', to: 'sub/c.md' },
      { from: 'b.md', to: 'a.md' },
    ]);
  });

  it('renames a tag in every note of the folder', async () => {
    const v = vault();
    expect(await v.renameTag('todo', 'next', notes)).toEqual(['a.md', 'b.md']);
    expect([...(await v.tags(notes)).keys()]).toEqual(['next', 'physics']);
  });
});

describe('FOLDER-018 graph of the notes', () => {
  it('draws each note once and each link once, both ways as one double arrow', async () => {
    const { notesGraphSource } = await import('../src/folder/graph');
    const src = notesGraphSource(['a.md', 'b.md', 'sub/c "x".md'], [
      { from: 'a.md', to: 'b.md' },
      { from: 'b.md', to: 'a.md' },
      { from: 'a.md', to: 'sub/c "x".md' },
    ]);
    expect(src).toBe(['flowchart LR', '  n0["a"]', '  n1["b"]', '  n2["c #quot;x#quot;"]', '  n0 <--> n1', '  n0 --> n2'].join('\n'));
  });
});
