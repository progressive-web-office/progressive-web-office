import { describe, expect, it } from 'vitest';
import { MemoryProvider } from '../src/fs';
import { NoteIndex, noteEntry } from '../src/folder/note-index';
import { resolveNote } from '../src/document/wiki-links';

// FOLDER-025: the index of the notes of a folder.

describe('FOLDER-025 index of the notes', () => {
  const N = 3000;
  const files: Record<string, string> = {};
  for (let i = 0; i < N; i++) files[`area ${i % 30}/Note ${i}.md`] = `---\ntags: [t${i % 50}]\naliases: [N${i}]\n---\n# Note ${i}\n\nSee [[Note ${(i + 1) % N}]], [[N${(i + 7) % N}]] and [[Missing ${i % 3}]]. #topic${i % 20}\n`;
  const meta = Object.keys(files).map((path) => ({ path, size: files[path]!.length, modified: 1 }));

  it('indexes thousands of notes and resolves their links at once, reading each note once', async () => {
    let reads = 0;
    const provider = new MemoryProvider('m', 'M', files);
    const index = new NoteIndex(provider, async (path) => {
      reads++;
      return files[path]!;
    });
    const t0 = performance.now();
    await index.update(meta);
    const links = index.links();
    const elapsed = performance.now() - t0;
    expect(reads).toBe(N);
    expect(links).toHaveLength(2 * N);
    expect(index.backlinks('area 1/Note 1.md').map((b) => b.from).sort()).toEqual(['area 0/Note 0.md', 'area 24/Note 2994.md']);
    expect(index.unresolved().get('Missing 0')).toHaveLength(N / 3);
    // A few seconds at most even on a slow machine (it took minutes, and froze the page, before).
    expect(elapsed).toBeLessThan(5000);

    // Nothing changed: nothing read again; one note changed: only it.
    await index.update(meta);
    expect(reads).toBe(N);
    await index.update(meta.map((m) => (m.path === 'area 0/Note 0.md' ? { ...m, modified: 2 } : m)));
    expect(reads).toBe(N + 1);
  });

  it('resolves as the links of the editor do: same folder first, then the shallowest, aliases, identifiers', async () => {
    const notes: Record<string, string> = {
      'a/Plan.md': 'x',
      'b/Plan.md': 'x',
      'Plan.md': 'x',
      'deep/x/y/Plan.md': 'x',
      'r.md': '---\naliases: [Roadmap]\n---\n',
      '202610041230 Idea.md': 'x',
    };
    const index = new NoteIndex(new MemoryProvider('m', 'M', notes));
    await index.update(Object.keys(notes).map((path) => ({ path })));
    const paths = Object.keys(notes);
    const aliases = new Map([['r.md', ['Roadmap']]]);
    for (const [target, from] of [['Plan', 'a/n.md'], ['Plan', 'b/n.md'], ['Plan', 'z/n.md'], ['x/y/Plan', 'n.md'], ['roadmap', 'n.md'], ['202610041230', 'n.md'], ['Nowhere', 'n.md'], ['', 'n.md']] as const) {
      expect(index.resolve(target, from), `${target} from ${from}`).toBe(resolveNote(target, paths, from, aliases));
    }
  });

  it('keeps the words around each link, not the whole text', () => {
    const e = noteEntry('n.md', `# Title\n\n${'Long text before. '.repeat(20)}The link to [[Other]] is here.\n\nAnother paragraph.`);
    expect(e.links[0]!.context).toMatch(/^….*The link to \[\[Other\]\] is here\.$/);
    expect(e.links[0]!.context.length).toBeLessThan(200);
  });
});
