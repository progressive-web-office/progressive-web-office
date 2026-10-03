import { describe, expect, it } from 'vitest';
import { GitHubClient } from '../src/git/github';
import { GitLabClient } from '../src/git/gitlab';
import { GitConflictError, GitAuthError, type GitClient } from '../src/git/types';

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** Tiny fetch mock: routes are "METHOD url-prefix" → response factory. */
function mockFetch(routes: Record<string, (call: Call) => { status?: number; json?: unknown }>) {
  const calls: Call[] = [];
  const fetchFn = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const call: Call = { method, url, headers, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const key = Object.keys(routes)
      .filter((k) => {
        const [m, prefix] = k.split(' ');
        return m === method && url.startsWith(prefix!);
      })
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    const res = routes[key]!(call);
    return new Response(JSON.stringify(res.json ?? {}), { status: res.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchFn, calls };
}

const b64 = (s: string) => Buffer.from(s).toString('base64');
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('GIT-001..004 GitHub client', () => {
  const API = 'https://api.github.com';
  const make = (routes: Parameters<typeof mockFetch>[0]) => {
    const m = mockFetch(routes);
    return { client: new GitHubClient({ apiUrl: API, token: 'ghp_secret' }, m.fetchFn) as GitClient, calls: m.calls };
  };

  it('lists repositories, branches and folders with the token', async () => {
    const { client, calls } = make({
      [`GET ${API}/user/repos`]: () => ({ json: [{ full_name: 'me/notes', default_branch: 'main', private: true }] }),
      [`GET ${API}/repos/me/notes/branches`]: () => ({ json: [{ name: 'main' }, { name: 'dev' }] }),
      [`GET ${API}/repos/me/notes/contents/docs`]: () => ({
        json: [
          { name: 'b.md', path: 'docs/b.md', type: 'file', size: 3 },
          { name: 'img', path: 'docs/img', type: 'dir' },
          { name: 'a.docx', path: 'docs/a.docx', type: 'file', size: 9 },
        ],
      }),
    });
    expect(await client.listRepos()).toEqual([{ id: 'me/notes', name: 'me/notes', defaultBranch: 'main', private: true }]);
    expect(await client.listBranches('me/notes')).toEqual(['main', 'dev']);
    expect(await client.listDir('me/notes', 'main', 'docs')).toEqual([
      { name: 'img', path: 'docs/img', type: 'dir' },
      { name: 'a.docx', path: 'docs/a.docx', type: 'file', size: 9 },
      { name: 'b.md', path: 'docs/b.md', type: 'file', size: 3 },
    ]);
    expect(calls[0]!.headers.authorization).toBe('Bearer ghp_secret');
    expect(calls[2]!.url).toBe(`${API}/repos/me/notes/contents/docs?ref=main`);
  });

  it('reads a file (falling back to the blob API for large files) with its version', async () => {
    const { client } = make({
      [`GET ${API}/repos/me/notes/contents/a.md`]: () => ({ json: { type: 'file', sha: 's1', content: b64('# Hi\n'), encoding: 'base64' } }),
      [`GET ${API}/repos/me/notes/contents/big.pdf`]: () => ({ json: { type: 'file', sha: 's2', content: '', encoding: 'none' } }),
      [`GET ${API}/repos/me/notes/git/blobs/s2`]: () => ({ json: { content: b64('%PDF-'), encoding: 'base64' } }),
    });
    const a = await client.readFile('me/notes', 'main', 'a.md');
    expect(text(a.bytes)).toBe('# Hi\n');
    expect(a.version).toBe('s1');
    expect(text((await client.readFile('me/notes', 'main', 'big.pdf')).bytes)).toBe('%PDF-');
  });

  it('commits a file with message, branch and the expected version', async () => {
    const { client, calls } = make({
      [`PUT ${API}/repos/me/notes/contents/docs/a%20b.md`]: () => ({ json: { content: { sha: 's9' }, commit: { sha: 'c1' } } }),
    });
    const res = await client.writeFile('me/notes', 'main', 'docs/a b.md', new TextEncoder().encode('x'), 'docs: update a b.md', 's1');
    expect(res).toEqual({ version: 's9' });
    expect(calls[0]!.body).toEqual({ message: 'docs: update a b.md', content: b64('x'), branch: 'main', sha: 's1' });
  });

  it('reports a conflict when the file changed (GIT-004)', async () => {
    const { client } = make({
      [`PUT ${API}/repos/me/notes/contents/a.md`]: () => ({ status: 409, json: { message: 'a.md does not match s1' } }),
    });
    await expect(client.writeFile('me/notes', 'main', 'a.md', new Uint8Array(), 'm', 's1')).rejects.toBeInstanceOf(GitConflictError);
  });

  it('creates a branch from another one', async () => {
    const { client, calls } = make({
      [`GET ${API}/repos/me/notes/git/ref/heads/main`]: () => ({ json: { object: { sha: 'abc' } } }),
      [`POST ${API}/repos/me/notes/git/refs`]: () => ({ status: 201, json: {} }),
    });
    await client.createBranch('me/notes', 'main', 'pwo/edit');
    expect(calls[1]!.body).toEqual({ ref: 'refs/heads/pwo/edit', sha: 'abc' });
  });

  it('maps 401 to an authentication error without leaking the token', async () => {
    const { client } = make({ [`GET ${API}/user/repos`]: () => ({ status: 401, json: { message: 'Bad credentials' } }) });
    const err = await client.listRepos().catch((e: Error) => e);
    expect(err).toBeInstanceOf(GitAuthError);
    expect(String((err as Error).message)).not.toContain('ghp_secret');
  });
});

describe('GIT-001..004 GitLab client', () => {
  const API = 'https://gitlab.example.org/api/v4';
  const make = (routes: Parameters<typeof mockFetch>[0]) => {
    const m = mockFetch(routes);
    return { client: new GitLabClient({ apiUrl: API, token: 'glpat-secret' }, m.fetchFn) as GitClient, calls: m.calls };
  };

  it('lists projects, branches and tree entries', async () => {
    const { client, calls } = make({
      [`GET ${API}/projects?`]: () => ({ json: [{ id: 7, path_with_namespace: 'grp/paper', default_branch: 'master', visibility: 'private' }] }),
      [`GET ${API}/projects/7/repository/branches`]: () => ({ json: [{ name: 'master' }] }),
      [`GET ${API}/projects/7/repository/tree`]: () => ({ json: [{ name: 'main.tex', path: 'main.tex', type: 'blob' }, { name: 'fig', path: 'fig', type: 'tree' }] }),
    });
    expect(await client.listRepos()).toEqual([{ id: '7', name: 'grp/paper', defaultBranch: 'master', private: true, visibility: 'private' }]);
    expect(await client.listBranches('7')).toEqual(['master']);
    expect(await client.listDir('7', 'master', '')).toEqual([
      { name: 'fig', path: 'fig', type: 'dir' },
      { name: 'main.tex', path: 'main.tex', type: 'file' },
    ]);
    expect(calls[0]!.headers['private-token']).toBe('glpat-secret');
    expect(calls[2]!.url).toContain('ref=master');
  });

  it('reads and updates a file with last_commit_id as version', async () => {
    let reads = 0;
    const { client, calls } = make({
      [`GET ${API}/projects/7/repository/files/fig%2Fa.md`]: () =>
        ++reads === 1
          ? { json: { content: b64('hello'), encoding: 'base64', last_commit_id: 'lc1' } }
          : { json: { content: b64('hello2'), encoding: 'base64', last_commit_id: 'lc2' } },
      [`PUT ${API}/projects/7/repository/files/fig%2Fa.md`]: () => ({ json: { file_path: 'fig/a.md', branch: 'master' } }),
    });
    const f = await client.readFile('7', 'master', 'fig/a.md');
    expect(text(f.bytes)).toBe('hello');
    expect(f.version).toBe('lc1');
    const res = await client.writeFile('7', 'master', 'fig/a.md', new TextEncoder().encode('hello2'), 'docs: update', 'lc1');
    expect(calls[1]!.body).toEqual({ branch: 'master', content: b64('hello2'), encoding: 'base64', commit_message: 'docs: update', last_commit_id: 'lc1' });
    expect(res.version).toBe('lc2');
  });

  it('creates new files with POST and maps "changed since" errors to conflicts', async () => {
    const { client, calls } = make({
      [`POST ${API}/projects/7/repository/files/new.md`]: () => ({ status: 201, json: {} }),
      [`GET ${API}/projects/7/repository/files/new.md`]: () => ({ json: { content: '', encoding: 'base64', last_commit_id: 'n1' } }),
      [`PUT ${API}/projects/7/repository/files/old.md`]: () => ({ status: 400, json: { message: 'You are attempting to update a file that has changed since you started editing it.' } }),
    });
    expect((await client.writeFile('7', 'master', 'new.md', new Uint8Array(), 'docs: add new.md')).version).toBe('n1');
    expect(calls[0]!.method).toBe('POST');
    await expect(client.writeFile('7', 'master', 'old.md', new Uint8Array(), 'm', 'x')).rejects.toBeInstanceOf(GitConflictError);
  });

  it('creates a branch', async () => {
    const { client, calls } = make({ [`POST ${API}/projects/7/repository/branches`]: () => ({ status: 201, json: {} }) });
    await client.createBranch('7', 'master', 'pwo/edit');
    expect(calls[0]!.url).toBe(`${API}/projects/7/repository/branches?branch=pwo%2Fedit&ref=master`);
  });
});

describe('FOLDER-007 whole trees and commits of several changes', () => {
  it('GitHub: lists the tree in one request and commits through the Git data API', async () => {
    const API = 'https://api.github.com';
    const m = mockFetch({
      [`GET ${API}/repos/me/notes/git/trees/main`]: () => ({ json: { tree: [{ path: 'docs', type: 'tree', sha: 't1' }, { path: 'docs/a.md', type: 'blob', sha: 'b1', size: 1 }], truncated: false } }),
      [`GET ${API}/repos/me/notes/git/ref/heads/main`]: () => ({ json: { object: { sha: 'head' } } }),
      [`GET ${API}/repos/me/notes/git/commits/head`]: () => ({ json: { tree: { sha: 'base' } } }),
      [`POST ${API}/repos/me/notes/git/blobs`]: () => ({ json: { sha: 'newblob' } }),
      [`POST ${API}/repos/me/notes/git/trees`]: () => ({ json: { sha: 'newtree' } }),
      [`POST ${API}/repos/me/notes/git/commits`]: () => ({ json: { sha: 'newcommit' } }),
      [`PATCH ${API}/repos/me/notes/git/refs/heads/main`]: () => ({ json: {} }),
    });
    const client = new GitHubClient({ apiUrl: API, token: 't' }, m.fetchFn);
    expect(await client.listTree('me/notes', 'main')).toEqual([
      { path: 'docs', type: 'dir', sha: 't1' },
      { path: 'docs/a.md', type: 'file', sha: 'b1', size: 1 },
    ]);
    expect(m.calls[0]!.url).toContain('recursive=1');
    await client.commit('me/notes', 'main', 'docs: work', [
      { action: 'update', path: 'docs/a.md', bytes: new TextEncoder().encode('A2') },
      { action: 'move', from: 'docs/b.md', path: 'docs/c.md', sha: 'b2' },
      { action: 'delete', path: 'old.md' },
    ]);
    const tree = m.calls.find((c) => c.method === 'POST' && c.url.endsWith('/git/trees'))!.body as { base_tree: string; tree: unknown[] };
    expect(tree.base_tree).toBe('base');
    expect(tree.tree).toEqual([
      { path: 'docs/a.md', mode: '100644', type: 'blob', sha: 'newblob' },
      { path: 'docs/c.md', mode: '100644', type: 'blob', sha: 'b2' },
      { path: 'docs/b.md', mode: '100644', type: 'blob', sha: null },
      { path: 'old.md', mode: '100644', type: 'blob', sha: null },
    ]);
    expect(m.calls.find((c) => c.method === 'POST' && c.url.endsWith('/git/commits'))!.body).toEqual({ message: 'docs: work', tree: 'newtree', parents: ['head'] });
    expect(m.calls.at(-1)!.body).toEqual({ sha: 'newcommit', force: false });
  });

  it('GitHub: a branch that moved meanwhile is a conflict', async () => {
    const API = 'https://api.github.com';
    const m = mockFetch({
      [`GET ${API}/repos/me/notes/git/ref/heads/main`]: () => ({ json: { object: { sha: 'head' } } }),
      [`GET ${API}/repos/me/notes/git/commits/head`]: () => ({ json: { tree: { sha: 'base' } } }),
      [`POST ${API}/repos/me/notes/git/trees`]: () => ({ json: { sha: 'newtree' } }),
      [`POST ${API}/repos/me/notes/git/commits`]: () => ({ json: { sha: 'newcommit' } }),
      [`PATCH ${API}/repos/me/notes/git/refs/heads/main`]: () => ({ status: 422, json: { message: 'Update is not a fast forward' } }),
    });
    const client = new GitHubClient({ apiUrl: API, token: 't' }, m.fetchFn);
    await expect(client.commit('me/notes', 'main', 'm', [{ action: 'delete', path: 'a.md' }])).rejects.toBeInstanceOf(GitConflictError);
  });

  it('GitLab: lists the tree page by page and commits all the actions at once', async () => {
    const API = 'https://gitlab.com/api/v4';
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, path: `f${i}.md`, type: 'blob' }));
    const m = mockFetch({
      [`GET ${API}/projects/42/repository/tree`]: (call) => ({ json: call.url.includes('page=2') ? [{ id: 'd', path: 'docs', type: 'tree' }] : page1 }),
      [`POST ${API}/projects/42/repository/commits`]: () => ({ json: { id: 'c' } }),
    });
    const client = new GitLabClient({ apiUrl: API, token: 't' }, m.fetchFn);
    const tree = await client.listTree('42', 'main');
    expect(tree).toHaveLength(101);
    expect(tree.at(-1)).toEqual({ path: 'docs', type: 'dir', sha: 'd' });
    expect(m.calls[0]!.url).toContain('recursive=true');
    await client.commit('42', 'main', 'docs: work', [
      { action: 'create', path: 'n.md', bytes: new TextEncoder().encode('N') },
      { action: 'move', from: 'a.md', path: 'b.md' },
      { action: 'delete', path: 'c.md' },
    ]);
    expect(m.calls.at(-1)!.body).toEqual({
      branch: 'main',
      commit_message: 'docs: work',
      actions: [
        { action: 'create', file_path: 'n.md', content: b64('N'), encoding: 'base64' },
        { action: 'move', file_path: 'b.md', previous_path: 'a.md' },
        { action: 'delete', file_path: 'c.md' },
      ],
    });
  });
});

