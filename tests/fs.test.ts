import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join as pjoin } from 'node:path';
import { checkName, copy, freeName, FsError, join, listFiles, MemoryProvider, moveByCopy, normalize, readText, relative, resolve, stat } from '../src/fs';

describe('FOLDER-004 file system module: paths', () => {
  it('normalizes and resolves paths without leaving the root', () => {
    expect(normalize('a//b/./c/../d/')).toBe('a/b/d');
    expect(() => normalize('../x')).toThrow(FsError);
    expect(join('a', '', 'b/c')).toBe('a/b/c');
    expect(resolve('notes/today.md', '../img/a.png')).toBe('img/a.png');
    expect(relative('book/ch/one.md', 'book/annex.md')).toBe('../annex.md');
    expect(relative('main.md', 'ch/one.md')).toBe('ch/one.md');
    expect(() => checkName('a/b')).toThrow(/Invalid name/);
    expect(checkName(' ok.md ')).toBe('ok.md');
  });
});

describe('FOLDER-004 file system module: providers', () => {
  const fresh = () => new MemoryProvider('m', 'M', { 'a.md': 'A', 'docs/b.md': 'B', 'docs/sub/c.md': 'C' });

  it('lists directories first, then files by name', async () => {
    const p = fresh();
    expect((await p.list('')).map((e) => `${e.kind}:${e.path}`)).toEqual(['directory:docs', 'file:a.md']);
    expect(await listFiles(p)).toEqual(['docs/sub/c.md', 'docs/b.md', 'a.md']);
    await expect(p.list('nope')).rejects.toMatchObject({ code: 'NotFound' });
  });

  it('writes, creates directories, moves, copies and removes', async () => {
    const p = fresh();
    await p.write('new/deep/x.md', new Blob(['X']));
    expect(await readText(p, 'new/deep/x.md')).toBe('X');
    await p.move('docs', 'archive/docs');
    expect(await listFiles(p, 'archive')).toEqual(['archive/docs/sub/c.md', 'archive/docs/b.md']);
    await expect(p.move('a.md', 'new/deep/x.md')).rejects.toMatchObject({ code: 'Exists' });
    await expect(p.move('archive', 'archive/inside')).rejects.toMatchObject({ code: 'Invalid' });
    await moveByCopy(p, 'a.md', 'renamed.md');
    expect(await stat(p, 'a.md')).toBeUndefined();
    await copy(p, 'archive', p, 'backup');
    expect(await readText(p, 'backup/docs/sub/c.md')).toBe('C');
    await expect(p.remove('backup')).rejects.toMatchObject({ code: 'NotEmpty' });
    await p.remove('backup', { recursive: true });
    expect(await stat(p, 'backup')).toBeUndefined();
    expect(await freeName(p, '', 'renamed.md')).toBe('renamed 2.md');
  });

  it('refuses changes to a read-only provider', async () => {
    const p = new MemoryProvider('r', 'R', { 'a.md': 'A' }, false);
    await expect(p.write('b.md', new Blob(['B']))).rejects.toMatchObject({ code: 'ReadOnly' });
    await expect(p.remove('a.md')).rejects.toMatchObject({ code: 'ReadOnly' });
  });

  it('depends on nothing outside src/fs (to become a library)', () => {
    const root = pjoin(__dirname, '../src/fs');
    const files: string[] = [];
    const visit = (dir: string): void => {
      for (const n of readdirSync(dir)) {
        const p = pjoin(dir, n);
        if (statSync(p).isDirectory()) visit(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    visit(root);
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1]!;
        expect(spec.startsWith('.'), `${f} imports ${spec}`).toBe(true);
        expect(pjoin(f, '..', spec).startsWith(root), `${f} imports ${spec}`).toBe(true);
      }
    }
  });
});

describe('FOLDER-004 local folder and browser storage providers', async () => {
  const { DirectoryHandleProvider, FileListProvider } = await import('../src/fs');
  const { fakeDirectory } = await import('./fake-fsa');

  for (const withMove of [false, true]) {
    it(`reads, writes, moves and removes through a directory handle (${withMove ? 'native move' : 'move by copy'})`, async () => {
      const p = new DirectoryHandleProvider(fakeDirectory('thesis', { 'main.md': '# T', 'ch/one.md': 'one', 'ch/img/a.png': 'png' }, withMove));
      expect(p.label).toBe('thesis');
      expect((await p.list('')).map((e) => e.path)).toEqual(['ch', 'main.md']);
      expect((await p.list('ch'))[1]).toMatchObject({ name: 'one.md', kind: 'file', size: 3 });
      expect(await readText(p, 'ch/one.md')).toBe('one');
      await p.write('ch/two.md', new Blob(['two']));
      await p.move('ch/two.md', 'parts/two.md');
      expect(await listFiles(p)).toEqual(['ch/img/a.png', 'ch/one.md', 'parts/two.md', 'main.md']); // folders first
      await p.move('ch', 'chapters');
      expect(await readText(p, 'chapters/img/a.png')).toBe('png');
      await expect(p.move('main.md', 'parts/two.md')).rejects.toMatchObject({ code: 'Exists' });
      await expect(p.read('nope.md')).rejects.toMatchObject({ code: 'NotFound' });
      await expect(p.remove('chapters')).rejects.toMatchObject({ code: 'NotEmpty' });
      await p.remove('chapters', { recursive: true });
      expect(await listFiles(p)).toEqual(['parts/two.md', 'main.md']);
    });
  }

  it('reads a folder picked in any browser, read-only', async () => {
    const f = (path: string, text: string): File => Object.defineProperty(new File([text], path.split('/').pop()!), 'webkitRelativePath', { value: `vault/${path}` });
    const p = new FileListProvider([f('a.md', 'A'), f('notes/b.md', 'B')]);
    expect(p.label).toBe('vault');
    expect(p.capabilities.write).toBe(false);
    expect(await listFiles(p)).toEqual(['notes/b.md', 'a.md']);
    await expect(p.write('c.md')).rejects.toMatchObject({ code: 'ReadOnly' });
  });
});
