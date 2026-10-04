/**
 * GIT-016: Gitea and Forgejo REST API client (`/api/v1`) — on their sites
 * (Codeberg…), self-hosted, or on the local network.
 */
import { encodePath, fromBase64, GitError, requestJson, sortEntries, toBase64, type ClientConfig, type FetchFn, type GitChange, type GitClient, type GitCommit, type GitEntry, type GitFile, type GitMember, type GitRepo, type GitRole, type GitTreeEntry } from './types';

interface RepoJson {
  full_name: string;
  default_branch?: string;
  private?: boolean;
  internal?: boolean;
  empty?: boolean;
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
}

const roleOf = (p: RepoJson['permissions']): GitRole | undefined => (!p ? undefined : p.admin ? 'admin' : p.push ? 'write' : p.pull ? 'read' : undefined);

const repoOf = (r: RepoJson): GitRepo => {
  const role = roleOf(r.permissions);
  const visibility = r.internal ? 'internal' : r.private ? 'private' : 'public';
  return { id: r.full_name, name: r.full_name, defaultBranch: r.default_branch || 'main', private: !!r.private || !!r.internal, visibility, ...(role ? { role } : {}) };
};

/** Gitea's collaborator permissions: none, read, write, admin, owner. */
const memberRole = (p: string | undefined): GitRole => (p === 'owner' ? 'owner' : p === 'admin' ? 'admin' : p === 'write' ? 'write' : 'read');

export class GiteaClient implements GitClient {
  readonly provider = 'gitea' as const;
  private readonly api: string;

  constructor(
    private readonly config: ClientConfig,
    private readonly fetchFn: FetchFn = (i, init) => fetch(i, init),
  ) {
    this.api = config.apiUrl.replace(/\/+$/, '');
  }

  get signedIn(): boolean {
    return !!this.config.token;
  }

