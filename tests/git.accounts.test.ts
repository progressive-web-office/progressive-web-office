import { beforeEach, describe, expect, it } from 'vitest';
import { addAccount, forgetAccount, loadAccounts, defaultApiUrl, commitMessage } from '../src/git/accounts';

describe('GIT-001/GIT-006 accounts', () => {
  beforeEach(() => localStorage.clear());

  it('stores accounts in this browser only and forgets them', () => {
    const a = addAccount({ provider: 'github', apiUrl: 'https://api.github.com/', token: 't1', label: 'me' });
    expect(a.apiUrl).toBe('https://api.github.com');
    expect(loadAccounts()).toEqual([a]);
    forgetAccount(a.id);
    expect(loadAccounts()).toEqual([]);
    expect(JSON.stringify(localStorage)).not.toContain('t1');
  });

  it('knows the public API URLs', () => {
    expect(defaultApiUrl('github')).toBe('https://api.github.com');
    expect(defaultApiUrl('gitlab')).toBe('https://gitlab.com/api/v4');
  });

  it('proposes conventional commit messages (GIT-003)', () => {
    expect(commitMessage('docs/report.docx', true)).toBe('docs: update report.docx');
    expect(commitMessage('notes.md', false)).toBe('docs: add notes.md');
  });
});

describe('GIT-012 remembering a token, or not', () => {
  beforeEach(() => localStorage.clear());
  it('keeps an account for this session only when asked', async () => {
    const { addAccount, loadAccounts } = await import('../src/git/accounts');
    const a = addAccount({ provider: 'github', apiUrl: 'https://api.github.com', token: 'github_pat_x', label: 'github.com' }, { remember: false });
    expect(loadAccounts().map((x) => x.id)).toContain(a.id);
    expect(JSON.stringify(localStorage)).not.toContain('github_pat_x');
    const b = addAccount({ provider: 'github', apiUrl: 'https://api.github.com', token: 'github_pat_y', label: 'github.com' });
    expect(localStorage.getItem('pwo.git.accounts')).toContain('github_pat_y');
    expect(loadAccounts().map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe('GIT-018 a token per repository', () => {
  beforeEach(() => localStorage.clear());

  it('opens a repository with the token of the site that opens it, then with the one used last', async () => {
    const { addAccount, accountForRepo, rememberRepoAccount, siteAccounts, forgetAccount, loadAccounts } = await import('../src/git/accounts');
    // Accounts of the session left by the tests above, forgotten.
    for (const a of loadAccounts()) forgetAccount(a.id);
    const docs = addAccount({ provider: 'github', apiUrl: 'https://api.github.com', token: 'pat-docs', label: 'docs only' });
    const site = addAccount({ provider: 'github', apiUrl: 'https://api.github.com', token: 'pat-site', label: 'site only' });
    const reader = addAccount({ provider: 'github', apiUrl: 'https://api.github.com', token: 'pat-read', label: 'read everything' });
    addAccount({ provider: 'gitlab', apiUrl: 'https://gitlab.com/api/v4', token: 'glpat', label: 'gitlab' });
    const access: Record<string, Record<string, { push: boolean }>> = {
      'pat-docs': { 'ada/docs': { push: true } },
      'pat-site': { 'ada/site': { push: true } },
      'pat-read': { 'ada/docs': { push: false }, 'ada/site': { push: false }, 'ada/other': { push: false } },
    };
    const asked: string[] = [];
    const fetchFn = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = (new Headers(init.headers).get('Authorization') ?? '').replace(/^(Bearer|token) /, '');
      const name = decodeURIComponent(String(input).replace(/^.*\/repos\//, ''));
      asked.push(`${token || '-'} ${name}`);
      const perm = access[token]?.[name];
      if (!perm) return new Response('{"message":"Not Found"}', { status: 404, statusText: 'Not Found' });
      return new Response(JSON.stringify({ full_name: name, default_branch: 'main', private: true, permissions: { pull: true, push: perm.push } }), { status: 200 });
    };
    const at = (path: string) => ({ provider: 'github' as const, apiUrl: 'https://api.github.com', host: 'github.com', path });
    expect(siteAccounts(at('ada/docs')).map((a) => a.label)).toEqual(['docs only', 'site only', 'read everything']);
    // The token that may write in it, rather than one that only reads it.
    expect((await accountForRepo(at('ada/site'), fetchFn))!.account.id).toBe(site.id);
    expect((await accountForRepo(at('ada/docs'), fetchFn))!.account.id).toBe(docs.id);
    // Only one reads it: that one.
    expect((await accountForRepo(at('ada/other'), fetchFn))!.account.id).toBe(reader.id);
    // None, and not public: none.
    expect(await accountForRepo(at('ada/secret'), fetchFn)).toBeUndefined();
    // The one used last for a repository comes first, and is asked first.
    rememberRepoAccount(reader, 'ada/site');
    expect(siteAccounts(at('ada/site'))[0]!.id).toBe(reader.id);
    asked.length = 0;
    expect((await accountForRepo(at('ada/site'), fetchFn))!.account.id).toBe(reader.id);
    expect(asked).toEqual(['pat-read ada/site']);
    // No token in what is remembered.
    expect(localStorage.getItem('pwo.git.repoAccounts')).not.toContain('pat-');
  });
});
