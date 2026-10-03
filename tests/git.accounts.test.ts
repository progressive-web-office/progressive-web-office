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
