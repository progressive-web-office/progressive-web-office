/**
 * GIT-008: a repository given by its address, as copied from the browser or
 * a clone button — `https://github.com/owner/name`, a link to a branch, a
 * folder or a file, `git@host:owner/name.git` — tells the service (GitHub or
 * GitLab, on their sites or self-hosted), its API, the repository and maybe
 * the branch and the path.
 */
import type { GitProvider } from './types';

export interface RepoAddress {
  provider: GitProvider;
  /** The site, e.g. `github.com` or `gitlab.example.org`. */
  host: string;
  apiUrl: string;
  /** `owner/name` (GitLab: `group/subgroup/name`). */
  path: string;
  branch?: string;
  /** A folder or a file of the repository. */
  inside?: string;
  /** Whether `inside` is a file (a `blob` link). */
  isFile?: boolean;
}

export function apiUrlFor(provider: GitProvider, host: string): string {
  if (provider === 'github') return host === 'github.com' ? 'https://api.github.com' : `https://${host}/api/v3`;
  if (provider === 'gitea') return `https://${host}/api/v1`;
  return `https://${host}/api/v4`;
}

/** The name of a kind of forge, to show. */
export function providerName(provider: GitProvider): string {
  return provider === 'github' ? 'GitHub' : provider === 'gitea' ? 'Gitea / Forgejo' : 'GitLab';
}

/** The provider of a site: GitHub for github.com and GitHub Enterprise sites named so, GitLab otherwise. */
function providerOf(host: string, path: string): GitProvider {
  if (host === 'github.com' || /(^|\.)github\./.test(host)) return 'github';
  if (host === 'gitlab.com' || /(^|\.)gitlab\./.test(host) || path.includes('/-/')) return 'gitlab';
  // GIT-016: Codeberg and sites named so run Forgejo or Gitea; their links have `/src/branch/`.
  if (host === 'codeberg.org' || /(^|\.)(gitea|forgejo)\./.test(host) || /\/src\/(branch|commit|tag)\//.test(path)) return 'gitea';
  return 'gitlab';
}

/** The repository of an address; undefined when it is not one (`owner/name` alone has no site). */
export function parseRepoAddress(text: string): RepoAddress | undefined {
  const raw = text.trim();
  let host: string;
  let rest: string;
  const ssh = /^(?:ssh:\/\/)?git@([^:/]+)[:/](.+)$/.exec(raw);
  if (ssh) {
    host = ssh[1]!;
    rest = ssh[2]!;
  } else {
    let url: URL;
    try {
      url = new URL(/^[a-z][\w+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return undefined;
    }
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return undefined;
    host = url.host;
    rest = decodeURIComponent(url.pathname);
  }
  rest = rest.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  const provider = providerOf(host, `/${rest}`);
  let path = rest;
  let branch: string | undefined;
  let inside: string | undefined;
  let isFile = false;
  if (provider === 'github') {
    const m = /^([^/]+\/[^/]+)(?:\/(tree|blob)\/([^/]+)(?:\/(.+))?)?/.exec(rest);
    if (!m) return undefined;
    path = m[1]!;
    if (m[3]) branch = m[3];
    if (m[4]) inside = m[4];
    isFile = m[2] === 'blob';
  } else if (provider === 'gitea') {
    // `owner/name/src/branch/main/a/b.md` (a folder or a file: told when opened).
    const m = /^([^/]+\/[^/]+)(?:\/src\/(?:branch|commit|tag)\/([^/]+)(?:\/(.+))?)?/.exec(rest);
    if (!m) return undefined;
    path = m[1]!;
    if (m[2]) branch = m[2];
    if (m[3]) inside = m[3];
    isFile = !!m[3] && /\.[a-z0-9]+$/i.test(m[3]);
  } else {
    const m = /^(.+?)(?:\/-\/(tree|blob)\/([^/]+)(?:\/(.+))?)?$/.exec(rest);
    if (!m) return undefined;
    path = m[1]!;
    if (m[3]) branch = m[3];
    if (m[4]) inside = m[4];
    isFile = m[2] === 'blob';
  }
  if (path.split('/').filter(Boolean).length < 2) return undefined;
  return { provider, host, apiUrl: apiUrlFor(provider, host), path, ...(branch ? { branch } : {}), ...(inside ? { inside } : {}), ...(isFile ? { isFile } : {}) };
}

/** Where a personal access token is created on a site. */
export function tokenPage(provider: GitProvider, host: string): string {
  if (provider === 'gitea') return `https://${host}/user/settings/applications`;
  return provider === 'github' ? `https://${host}/settings/personal-access-tokens/new` : `https://${host}/-/user_settings/personal_access_tokens`;
}

/** The site of an account's API (`api.github.com` → `github.com`). */
export function hostOfApi(apiUrl: string): string {
  const host = new URL(apiUrl).host;
  return host === 'api.github.com' ? 'github.com' : host;
}

/**
 * FILE-028, FILE-029: the web address of a repository, or of a folder or a
 * file in it — the address that `parseRepoAddress` reads back.
 */
export function repoWebUrl(provider: GitProvider, apiUrl: string, repo: string, branch?: string, inside?: string, isFile = false): string {
  const base = `https://${hostOfApi(apiUrl)}/${repo}`;
  if (!branch) return base;
  const kind = isFile ? 'blob' : 'tree';
  const tail = `${encodeURIComponent(branch)}${inside ? `/${inside.split('/').map(encodeURIComponent).join('/')}` : ''}`;
  if (provider === 'gitea') return `${base}/src/branch/${tail}`;
  return provider === 'github' ? `${base}/${kind}/${tail}` : `${base}/-/${kind}/${tail}`;
}