  private req<T>(path: string, init: RequestInit = {}, conflict?: (s: number, m: string) => boolean): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.config.token) headers.authorization = `token ${this.config.token}`;
    if (init.body) headers['content-type'] = 'application/json';
    return requestJson<T>(this.fetchFn, `${this.api}${path}`, { ...init, headers }, conflict);
  }

  async listRepos(): Promise<GitRepo[]> {
    return (await this.req<RepoJson[]>('/user/repos?limit=50')).map(repoOf);
  }

  async getRepo(name: string): Promise<GitRepo> {
    return repoOf(await this.req<RepoJson>(`/repos/${encodePath(name)}`));
  }

  async listBranches(repo: string): Promise<string[]> {
    return (await this.req<{ name: string }[]>(`/repos/${encodePath(repo)}/branches?limit=50`)).map((b) => b.name);
  }

  async listDir(repo: string, ref: string, path: string): Promise<GitEntry[]> {
    const p = encodePath(path);
    const items = await this.req<{ name: string; path: string; type: string; size?: number }[]>(`/repos/${encodePath(repo)}/contents${p ? `/${p}` : ''}?ref=${encodeURIComponent(ref)}`);
    return sortEntries(items.filter((i) => i.type === 'file' || i.type === 'dir').map((i) => (i.type === 'dir' ? { name: i.name, path: i.path, type: 'dir' } : { name: i.name, path: i.path, type: 'file', size: i.size })));
  }

  async readFile(repo: string, ref: string, path: string): Promise<GitFile> {
    const file = await this.req<{ type: string; sha: string; content?: string | null; encoding?: string | null }>(`/repos/${encodePath(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
    if (file.type !== 'file') throw new Error(`${path} is not a file.`);
    if (file.encoding === 'base64' && typeof file.content === 'string') return { bytes: fromBase64(file.content), version: file.sha };
    // Large files: the contents API leaves the data out; the raw endpoint has it.
    const res = await this.fetchFn(`${this.api}/repos/${encodePath(repo)}/raw/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, { headers: this.config.token ? { authorization: `token ${this.config.token}` } : {} });
    if (!res.ok) throw new GitError(`${res.status} ${res.statusText}`, res.status);
    return { bytes: new Uint8Array(await res.arrayBuffer()), version: file.sha };
  }

  async writeFile(repo: string, branch: string, path: string, bytes: Uint8Array, message: string, version?: string): Promise<{ version: string }> {
    const send = (withBranch: boolean): Promise<{ content: { sha: string } }> =>
      this.req<{ content: { sha: string } }>(
        `/repos/${encodePath(repo)}/contents/${encodePath(path)}`,
        // Gitea creates with POST and updates with PUT (the sha of the file replaced).
        { method: version ? 'PUT' : 'POST', body: JSON.stringify({ message, content: toBase64(bytes), ...(withBranch ? { branch } : {}), ...(version ? { sha: version } : {}) }) },
        // 409 or 422: the file changed (sha), or already exists.
        (status) => status === 409 || status === 422,
      );
    let res;
    try {
      res = await send(true);
    } catch (err) {
      // GIT-011: an empty repository has no branch yet.
      if (version || !(err instanceof GitError) || err.status !== 404) throw err;
      res = await send(false);
    }
    return { version: res.content.sha };
  }

  async createBranch(repo: string, from: string, name: string): Promise<void> {
    await this.req(`/repos/${encodePath(repo)}/branches`, { method: 'POST', body: JSON.stringify({ new_branch_name: name, old_branch_name: from }) });
  }

  async listTree(repo: string, ref: string): Promise<GitTreeEntry[]> {
    const r = `/repos/${encodePath(repo)}`;
    const head = (await this.req<{ commit: { id: string } }>(`${r}/branches/${encodePath(ref)}`).catch(() => ({ commit: { id: ref } }))).commit.id;
    const out: GitTreeEntry[] = [];
    for (let page = 1; page < 100; page++) {
      const res = await this.req<{ tree: { path: string; type: string; sha: string; size?: number }[] | null; truncated?: boolean }>(`${r}/git/trees/${encodeURIComponent(head)}?recursive=true&per_page=1000&page=${page}`);
      for (const e of res.tree ?? []) {
        if (e.type === 'tree') out.push({ path: e.path, type: 'dir', sha: e.sha });
        else if (e.type === 'blob') out.push({ path: e.path, type: 'file', sha: e.sha, ...(e.size !== undefined ? { size: e.size } : {}) });
      }
      if (!res.truncated) return out;
    }
    throw new GitError('The repository is too large to be listed at once.', 0);
  }

  /** Several changes in one commit (Gitea 1.20+, Forgejo): the files changed by their sha, so a file changed meanwhile is a conflict. */
  async commit(repo: string, branch: string, message: string, changes: GitChange[]): Promise<void> {
    const tree = changes.some((c) => c.action !== 'create') ? await this.listTree(repo, branch) : [];
    const shaOf = (path: string): string | undefined => tree.find((e) => e.path === path && e.type === 'file')?.sha;
    const read = (path: string): Promise<GitFile> => this.readFile(repo, branch, path);
    const files = [];
    for (const c of changes) files.push(await operation(c));
    await this.req(`/repos/${encodePath(repo)}/contents`, { method: 'POST', body: JSON.stringify({ branch, message, files }) }, (status) => status === 409 || status === 422);
    async function operation(c: GitChange): Promise<Record<string, string | undefined>> {
      if (c.action === 'delete') return { operation: 'delete', path: c.path, sha: shaOf(c.path) };
      // A move carries the content too: an update without it would empty the file.
      if (c.action === 'move') return { operation: 'update', path: c.path, from_path: c.from, sha: c.sha ?? shaOf(c.from), content: toBase64((await read(c.from)).bytes) };
      if (c.action === 'create') return { operation: 'create', path: c.path, content: toBase64(c.bytes) };
      return { operation: 'update', path: c.path, content: toBase64(c.bytes), sha: shaOf(c.path) };
    }
  }

  async createPullRequest(repo: string, head: string, base: string, title: string, body: string): Promise<{ number: number; url: string }> {
    const pr = await this.req<{ number: number; html_url: string }>(`/repos/${encodePath(repo)}/pulls`, { method: 'POST', body: JSON.stringify({ head, base, title, body }) });
    return { number: pr.number, url: pr.html_url };
  }

  async listCollaborators(repo: string): Promise<GitMember[]> {
    const r = `/repos/${encodePath(repo)}`;
    const people = await this.req<{ login: string; full_name?: string; avatar_url?: string }[]>(`${r}/collaborators?limit=50`);
    return Promise.all(
      people.map(async (p) => {
        const perm = await this.req<{ permission?: string }>(`${r}/collaborators/${encodeURIComponent(p.login)}/permission`).catch(() => ({ permission: undefined }));
        return { login: p.login, ...(p.full_name ? { name: p.full_name } : {}), role: memberRole(perm.permission), ...(p.avatar_url ? { avatar: p.avatar_url } : {}) };
      }),
    );
  }

  async listCommits(repo: string, ref: string, path: string): Promise<GitCommit[]> {
    const list = await this.req<{ sha: string; commit: { message: string; author?: { name?: string; date?: string } }; author?: { login?: string } | null }[]>(
      `/repos/${encodePath(repo)}/commits?sha=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}&limit=50&stat=false&verification=false&files=false`,
    );
    return list.map((c) => ({ id: c.sha, message: c.commit.message.split('\n')[0]!, author: c.commit.author?.name ?? c.author?.login ?? '?', date: c.commit.author?.date ?? '' }));
  }
}
