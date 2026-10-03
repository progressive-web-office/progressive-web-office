import { describe, expect, it } from 'vitest';
import { listFiles, FsError } from '../src/fs';
import { GitRepoProvider } from '../src/git/provider';
import { GitConflictError, type GitChange, type GitClient, type GitTreeEntry } from '../src/git/types';

/** A repository in memory: files by path, each commit applied at once. */
function fakeClient(initial: Record<string, string>) {
  const files = new Map<string, Uint8Array>(Object.entries(initial).map(([p, t]) => [p, new TextEncoder().encode(t)]));
  const commits: { message: string; changes: GitChange[] }[] = [];
  const sha = (bytes: Uint8Array) => `sha-${new TextDecoder().decode(bytes)}`;
  const client = {
    provider: 'github',
    async listTree(): Promise<GitTreeEntry[]> {
      const out: GitTreeEntry[] = [];
      const dirs = new Set<string>();
      for (const [p, b] of files) {
        out.push({ path: p, type: 'file', size: b.length, sha: sha(b) });
        const parts = p.split('/');
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
      }
      for (const d of dirs) out.push({ path: d, type: 'dir', sha: `tree-${d}` });
      return out;
    },
    async readFile(_r: string, _ref: string, path: string) {
      const b = files.get(path);
      if (!b) throw new Error('missing');
      return { bytes: b, version: sha(b) };
    },
    async commit(_r: string, _branch: string, message: string, changes: GitChange[]) {
      commits.push({ message, changes });
      for (const c of changes) {
        if (c.action === 'delete') files.delete(c.path);
        else if (c.action === 'move') {
          files.set(c.path, files.get(c.from)!);
          files.delete(c.from);
        } else files.set(c.path, c.bytes);
      }
    },
  } as unknown as GitClient;
  return { client, files, commits };
}

const repo = { id: 'me/notes', name: 'me/notes', defaultBranch: 'main' };

describe('FOLDER-007 Git repositories in the file explorer', () => {
  it('lists the repository as folders, in one request for the whole tree', async () => {
    const { client } = fakeClient({ 'README.md': '# R', 'docs/a.md': 'A', 'docs/img/x.png': 'P' });
    const p = new GitRepoProvider(client, repo, 'main');
    expect(p.label).toBe('me/notes (main)');
    expect((await p.list('')).map((e) => [e.name, e.kind])).toEqual([['docs', 'directory'], ['README.md', 'file']]);
    expect(await listFiles(p)).toEqual(['docs/img/x.png', 'docs/a.md', 'README.md']);
    expect(await (await p.read('docs/a.md')).text()).toBe('A');
    await expect(p.list('nope')).rejects.toBeInstanceOf(FsError);
  });

  it('makes each change a commit: write, folder, rename, move, delete', async () => {
    const { client, files, commits } = fakeClient({ 'docs/a.md': 'A', 'docs/b.md': 'B' });
    const p = new GitRepoProvider(client, repo, 'main');
    await p.read('docs/a.md');
    await p.write('docs/a.md', new Blob(['A2']));
    await p.write('new.md', new Blob(['N']));
    await p.mkdir('empty');
    await p.move('docs/b.md', 'docs/c.md');
    await p.move('docs', 'archive/docs');
    await p.remove('new.md');
    expect([...files.keys()].sort()).toEqual(['archive/docs/a.md', 'archive/docs/c.md', 'empty/.gitkeep']);
    expect(commits.map((c) => c.message)).toEqual([
      'docs: update a.md',
      'docs: add new.md',
      'docs: add the folder empty',
      'docs: rename docs/b.md to docs/c.md',
      'docs: rename docs to archive/docs',
      'docs: delete new.md',
    ]);
    // A folder moves in one commit, file by file.
    expect(commits[4]!.changes.map((c) => c.action)).toEqual(['move', 'move']);
  });

  it('refuses to overwrite a file changed in the repository since it was read', async () => {
    const { client, files } = fakeClient({ 'a.md': 'A' });
    const p = new GitRepoProvider(client, repo, 'main');
    await p.read('a.md');
    files.set('a.md', new TextEncoder().encode('changed elsewhere'));
    const err = await p.write('a.md', new Blob(['mine'])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FsError);
    expect((err as FsError).code).toBe('Conflict');
    expect(new TextDecoder().decode(files.get('a.md'))).toBe('changed elsewhere');
  });

  it('turns a refused commit into a conflict', async () => {
    const { client } = fakeClient({ 'a.md': 'A' });
    (client as unknown as { commit: () => Promise<void> }).commit = async () => {
      throw new GitConflictError();
    };
    const p = new GitRepoProvider(client, repo, 'main');
    await expect(p.write('b.md', new Blob(['B']))).rejects.toMatchObject({ code: 'Conflict' });
  });
});

describe('GIT-011 an empty repository as a folder', () => {
  it('lists nothing and writes its first file', async () => {
    const { GitError } = await import('../src/git/types');
    const written: string[] = [];
    let empty = true;
    const client = {
      provider: 'github',
      async listTree(): Promise<GitTreeEntry[]> {
        if (empty) throw new GitError('409 Git Repository is empty.', 409);
        return written.map((p) => ({ path: p, type: 'file', sha: `sha-${p}` }));
      },
      async writeFile(_r: string, _b: string, path: string) {
        written.push(path);
        empty = false;
        return { version: `sha-${path}` };
      },
      async commit() {
        throw new Error('no head on an empty repository');
      },
    } as unknown as GitClient;
    const provider = new GitRepoProvider(client, { id: 'me/empty', name: 'me/empty', defaultBranch: 'main' }, 'main');
    expect(await provider.list('')).toEqual([]);
    await provider.write('notes/first.md', new Blob(['# First']));
    expect(written).toEqual(['notes/first.md']);
    expect((await provider.list('')).map((e) => e.name)).toEqual(['notes']);
  });
});
