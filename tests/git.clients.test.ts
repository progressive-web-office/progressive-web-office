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
    expect(await client.listRepos()).toEqual([{ id: '7', name: 'grp/paper', defaultBranch: 'master', private: true }]);
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
