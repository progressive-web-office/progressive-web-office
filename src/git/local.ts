/**
 * GIT-017: a Git working copy opened from disk (or the local network, or the
 * browser's storage), committed to by the application itself with
 * isomorphic-git: Git, not the application, keeps the versions.
 */
import './buffer-shim';
import git, { type PromiseFsClient } from 'isomorphic-git';
import { basename, dirname, FsError, type StorageProvider } from '../fs';
import type { GitCommit } from './types';

/** An error as Node's fs gives it, which isomorphic-git understands. */
function fsError(code: 'ENOENT' | 'EEXIST' | 'ENOTDIR' | 'ENOTEMPTY', path: string): Error {
  return Object.assign(new Error(`${code}: ${path}`), { code });
}

const rel = (path: string): string => {
  const p = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/^\.\/+/, '');
  return p === '.' ? '' : p;
};

interface Stats {
  type: 'file' | 'dir';
  mode: number;
  size: number;
  ino: number;
  mtimeMs: number;
  ctimeMs: number;
  uid: number;
  gid: number;
  dev: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

const stats = (type: 'file' | 'dir', size = 0, mtimeMs = 0): Stats => ({
  type,
  mode: type === 'dir' ? 0o40000 : 0o100644,
  size,
  ino: 0,
  mtimeMs,
  ctimeMs: mtimeMs,
  uid: 1,
  gid: 1,
  dev: 1,
  isFile: () => type === 'file',
  isDirectory: () => type === 'dir',
  isSymbolicLink: () => false,
});

/** The fs `promises` API isomorphic-git needs, over a storage provider. */
export function providerFs(provider: StorageProvider): PromiseFsClient {
  const notFound = (err: unknown, path: string): never => {
    if (err instanceof FsError && err.code === 'NotFound') throw fsError('ENOENT', path);
    throw err;
  };
  const stat = async (path: string): Promise<Stats> => {
    const p = rel(path);
    if (!p) return stats('dir');
    let entries;
    try {
      entries = await provider.list(dirname(p));
    } catch (err) {
      return notFound(err, path);
    }
    const e = entries.find((x) => x.name === basename(p));
    if (!e) throw fsError('ENOENT', path);
    return e.kind === 'directory' ? stats('dir') : stats('file', e.size ?? 0, e.lastModified ?? 0);
  };
  const promises = {
    async readFile(path: string, opts?: { encoding?: string } | string): Promise<Uint8Array | string> {
      let blob: Blob;
      try {
        blob = await provider.read(rel(path));
      } catch (err) {
        return notFound(err, path);
      }
      const encoding = typeof opts === 'string' ? opts : opts?.encoding;
      return encoding === 'utf8' ? blob.text() : new Uint8Array(await blob.arrayBuffer());
    },
    async writeFile(path: string, data: Uint8Array | string): Promise<void> {
      await provider.write(rel(path), new Blob([data as BlobPart]));
    },
    async unlink(path: string): Promise<void> {
      try {
        await provider.remove(rel(path));
      } catch (err) {
        notFound(err, path);
      }
    },
    async readdir(path: string): Promise<string[]> {
      try {
        return (await provider.list(rel(path))).map((e) => e.name);
      } catch (err) {
        return notFound(err, path);
      }
    },
    async mkdir(path: string): Promise<void> {
      try {
        await provider.mkdir(rel(path));
      } catch (err) {
        if (err instanceof FsError && err.code === 'Exists') return;
        throw err;
      }
    },
    async rmdir(path: string): Promise<void> {
      try {
        await provider.remove(rel(path), { recursive: false });
      } catch (err) {
        if (err instanceof FsError && err.code === 'NotEmpty') throw fsError('ENOTEMPTY', path);
        notFound(err, path);
      }
    },
    stat,
    lstat: stat,
    async readlink(path: string): Promise<never> {
      throw fsError('ENOENT', path);
    },
    async symlink(): Promise<void> {
      throw new Error('Symbolic links are not supported here.');
    },
    async chmod(): Promise<void> {},
  };
  return { promises };
}

export interface Author {
  name: string;
  email: string;
}

/** A working copy, its files and its commits. */
export class LocalRepo {
  private readonly fs: ReturnType<typeof providerFs>;
  private readonly dir = '/';

  constructor(readonly provider: StorageProvider) {
    this.fs = providerFs(provider);
  }

  async branch(): Promise<string | undefined> {
    return (await git.currentBranch({ fs: this.fs, dir: this.dir, fullname: false })) ?? undefined;
  }

  /** The author: the repository's own `user.name` / `user.email`, else the name given. */
  async author(fallbackName: string): Promise<Author> {
    const name = (await git.getConfig({ fs: this.fs, dir: this.dir, path: 'user.name' }).catch(() => undefined)) as string | undefined;
    const email = (await git.getConfig({ fs: this.fs, dir: this.dir, path: 'user.email' }).catch(() => undefined)) as string | undefined;
    return { name: name || fallbackName || 'Progressive Web Office', email: email || '' };
  }

  /** Whether a file differs from its last commit (or is new). */
  async changed(path: string): Promise<boolean> {
    const status = await git.status({ fs: this.fs, dir: this.dir, filepath: rel(path) });
    return status !== 'unmodified' && status !== 'ignored';
  }

  /** Commits the files given as they are on disk (deleted ones removed); returns the commit id. */
  async commit(paths: string[], message: string, author: Author): Promise<string> {
    for (const path of paths) {
      const p = rel(path);
      const exists = await (this.fs.promises.stat as (path: string) => Promise<unknown>)(p).then(() => true, () => false);
      if (exists) await git.add({ fs: this.fs, dir: this.dir, filepath: p });
      else await git.remove({ fs: this.fs, dir: this.dir, filepath: p });
    }
    return git.commit({ fs: this.fs, dir: this.dir, message, author });
  }

  /** The files changed since the last commit (not ignored), with what happened to them. */
  async changes(): Promise<{ path: string; status: 'new' | 'modified' | 'deleted' }[]> {
    const matrix = await git.statusMatrix({ fs: this.fs, dir: this.dir, filter: (f) => !f.startsWith('.git/') });
    const out: { path: string; status: 'new' | 'modified' | 'deleted' }[] = [];
    for (const [path, head, workdir, stage] of matrix) {
      if (head === 0 && workdir === 2) out.push({ path, status: 'new' });
      else if (head === 1 && workdir === 0) out.push({ path, status: 'deleted' });
      else if (head === 1 && (workdir === 2 || stage !== 1)) out.push({ path, status: 'modified' });
    }
    return out;
  }

  /** VER-002: the commits that changed a file, newest first. */
  async listCommits(path: string, depth = 300): Promise<GitCommit[]> {
    let log;
    try {
      log = await git.log({ fs: this.fs, dir: this.dir, filepath: rel(path), depth, force: true });
    } catch (err) {
      if ((err as { code?: string }).code === 'NotFoundError') return [];
      throw err;
    }
    return log.map((c) => ({ id: c.oid, message: c.commit.message.split('\n')[0]!, author: c.commit.author.name, date: new Date(c.commit.author.timestamp * 1000).toISOString() }));
  }

  /** A file as it was in a commit. */
  async readAt(oid: string, path: string): Promise<Uint8Array> {
    return (await git.readBlob({ fs: this.fs, dir: this.dir, oid, filepath: rel(path) })).blob;
  }
}