describe('FOLDER-022 pull and merge requests from a branch', () => {
  it('GitHub: opens a pull request and gives its address', async () => {
    const API = 'https://api.github.com';
    const m = mockFetch({ [`POST ${API}/repos/me/notes/pulls`]: () => ({ status: 201, json: { number: 4, html_url: 'https://github.com/me/notes/pull/4' } }) });
    const client = new GitHubClient({ apiUrl: API, token: 't' }, m.fetchFn);
    expect(await client.createPullRequest('me/notes', 'pwo/draft', 'main', 'Draft', 'Text')).toEqual({ number: 4, url: 'https://github.com/me/notes/pull/4' });
    expect(m.calls[0]!.body).toEqual({ head: 'pwo/draft', base: 'main', title: 'Draft', body: 'Text' });
  });

  it('GitLab: opens a merge request and gives its address', async () => {
    const API = 'https://gitlab.com/api/v4';
    const m = mockFetch({ [`POST ${API}/projects/42/merge_requests`]: () => ({ status: 201, json: { iid: 9, web_url: 'https://gitlab.com/g/p/-/merge_requests/9' } }) });
    const client = new GitLabClient({ apiUrl: API, token: 't' }, m.fetchFn);
    expect(await client.createPullRequest('42', 'pwo/draft', 'master', 'Draft', '')).toEqual({ number: 9, url: 'https://gitlab.com/g/p/-/merge_requests/9' });
    expect(m.calls[0]!.body).toEqual({ source_branch: 'pwo/draft', target_branch: 'master', title: 'Draft', description: '' });
  });
});

