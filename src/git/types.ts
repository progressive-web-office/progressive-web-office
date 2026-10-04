/** Provider-neutral access to GitHub / GitLab repositories (GIT-001..GIT-005). */

/** GIT-016: `gitea` stands for Gitea and Forgejo (Codeberg…). */
export type GitProvider = 'github' | 'gitlab' | 'gitea';

export interface GitRepo {
  /** Identifier used in API calls ("owner/name" on GitHub, project id on GitLab). */
  id: string;
  /** Display name ("owner/name"). */
  name: string;
  defaultBranch: string;
  private?: boolean;
  /** GIT-013: who can see it (GitLab's `internal`: every signed-in user of the site). */
  visibility?: GitVisibility;
  /** GIT-013: what the account may do in it. */
  role?: GitRole;
}

export type GitVisibility = 'public' | 'private' | 'internal';

/** GitHub's roles (read, triage, write, maintain, admin) and GitLab's (guest, planner, reporter, developer, maintainer, owner). */
export type GitRole = 'read' | 'triage' | 'write' | 'maintain' | 'admin' | 'guest' | 'planner' | 'reporter' | 'developer' | 'maintainer' | 'owner';

/** A person who works on a repository, and their role (GIT-013). */
export interface GitMember {
  login: string;
  name?: string;
  role: GitRole;
  avatar?: string;
}

/** Whether a role may write (commit) in the repository. */
export const canWrite = (role: GitRole | undefined): boolean => !!role && ['write', 'maintain', 'admin', 'developer', 'maintainer', 'owner'].includes(role);

export interface GitEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export interface GitFile {
  bytes: Uint8Array;
  /** Opaque version used to detect concurrent changes (blob sha / last commit id). */
  version: string;
}

/** An entry of the whole tree of a branch (FOLDER-007). */
export interface GitTreeEntry {
  path: string;
  type: 'file' | 'dir';
  size?: number;
  /** Blob (or tree) id: tells whether a file changed. */
  sha: string;
}

/** A change of a commit made of several (FOLDER-007). */
export type GitChange =
  | { action: 'create' | 'update'; path: string; bytes: Uint8Array }
  | { action: 'delete'; path: string }
  /** `sha`: the blob moved, when known (GitHub reuses it instead of sending the file again). */
  | { action: 'move'; from: string; path: string; sha?: string };

export interface GitClient {
  readonly provider: GitProvider;
  /** Requests carry a token. */
  readonly signedIn?: boolean;
  listRepos(): Promise<GitRepo[]>;
  getRepo(name: string): Promise<GitRepo>;
  listBranches(repo: string): Promise<string[]>;
  listDir(repo: string, ref: string, path: string): Promise<GitEntry[]>;
  readFile(repo: string, ref: string, path: string): Promise<GitFile>;
  /** Create or update a file in one commit; `version` must match the current one when updating. */
  writeFile(repo: string, branch: string, path: string, bytes: Uint8Array, message: string, version?: string): Promise<{ version: string }>;
  createBranch(repo: string, from: string, name: string): Promise<void>;
  /** Every file and folder of a branch, in as few requests as possible. */
  listTree(repo: string, ref: string): Promise<GitTreeEntry[]>;
  /** Several changes as one commit on `branch`; a branch that moved meanwhile is a conflict. */
  commit(repo: string, branch: string, message: string, changes: GitChange[]): Promise<void>;
  /** Propose the changes of `head` for `base`: a pull request (GitHub) or merge request (GitLab) (FOLDER-022). */
  createPullRequest(repo: string, head: string, base: string, title: string, body: string): Promise<{ number: number; url: string }>;
  /** GIT-013: the people who work on the repository (needs a role allowed to see them). */
  listCollaborators(repo: string): Promise<GitMember[]>;
  /** VER-002: the commits that changed a file on a branch, newest first. */
  listCommits(repo: string, ref: string, path: string): Promise<GitCommit[]>;
}

/** A commit of the history of a file (VER-002). */
export interface GitCommit {
  /** Commit id, usable as a ref to read the file as it was. */
  id: string;
  /** First line of the message. */
  message: string;
  author: string;
  /** ISO date. */
  date: string;
}

export interface ClientConfig {
  apiUrl: string;
  token: string;
}

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class GitError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

/** The file changed in the repository since it was read (GIT-004). */
export class GitConflictError extends GitError {
  constructor(message = 'The file changed in the repository.') {
    super(message, 409);
    this.name = 'GitConflictError';
  }
}

/** Missing, expired or insufficient token. */
export class GitAuthError extends GitError {
  constructor(status: number) {
    super(status === 403 ? 'Access denied: check the token permissions.' : 'Authentication failed: check the token.', status);
    this.name = 'GitAuthError';
  }
}

/** Sort folders first, then by name. */
export function sortEntries(entries: GitEntry[]): GitEntry[] {
  return [...entries].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
}

export function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** JSON request helper shared by the clients; never includes the token in errors. */
export async function requestJson<T>(fetchFn: FetchFn, url: string, init: RequestInit, conflict?: (status: number, message: string) => boolean): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch (err) {
    throw new GitError(`Network error: ${(err as Error).message}`, 0);
  }
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  let message = res.statusText;
  try {
    const body = (await res.json()) as { message?: unknown; error?: unknown };
    const m = body.message ?? body.error;
    if (m) message = typeof m === 'string' ? m : JSON.stringify(m);
  } catch {
    /* not JSON */
  }
  if (conflict?.(res.status, message)) throw new GitConflictError(message);
  if (res.status === 401 || res.status === 403) throw new GitAuthError(res.status);
  throw new GitError(`${res.status} ${message}`.trim(), res.status);
}
