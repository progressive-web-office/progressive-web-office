/** Git accounts stored in this browser only (GIT-001, GIT-006). */
import { GitHubClient } from './github';
import { GiteaClient } from './gitea';
import { GitLabClient } from './gitlab';
import type { FetchFn, GitClient, GitProvider } from './types';
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

/** Conventional commit message proposed when saving (GIT-003). */
export function commitMessage(path: string, exists: boolean): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return `docs: ${exists ? 'update' : 'add'} ${name}`;
}
