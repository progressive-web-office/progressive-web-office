/** GitLab REST API v4 client (gitlab.com or self-hosted). */
import { fromBase64, requestJson, sortEntries, toBase64, type ClientConfig, type FetchFn, type GitChange, type GitClient, type GitEntry, type GitFile, type GitRepo, type GitTreeEntry } from './types';

interface ProjectJson {
  id: number;
  path_with_namespace: string;
  default_branch?: string;
  visibility?: string;
}

const repoOf = (p: ProjectJson): GitRepo => ({ id: String(p.id), name: p.path_with_namespace, defaultBranch: p.default_branch ?? 'main', private: p.visibility !== 'public' });
const q = encodeURIComponent;

/** GitLab answers 400 when `last_commit_id` is stale or when creating an existing file. */
const isConflict = (status: number, message: string): boolean => status === 400 && /changed since|already exists/i.test(message);

export class GitLabClient implements GitClient {
  readonly provider = 'gitlab' as const;
  private readonly api: string;

  constructor(
    private readonly config: ClientConfig,
    private readonly fetchFn: FetchFn = (i, init) => fetch(i, init),
  ) {
    this.api = config.apiUrl.replace(/\/+$/, '');
  }

  private req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.config.token) headers['private-token'] = this.config.token;
    if (init.body) headers['content-type'] = 'application/json';
    return requestJson<T>(this.fetchFn, `${this.api}${path}`, { ...init, headers }, isConflict);
  }

  async listRepos(): Promise<GitRepo[]> {
    const projects = await this.req<ProjectJson[]>('/projects?membership=true&simple=true&per_page=100&order_by=last_activity_at');
    return projects.map(repoOf);
  }

  async getRepo(name: string): Promise<GitRepo> {
    return repoOf(await this.req<ProjectJson>(`/projects/${q(name)}`));
  }

  async listBranches(repo: string): Promise<string[]> {
    const branches = await this.req<{ name: string }[]>(`/projects/${q(repo)}/repository/branches?per_page=100`);
    return branches.map((b) => b.name);
  }

  async listDir(repo: string, ref: string, path: string): Promise<GitEntry[]> {
    const items = await this.req<{ name: string; path: string; type: string }[]>(`/projects/${q(repo)}/repository/tree?ref=${q(ref)}&per_page=100${path ? `&path=${q(path)}` : ''}`);
    return sortEntries(items.filter((i) => i.type === 'blob' || i.type === 'tree').map((i) => ({ name: i.name, path: i.path, type: i.type === 'tree' ? 'dir' : 'file' })));
  }

  async readFile(repo: string, ref: string, path: string): Promise<GitFile> {
    const file = await this.req<{ content: string; last_commit_id: string }>(`/projects/${q(repo)}/repository/files/${q(path)}?ref=${q(ref)}`);
    return { bytes: fromBase64(file.content), version: file.last_commit_id };
  }

  async writeFile(repo: string, branch: string, path: string, bytes: Uint8Array, message: string, version?: string): Promise<{ version: string }> {
    const body: Record<string, string> = { branch, content: toBase64(bytes), encoding: 'base64', commit_message: message };
    if (version) body.last_commit_id = version;
    await this.req(`/projects/${q(repo)}/repository/files/${q(path)}`, { method: version ? 'PUT' : 'POST', body: JSON.stringify(body) });
    // The commit API does not return the new last_commit_id: read it back.
    const head = await this.req<{ last_commit_id: string }>(`/projects/${q(repo)}/repository/files/${q(path)}?ref=${q(branch)}`);
    return { version: head.last_commit_id };
  }

  async listTree(repo: string, ref: string): Promise<GitTreeEntry[]> {
    const out: GitTreeEntry[] = [];
    for (let page = 1; page < 1000; page++) {
      const items = await this.req<{ id: string; path: string; type: string }[]>(`/projects/${q(repo)}/repository/tree?ref=${q(ref)}&recursive=true&per_page=100&page=${page}`);
      for (const i of items) if (i.type === 'blob' || i.type === 'tree') out.push({ path: i.path, type: i.type === 'tree' ? 'dir' : 'file', sha: i.id });
      if (items.length < 100) break;
    }
    return out;
  }

  /** The commits API: every action in one commit. */
  async commit(repo: string, branch: string, message: string, changes: GitChange[]): Promise<void> {
    const actions = changes.map((c) =>
      c.action === 'delete'
        ? { action: 'delete', file_path: c.path }
        : c.action === 'move'
          ? { action: 'move', file_path: c.path, previous_path: c.from }
          : { action: c.action, file_path: c.path, content: toBase64(c.bytes), encoding: 'base64' },
    );
    await this.req(`/projects/${q(repo)}/repository/commits`, { method: 'POST', body: JSON.stringify({ branch, commit_message: message, actions }) });
  }

  async createBranch(repo: string, from: string, name: string): Promise<void> {
    await this.req(`/projects/${q(repo)}/repository/branches?branch=${q(name)}&ref=${q(from)}`, { method: 'POST' });
  }

  async createPullRequest(repo: string, head: string, base: string, title: string, body: string): Promise<{ number: number; url: string }> {
    const mr = await this.req<{ iid: number; web_url: string }>(`/projects/${q(repo)}/merge_requests`, {
      method: 'POST',
      body: JSON.stringify({ source_branch: head, target_branch: base, title, description: body }),
    });
    return { number: mr.iid, url: mr.web_url };
  }
}