describe('GIT-011 an empty repository', () => {
  const API = 'https://api.github.com';
  it('writes the first file of an empty GitHub repository on its default branch', async () => {
    let first = true;
    const m = mockFetch({
      [`PUT ${API}/repos/me/empty/contents/notes.md`]: (call) => {
        if ((call.body as { branch?: string }).branch && first) {
          first = false;
          return { status: 404, json: { message: 'Branch main not found' } };
        }
        return { status: 201, json: { content: { sha: 'abc' } } };
      },
    });
    const client = new GitHubClient({ apiUrl: API, token: 't' }, m.fetchFn);
    expect(await client.writeFile('me/empty', 'main', 'notes.md', new TextEncoder().encode('# Hi'), 'docs: add notes.md')).toEqual({ version: 'abc' });
    expect(m.calls.map((c) => (c.body as { branch?: string }).branch)).toEqual(['main', undefined]);
  });

  it('tells an empty repository by its missing branches', async () => {
    const m = mockFetch({ [`GET ${API}/repos/me/empty/branches`]: () => ({ json: [] }) });
    expect(await new GitHubClient({ apiUrl: API, token: '' }, m.fetchFn).listBranches('me/empty')).toEqual([]);
  });
});

describe('GIT-013 who can see a repository, and who works on it', () => {
  it('tells the visibility, the role and the collaborators on GitHub', async () => {
    const API = 'https://api.github.com';
    const m = mockFetch({
      [`GET ${API}/repos/me/notes/collaborators`]: () => ({
        json: [
          { login: 'me', role_name: 'admin', avatar_url: 'https://a/me' },
          { login: 'ann', role_name: 'write' },
          { login: 'bob', permissions: { pull: true, triage: false, push: false, maintain: false, admin: false } },
        ],
      }),
      [`GET ${API}/repos/me/notes`]: () => ({ json: { full_name: 'me/notes', default_branch: 'main', private: true, visibility: 'private', permissions: { admin: false, maintain: true, push: true, triage: true, pull: true } } }),
    });
    const client = new GitHubClient({ apiUrl: API, token: 't' }, m.fetchFn);
    expect(await client.getRepo('me/notes')).toEqual({ id: 'me/notes', name: 'me/notes', defaultBranch: 'main', private: true, visibility: 'private', role: 'maintain' });
    expect(await client.listCollaborators('me/notes')).toEqual([
      { login: 'me', role: 'admin', avatar: 'https://a/me' },
      { login: 'ann', role: 'write' },
      { login: 'bob', role: 'read' },
    ]);
  });

  it('tells the visibility, the role and the members on GitLab', async () => {
    const API = 'https://gitlab.example.org/api/v4';
    const m = mockFetch({
      [`GET ${API}/projects/team%2Fsite/members/all`]: () => ({ json: [{ username: 'lea', name: 'Léa', access_level: 50 }, { username: 'max', name: 'Max', access_level: 30 }, { username: 'guest1', name: 'G', access_level: 10 }] }),
      [`GET ${API}/projects/team%2Fsite`]: () => ({ json: { id: 7, path_with_namespace: 'team/site', default_branch: 'main', visibility: 'internal', permissions: { project_access: { access_level: 30 }, group_access: { access_level: 40 } } } }),
    });
    const client = new GitLabClient({ apiUrl: API, token: 't' }, m.fetchFn);
    expect(await client.getRepo('team/site')).toEqual({ id: '7', name: 'team/site', defaultBranch: 'main', private: true, visibility: 'internal', role: 'maintainer' });
    expect(await client.listCollaborators('team/site')).toEqual([
      { login: 'lea', name: 'Léa', role: 'owner' },
      { login: 'max', name: 'Max', role: 'developer' },
      { login: 'guest1', name: 'G', role: 'guest' },
    ]);
  });
});

