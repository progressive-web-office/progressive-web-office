/** GitHub REST API client (github.com or Enterprise `/api/v3`). */
import { encodePath, fromBase64, GitError, requestJson, sortEntries, toBase64, type ClientConfig, type FetchFn, type GitChange, type GitClient, type GitEntry, type GitFile, type GitRepo, type GitTreeEntry } from './types';

interface RepoJson {
  full_name: string;
  default_branch: string;
  private?: boolean;
}

const repoOf = (r: RepoJson): GitRepo => ({ id: r.full_name, name: r.full_name, defaultBranch: r.default_branch, private: !!r.private });

export class GitHubClient implements GitClient {
  readonly provider = 'github' as const;
  private readonly api: string;

  constructor(
    private readonly config: ClientConfig,
    private readonly fetchFn: FetchFn = (i, init) => fetch(i, init),
  ) {
    this.api = config.apiUrl.replace(/\/+$/, '');
  }

  private req<T>(path: string, init: RequestInit = {}, conflict?: (s: number, m: string) => boolean): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
    if (this.config.token) headers.authorization = `Bearer ${this.config.token}`;
    if (init.body) headers['content-type'] = 'application/json';
    return requestJson<T>(this.fetchFn, `${this.api}${path}`, { ...init, headers }, conflict);
  }

  async listRepos(): Promise<GitRepo[]> {
    const repos = await this.req<RepoJson[]>('/user/repos?per_page=100&sort=updated');
    return repos.map(repoOf);
  }

  async getRepo(name: string): Promise<GitRepo> {
    return repoOf(await this.req<RepoJson>(`/repos/${encodePath(name)}`));
  }

  async listBranches(repo: string): Promise<string[]> {
    const branches = await this.req<{ name: string }[]>(`/repos/${encodePath(repo)}/branches?per_page=100`);
    return branches.map((b) => b.name);
  }

  async listDir(repo: string, ref: string, path: string): Promise<GitEntry[]> {
    const p = encodePath(path);
    const items = await this.req<{ name: string; path: string; type: string; size?: number }[]>(`/repos/${encodePath(repo)}/contents${p ? '/' + p : ''}?ref=${encodeURIComponent(ref)}`);
    return sortEntries(
      items
        .filter((i) => i.type === 'file' || i.type === 'dir')
        .map((i) => (i.type === 'dir' ? { name: i.name, path: i.path, type: 'dir' } : { name: i.name, path: i.path, type: 'file', size: i.size })),
    );
  }

  async readFile(repo: string, ref: string, path: string): Promise<GitFile> {
    const file = await this.req<{ type: string; sha: string; content?: string; encoding?: string }>(`/repos/${encodePath(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
    if (file.type !== 'file') throw new Error(`${path} is not a file.`);
    if (file.encoding === 'base64' && file.content !== undefined) return { bytes: fromBase64(file.content), version: file.sha };
    // Files over 1 MB: the contents API omits the data, the blob API has it.
    const blob = await this.req<{ content: string }>(`/repos/${encodePath(repo)}/git/blobs/${file.sha}`);
    return { bytes: fromBase64(blob.content), version: file.sha };
  }

  async writeFile(repo: string, branch: string, path: string, bytes: Uint8Array, message: string, version?: string): Promise<{ version: string }> {
    const body: Record<string, string> = { message, content: toBase64(bytes), branch };
    if (version) body.sha = version;
    const res = await this.req<{ content: { sha: string } }>(
      `/repos/${encodePath(repo)}/contents/${encodePath(path)}`,
      { method: 'PUT', body: JSON.stringify(body) },
      // 409: sha mismatch; 422 without sha: the file already exists.
      (status) => status === 409 || (status === 422 && !version),
    );
    return { version: res.content.sha };
  }

  async listTree(repo: string, ref: string): Promise<GitTreeEntry[]> {
    const res = await this.req<{ tree: { path: string; type: string; sha: string; size?: number }[]; truncated?: boolean }>(`/repos/${encodePath(repo)}/git/trees/${encodePath(ref)}?recursive=1`);
    if (res.truncated) throw new GitError('The repository is too large to be listed at once.', 0);
    return res.tree
      .filter((e) => e.type === 'blob' || e.type === 'tree')
      .map((e) => (e.type === 'tree' ? { path: e.path, type: 'dir', sha: e.sha } : { path: e.path, type: 'file', sha: e.sha, ...(e.size !== undefined ? { size: e.size } : {}) }));
  }

  /** Git data API: blobs, a tree on the branch's, a commit, then the branch moved to it (fast-forward only). */
  async commit(repo: string, branch: string, message: string, changes: GitChange[]): Promise<void> {
    const r = `/repos/${encodePath(repo)}`;
    const head = (await this.req<{ object: { sha: string } }>(`${r}/git/ref/heads/${encodePath(branch)}`)).object.sha;
    const base = (await this.req<{ tree: { sha: string } }>(`${r}/git/commits/${head}`)).tree.sha;
    const tree: { path: string; mode: string; type: 'blob'; sha: string | null }[] = [];
    for (const c of changes) {
      if ('bytes' in c) {
        const blob = await this.req<{ sha: string }>(`${r}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: toBase64(c.bytes), encoding: 'base64' }) });
        tree.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
      } else if (c.action === 'delete') tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null });
      else {
        const sha = c.sha ?? (await this.listTree(repo, head)).find((e) => e.path === c.from)?.sha;
        if (!sha) throw new GitError(`${c.from} is not in the repository.`, 404);
        tree.push({ path: c.path, mode: '100644', type: 'blob', sha }, { path: c.from, mode: '100644', type: 'blob', sha: null });
      }
    }
    const newTree = await this.req<{ sha: string }>(`${r}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: base, tree }) });
    const commit = await this.req<{ sha: string }>(`${r}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }) });
    // 422: not a fast-forward, the branch moved since.
    await this.req(`${r}/git/refs/heads/${encodePath(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) }, (status) => status === 422);
  }

  async createBranch(repo: string, from: string, name: string): Promise<void> {
    const ref = await this.req<{ object: { sha: string } }>(`/repos/${encodePath(repo)}/git/ref/heads/${encodePath(from)}`);
    await this.req(`/repos/${encodePath(repo)}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${name}`, sha: ref.object.sha }) });
  }
}
