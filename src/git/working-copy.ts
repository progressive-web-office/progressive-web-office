/**
 * GIT-014: a folder that is a Git working copy — its `.git` folder (or a
 * `.git` file, for a linked worktree) — and its current branch.
 */
import type { StorageProvider } from '../fs';

export interface WorkingCopy {
  /** The branch checked out; the short commit when detached; undefined for a linked worktree. */
  branch?: string;
  detached?: boolean;
}

/** What `.git/HEAD` says: `ref: refs/heads/main` or a commit. */
export function parseHead(text: string): WorkingCopy {
  const ref = /^ref:\s*refs\/heads\/(.+?)\s*$/m.exec(text);
  if (ref) return { branch: ref[1]! };
  const sha = /^([0-9a-f]{40,64})\s*$/m.exec(text);
  return sha ? { branch: sha[1]!.slice(0, 7), detached: true } : {};
}

export async function workingCopy(provider: StorageProvider): Promise<WorkingCopy | undefined> {
  try {
    const head = await (await provider.read('.git/HEAD')).text();
    return parseHead(head);
  } catch {
    /* no .git folder */
  }
  try {
    const file = await (await provider.read('.git')).text();
    if (/^gitdir:/m.test(file)) return {};
  } catch {
    /* no .git file */
  }
  return undefined;
}
