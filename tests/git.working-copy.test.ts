import { describe, expect, it } from 'vitest';
import { MemoryProvider } from '../src/fs';
import { parseHead, workingCopy } from '../src/git/working-copy';

describe('GIT-014 a folder that is a Git working copy', () => {
  it('reads the branch from HEAD', () => {
    expect(parseHead('ref: refs/heads/main\n')).toEqual({ branch: 'main' });
    expect(parseHead('ref: refs/heads/feature/x\n')).toEqual({ branch: 'feature/x' });
    expect(parseHead('0123456789abcdef0123456789abcdef01234567\n')).toEqual({ branch: '0123456', detached: true });
  });

  it('tells a working copy, a linked worktree, or none', async () => {
    const repo = new MemoryProvider();
    await repo.mkdir('.git');
    await repo.write('.git/HEAD', new Blob(['ref: refs/heads/dev\n']));
    expect(await workingCopy(repo)).toEqual({ branch: 'dev' });
    const worktree = new MemoryProvider();
    await worktree.write('.git', new Blob(['gitdir: /x/.git/worktrees/a\n']));
    expect(await workingCopy(worktree)).toEqual({});
    expect(await workingCopy(new MemoryProvider())).toBeUndefined();
  });
});
