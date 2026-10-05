/** Git accounts stored in this browser only (GIT-001, GIT-006). */
import { GitHubClient } from './github';
import { GiteaClient } from './gitea';
import { GitLabClient } from './gitlab';
import type { FetchFn, GitClient, GitProvider, GitRepo, GitRole } from './types';
import { readSecret, writeSecret } from '../lock/session';

export interface GitAccount {
  id: string;
  provider: GitProvider;
  apiUrl: string;
  token: string;
  /** User-visible name (e.g. login or host). */
  label: string;
}

const KEY = 'pwo.git.accounts';

export function defaultApiUrl(provider: GitProvider): string {
  return provider === 'github' ? 'https://api.github.com' : provider === 'gitea' ? 'https://codeberg.org/api/v1' : 'https://gitlab.com/api/v4';
}

/** GIT-012: accounts whose token is not to be remembered: kept until the application is closed. */
const sessionAccounts: GitAccount[] = [];

function storedAccounts(): GitAccount[] {
  try {
    const raw = JSON.parse(readSecret(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as GitAccount[]).filter((a) => a && typeof a.token === 'string' && (a.provider === 'github' || a.provider === 'gitlab' || a.provider === 'gitea')) : [];
  } catch {
    return [];
  }
}

export function loadAccounts(): GitAccount[] {
  return [...storedAccounts(), ...sessionAccounts];
}

function store(accounts: GitAccount[]): void {
  try {
    if (accounts.length) writeSecret(KEY, JSON.stringify(accounts));
    else writeSecret(KEY, null);
  } catch {
    /* storage unavailable: the account lives for this session only */
  }
}

/** Add an account; its token is remembered in this browser unless `remember` is false. */
export function addAccount(input: Omit<GitAccount, 'id'>, opts: { remember?: boolean } = {}): GitAccount {
  const account: GitAccount = { ...input, apiUrl: input.apiUrl.trim().replace(/\/+$/, ''), id: `${input.provider}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` };
  if (opts.remember === false) sessionAccounts.push(account);
  else store([...storedAccounts(), account]);
  return account;
}

/** Whether the token of an account is remembered in this browser. */
export const isRemembered = (id: string): boolean => storedAccounts().some((a) => a.id === id);

export function forgetAccount(id: string): void {
  const i = sessionAccounts.findIndex((a) => a.id === id);
  if (i >= 0) sessionAccounts.splice(i, 1);
  store(storedAccounts().filter((a) => a.id !== id));
}

export function clientFor(account: Pick<GitAccount, 'provider' | 'apiUrl' | 'token'>, fetchFn?: FetchFn): GitClient {
  const config = { apiUrl: account.apiUrl, token: account.token };
  return account.provider === 'github' ? new GitHubClient(config, fetchFn) : account.provider === 'gitea' ? new GiteaClient(config, fetchFn) : new GitLabClient(config, fetchFn);
}

// --- GIT-018: an account per repository --------------------------------------------

const REPO_KEY = 'pwo.git.repoAccounts';
const hostOf = (apiUrl: string): string => {
  const host = new URL(apiUrl).host;
  return host === 'api.github.com' ? 'github.com' : host;
};
const repoKey = (host: string, path: string): string => `${host}/${path}`.toLowerCase();

function repoAccounts(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(REPO_KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * GIT-018: remember the account a repository was opened or saved with (its
 * id only, no token), so that its address opens it with that account again.
 */
export function rememberRepoAccount(account: Pick<GitAccount, 'id' | 'apiUrl'>, path: string): void {
  if (account.id.startsWith('public:')) return;
  try {
    localStorage.setItem(REPO_KEY, JSON.stringify({ ...repoAccounts(), [repoKey(hostOf(account.apiUrl), path)]: account.id }));
  } catch {
    /* not kept */
  }
}

/** The accounts of a site, the one last used for the repository first. */
export function siteAccounts(at: { provider: GitProvider; apiUrl: string; host: string; path?: string }): GitAccount[] {
  const same = loadAccounts().filter((a) => a.provider === at.provider && (a.apiUrl.replace(/\/+$/, '') === at.apiUrl.replace(/\/+$/, '') || hostOf(a.apiUrl) === at.host));
  const last = at.path ? repoAccounts()[repoKey(at.host, at.path)] : undefined;
  return [...same.filter((a) => a.id === last), ...same.filter((a) => a.id !== last)];
}

const WRITES: GitRole[] = ['write', 'maintain', 'admin', 'developer', 'maintainer', 'owner'];

/**
 * GIT-018: the account to open a repository with, when several tokens of
 * its site are known (a token per repository): the one last used for it if
 * it still opens it, else the first that may write in it, else the first
 * that may read it, else no token (a public repository, read only).
 */
export async function accountForRepo(at: { provider: GitProvider; apiUrl: string; host: string; path: string }, fetchFn?: FetchFn): Promise<{ account: GitAccount; repo: GitRepo } | undefined> {
  const candidates = siteAccounts(at);
  const last = repoAccounts()[repoKey(at.host, at.path)];
  let readable: { account: GitAccount; repo: GitRepo } | undefined;
  for (const account of candidates) {
    try {
      const repo = await clientFor(account, fetchFn).getRepo(at.path);
      if (account.id === last || (repo.role && WRITES.includes(repo.role))) return { account, repo };
      readable ??= { account, repo };
    } catch {
      /* this token does not open it: the next one */
    }
  }
  if (readable) return readable;
  const account: GitAccount = { id: `public:${at.host}`, provider: at.provider, apiUrl: at.apiUrl, token: '', label: at.host };
  try {
    return { account, repo: await clientFor(account, fetchFn).getRepo(at.path) };
  } catch {
    return undefined;
  }
}

/** Conventional commit message proposed when saving (GIT-003). */
export function commitMessage(path: string, exists: boolean): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return `docs: ${exists ? 'update' : 'add'} ${name}`;
}
