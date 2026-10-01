/** GitHub REST API client (github.com or Enterprise `/api/v3`). */
import { encodePath, fromBase64, requestJson, sortEntries, toBase64, type ClientConfig, type FetchFn, type GitClient, type GitEntry, type GitFile, type GitRepo } from './types';

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

  async createBranch(repo: string, from: string, name: string): Promise<void> {
    const ref = await this.req<{ object: { sha: string } }>(`/repos/${encodePath(repo)}/git/ref/heads/${encodePath(from)}`);
    await this.req(`/repos/${encodePath(repo)}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${name}`, sha: ref.object.sha }) });
  }
}
