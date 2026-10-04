// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryProvider, type StorageProvider } from '../src/fs';
import { LocalRepo } from '../src/git/local';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// No automatic gc or maintenance in the background: it would race with the explicit repack below.
const NO_AUTO_GC = { GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'gc.auto', GIT_CONFIG_VALUE_0: '0', GIT_CONFIG_KEY_1: 'maintenance.auto', GIT_CONFIG_VALUE_1: 'false' };
const gitCli = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...NO_AUTO_GC, GIT_AUTHOR_NAME: 'Cli', GIT_AUTHOR_EMAIL: 'cli@x', GIT_COMMITTER_NAME: 'Cli', GIT_COMMITTER_EMAIL: 'cli@x' } });

/** A real repository made with the git command, packed, with a history. */
function realRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pwo-git-'));
  dirs.push(dir);
  gitCli(dir, 'init', '-q', '-b', 'main');
  gitCli(dir, 'config', 'user.name', 'Ada');
  gitCli(dir, 'config', 'user.email', 'ada@example.org');
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'notes.md'), '# Notes\n');
  writeFileSync(join(dir, 'README.md'), 'Hello\n');
  gitCli(dir, 'add', '.');
  gitCli(dir, 'commit', '-q', '-m', 'docs: first');
  writeFileSync(join(dir, 'docs', 'notes.md'), '# Notes\n\nMore\n');
  gitCli(dir, 'commit', '-q', '-am', 'docs: more notes');
  // Objects in a pack file, as most repositories have them.
  gitCli(dir, 'repack', '-a', '-d', '-q');
  return dir;
}

async function load(dir: string): Promise<MemoryProvider> {
  const mem = new MemoryProvider();
  const walk = async (rel: string): Promise<void> => {
    for (const name of readdirSync(join(dir, rel))) {
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(join(dir, r)).isDirectory()) {
        await mem.mkdir(r);
        await walk(r);
      } else await mem.write(r, new Blob([readFileSync(join(dir, r))]));
    }
  };
  await walk('');
  return mem;
}

/** The provider written back to disk, for the git command to check. */
async function save(mem: StorageProvider, dir: string, rel = ''): Promise<void> {
  for (const e of await mem.list(rel)) {
    if (e.kind === 'directory') {
      mkdirSync(join(dir, e.path), { recursive: true });
      await save(mem, dir, e.path);
    } else writeFileSync(join(dir, e.path), new Uint8Array(await (await mem.read(e.path)).arrayBuffer()));
  }
}

describe('GIT-017 commits made by the application in a working copy', () => {
  it('reads the branch, the author and the history of a real repository', async () => {
    const repo = new LocalRepo(await load(realRepo()));
    expect(await repo.branch()).toBe('main');
    expect(await repo.author('Me')).toEqual({ name: 'Ada', email: 'ada@example.org' });
    const log = await repo.listCommits('docs/notes.md');
    expect(log.map((c) => c.message)).toEqual(['docs: more notes', 'docs: first']);
    expect(new TextDecoder().decode(await repo.readAt(log[1]!.id, 'docs/notes.md'))).toBe('# Notes\n');
    // Only the commits that changed the file.
    expect((await repo.listCommits('README.md')).map((c) => c.message)).toEqual(['docs: first']);
  });

  it('commits a changed file, which the git command accepts', async () => {
    const dir = realRepo();
    const mem = await load(dir);
    const repo = new LocalRepo(mem);
    expect(await repo.changed('docs/notes.md')).toBe(false);
    await mem.write('docs/notes.md', new Blob(['# Notes\n\nEdited here\n']));
    await mem.write('docs/new.md', new Blob(['New\n']));
    expect(await repo.changed('docs/notes.md')).toBe(true);
    expect(await repo.changes()).toEqual([{ path: 'docs/new.md', status: 'new' }, { path: 'docs/notes.md', status: 'modified' }]);
    const id = await repo.commit(['docs/notes.md', 'docs/new.md'], 'docs: edit notes', await repo.author('Me'));
    expect(id).toMatch(/^[0-9a-f]{40}$/);
    expect(await repo.changes()).toEqual([]);
    expect((await repo.listCommits('docs/notes.md'))[0]!.message).toBe('docs: edit notes');
    // Written back to disk: git agrees.
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    await save(mem, dir);
    expect(gitCli(dir, 'log', '--format=%s|%an', '-n', '1')).toBe('docs: edit notes|Ada\n');
    expect(gitCli(dir, 'status', '--porcelain')).toBe('');
    expect(gitCli(dir, 'show', 'HEAD:docs/new.md')).toBe('New\n');
    gitCli(dir, 'fsck', '--strict');
  });

  it('commits a deleted file as removed', async () => {
    const mem = await load(realRepo());
    const repo = new LocalRepo(mem);
    await mem.remove('README.md');
    expect(await repo.changes()).toEqual([{ path: 'README.md', status: 'deleted' }]);
    await repo.commit(['README.md'], 'docs: remove readme', { name: 'Me', email: '' });
    expect(await repo.changes()).toEqual([]);
  });
});
