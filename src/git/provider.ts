/**
 * A branch of a GitHub or GitLab repository as a storage provider of the file
 * explorer (FOLDER-007): the whole tree is listed in one request, and each
 * change (a document saved, a folder created, an entry renamed, moved or
 * deleted) is one commit. A folder holds at least one file in Git: a new one
 * gets an empty `.gitkeep`. A file changed in the repository since it was
 * read is not overwritten.
 */
import { basename, byKindThenName, dirname, isInside, normalize } from '../fs/path';
import { FsError, type Entry, type StorageProvider } from '../fs/types';
import { commitMessage } from './accounts';
import { GitConflictError, type GitChange, type GitClient, type GitRepo, type GitTreeEntry } from './types';

export class GitRepoProvider implements StorageProvider {
  readonly id: string;
  readonly label: string;
  readonly capabilities = { write: true, persistentAccess: true };
  private tree: Promise<Map<string, GitTreeEntry>> | undefined;
  /** Blob ids of the files as they were read, to detect changes made elsewhere. */
  private readonly known = new Map<string, string>();

  constructor(
    readonly client: GitClient,
    readonly repo: GitRepo,
    readonly branch: string,
  ) {
    this.id = `git:${client.provider}:${repo.id}@${branch}`;
    this.label = `${repo.name} (${branch})`;
  }

  /** The tree of the branch, by path (folders included), loaded once until the next change. */
  private index(): Promise<Map<string, GitTreeEntry>> {
    this.tree ??= this.client.listTree(this.repo.id, this.branch).then((entries) => {
      const map = new Map<string, GitTreeEntry>();
      for (const e of entries) {
        map.set(e.path, e);
        // Folders implied by their files.
        for (let d = dirname(e.path); d; d = dirname(d)) if (!map.has(d)) map.set(d, { path: d, type: 'dir', sha: '' });
      }
      return map;
    });
    this.tree.catch(() => (this.tree = undefined));
    return this.tree;
  }

  /** Reload the tree (after a change, or on request). */
  invalidate(): void {
    this.tree = undefined;
  }

  async list(path: string): Promise<Entry[]> {
    const dir = normalize(path);
    const tree = await this.index();
    if (dir && tree.get(dir)?.type !== 'dir') throw new FsError(tree.has(dir) ? 'Invalid' : 'NotFound', dir);
    const out: Entry[] = [];
    for (const e of tree.values()) {
      if (dirname(e.path) !== dir || e.path === dir) continue;
      out.push({ name: basename(e.path), path: e.path, kind: e.type === 'dir' ? 'directory' : 'file', ...(e.size !== undefined ? { size: e.size } : {}) });
    }
    return out.sort(byKindThenName);
  }

  async read(path: string): Promise<Blob> {
    const p = normalize(path);
    const tree = await this.index();
    if (tree.get(p)?.type !== 'file') throw new FsError('NotFound', p);
    const file = await this.client.readFile(this.repo.id, this.branch, p);
    this.known.set(p, tree.get(p)!.sha);
    return new Blob([file.bytes as BlobPart]);
  }

  private async commit(message: string, changes: GitChange[]): Promise<void> {
    try {
      await this.client.commit(this.repo.id, this.branch, message, changes);
    } catch (err) {
      if (err instanceof GitConflictError) throw new FsError('Conflict', changes[0]?.path ?? '', err.message);
      throw err;
    } finally {
      this.invalidate();
    }
  }

  /** Files of a path: itself, or everything under a folder. */
  private async filesOf(path: string): Promise<GitTreeEntry[]> {
    const tree = await this.index();
    const e = tree.get(path);
    if (!e) throw new FsError('NotFound', path);
    return e.type === 'file' ? [e] : [...tree.values()].filter((x) => x.type === 'file' && isInside(x.path, path) && x.path !== path);
  }

  async write(path: string, data: Blob): Promise<void> {
    const p = normalize(path);
    // The latest tree: was the file changed elsewhere since it was read?
    this.invalidate();
    const tree = await this.index();
    const current = tree.get(p);
    if (current?.type === 'dir') throw new FsError('Exists', p);
    const seen = this.known.get(p);
    if (current && seen !== undefined && seen !== current.sha) throw new FsError('Conflict', p, `${p} changed in the repository since it was opened.`);
    await this.commit(commitMessage(p, !!current), [{ action: current ? 'update' : 'create', path: p, bytes: new Uint8Array(await data.arrayBuffer()) }]);
    const now = (await this.index()).get(p);
    if (now) this.known.set(p, now.sha);
  }

  async mkdir(path: string): Promise<void> {
    const p = normalize(path);
    const tree = await this.index();
    if (tree.get(p)?.type === 'file') throw new FsError('Exists', p);
    if (tree.has(p)) return;
    await this.commit(`docs: add the folder ${p}`, [{ action: 'create', path: `${p}/.gitkeep`, bytes: new Uint8Array() }]);
  }

  async move(from: string, to: string): Promise<void> {
    const a = normalize(from);
    const b = normalize(to);
    const tree = await this.index();
    if (tree.has(b)) throw new FsError('Exists', b);
    if (isInside(b, a)) throw new FsError('Invalid', b, `Cannot move ${a} into itself`);
    const files = await this.filesOf(a);
    await this.commit(
      `docs: rename ${a} to ${b}`,
      files.map((f) => ({ action: 'move', from: f.path, path: b + f.path.slice(a.length), sha: f.sha })),
    );
    for (const f of files) {
      const sha = this.known.get(f.path);
      this.known.delete(f.path);
      if (sha !== undefined) this.known.set(b + f.path.slice(a.length), sha);
    }
  }

  async remove(path: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const p = normalize(path);
    const files = await this.filesOf(p);
    const tree = await this.index();
    if (tree.get(p)?.type === 'dir' && !opts.recursive && files.some((f) => basename(f.path) !== '.gitkeep')) throw new FsError('NotEmpty', p);
    await this.commit(`docs: delete ${p}`, files.map((f) => ({ action: 'delete', path: f.path })));
    for (const f of files) this.known.delete(f.path);
  }
}