describe('VER-002 the history of a file', () => {
  it('lists the commits of a file on GitHub, newest first', async () => {
    const API = 'https://api.github.com';
    const m = mockFetch({
      [`GET ${API}/repos/me/notes/commits`]: () => ({
        json: [
          { sha: 'c2', commit: { message: 'docs: update notes.md\n\nMore words', author: { name: 'Ann', date: '2026-10-02T10:00:00Z' } }, author: { login: 'ann' } },
          { sha: 'c1', commit: { message: 'docs: add notes.md', author: { name: 'Bob', date: '2026-10-01T09:00:00Z' } }, author: null },
        ],
      }),
    });
    const client = new GitHubClient({ apiUrl: API, token: 't' }, m.fetchFn);
    expect(await client.listCommits('me/notes', 'main', 'docs/notes.md')).toEqual([
      { id: 'c2', message: 'docs: update notes.md', author: 'Ann (@ann)', date: '2026-10-02T10:00:00Z' },
      { id: 'c1', message: 'docs: add notes.md', author: 'Bob', date: '2026-10-01T09:00:00Z' },
    ]);
    expect(m.calls[0]!.url).toContain('sha=main');
    expect(m.calls[0]!.url).toContain('path=docs%2Fnotes.md');
  });

  it('lists the commits of a file on GitLab', async () => {
    const API = 'https://gitlab.example.org/api/v4';
    const m = mockFetch({ [`GET ${API}/projects/7/repository/commits`]: () => ({ json: [{ id: 'g1', title: 'docs: add a.md', message: 'docs: add a.md\n', author_name: 'Léa', authored_date: '2026-10-01T09:00:00Z' }] }) });
    const client = new GitLabClient({ apiUrl: API, token: 't' }, m.fetchFn);
    expect(await client.listCommits('7', 'main', 'a.md')).toEqual([{ id: 'g1', message: 'docs: add a.md', author: 'Léa', date: '2026-10-01T09:00:00Z' }]);
    expect(m.calls[0]!.url).toContain('ref_name=main');
  });
});
