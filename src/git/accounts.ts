/** Git accounts stored in this browser only (GIT-001, GIT-006). */
import { GitHubClient } from './github';
import { GitLabClient } from './gitlab';
import type { FetchFn, GitClient, GitProvider } from './types';

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
  return provider === 'github' ? 'https://api.github.com' : 'https://gitlab.com/api/v4';
}

export function loadAccounts(): GitAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as GitAccount[]).filter((a) => a && typeof a.token === 'string' && (a.provider === 'github' || a.provider === 'gitlab')) : [];
  } catch {
    return [];
  }
}

function store(accounts: GitAccount[]): void {
  try {
    if (accounts.length) localStorage.setItem(KEY, JSON.stringify(accounts));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the account lives for this session only */
  }
}

export function addAccount(input: Omit<GitAccount, 'id'>): GitAccount {
  const account: GitAccount = { ...input, apiUrl: input.apiUrl.trim().replace(/\/+$/, ''), id: `${input.provider}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` };
  store([...loadAccounts(), account]);
  return account;
}

export function forgetAccount(id: string): void {
  store(loadAccounts().filter((a) => a.id !== id));
}

export function clientFor(account: Pick<GitAccount, 'provider' | 'apiUrl' | 'token'>, fetchFn?: FetchFn): GitClient {
  const config = { apiUrl: account.apiUrl, token: account.token };
  return account.provider === 'github' ? new GitHubClient(config, fetchFn) : new GitLabClient(config, fetchFn);
}

/** Conventional commit message proposed when saving (GIT-003). */
export function commitMessage(path: string, exists: boolean): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return `docs: ${exists ? 'update' : 'add'} ${name}`;
}
