import { describe, expect, it } from 'vitest';
import { clientFor, defaultApiUrl } from '../src/git/accounts';
import { GiteaClient } from '../src/git/gitea';
import { parseRepoAddress, providerName, repoWebUrl, tokenPage } from '../src/git/url';
import { GitConflictError, type GitClient } from '../src/git/types';

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

describe('GIT-016 Gitea and Forgejo client', () => {
  const API = 'https://git.local:3000/api/v1';
  const make = (routes: Parameters<typeof mockFetch>[0]) => {
    const m = mockFetch(routes);
    return { client: new GiteaClient({ apiUrl: API, token: 'tok' }, m.fetchFn) as GitClient, calls: m.calls };
  };

  it('lists repositories with their visibility and role, branches and folders', async () => {
    const { client, calls } = make({
      [`GET ${API}/user/repos`]: () => ({ json: [{ full_name: 'me/notes', default_branch: 'main', private: true, permissions: { admin: false, push: true, pull: true } }, { full_name: 'org/site', default_branch: 'trunk', internal: true }] }),
      [`GET ${API}/repos/me/notes/branches`]: () => ({ json: [{ name: 'main' }, { name: 'dev' }] }),
      [`GET ${API}/repos/me/notes/contents/docs`]: () => ({ json: [{ name: 'b.md', path: 'docs/b.md', type: 'file', size: 3 }, { name: 'img', path: 'docs/img', type: 'dir' }, { name: 'link', path: 'docs/link', type: 'symlink' }] }),
    });
    expect(await client.listRepos()).toEqual([
      { id: 'me/notes', name: 'me/notes', defaultBranch: 'main', private: true, visibility: 'private', role: 'write' },
      { id: 'org/site', name: 'org/site', defaultBranch: 'trunk', private: true, visibility: 'internal' },
    ]);
    expect(await client.listBranches('me/notes')).toEqual(['main', 'dev']);
    expect(await client.listDir('me/notes', 'main', 'docs')).toEqual([{ name: 'img', path: 'docs/img', type: 'dir' }, { name: 'b.md', path: 'docs/b.md', type: 'file', size: 3 }]);
    expect(calls[0]!.headers.authorization).toBe('token tok');
  });

  it('reads files, from the raw endpoint when large', async () => {
    const { client } = make({
      [`GET ${API}/repos/me/notes/contents/a.md`]: () => ({ json: { type: 'file', sha: 's1', content: b64('# A'), encoding: 'base64' } }),
      [`GET ${API}/repos/me/notes/contents/big.bin`]: () => ({ json: { type: 'file', sha: 's2', content: null, encoding: null } }),
      [`GET ${API}/repos/me/notes/raw/big.bin`]: () => ({ json: 'RAW' }),
    });
    expect(text((await client.readFile('me/notes', 'main', 'a.md')).bytes)).toBe('# A');
    const big = await client.readFile('me/notes', 'main', 'big.bin');
    expect([text(big.bytes), big.version]).toEqual(['"RAW"', 's2']);
  });

  it('creates with POST, updates with PUT and the sha; a mismatch is a conflict', async () => {
    const { client, calls } = make({
      [`POST ${API}/repos/me/notes/contents/new.md`]: () => ({ status: 201, json: { content: { sha: 'n1' } } }),
      [`PUT ${API}/repos/me/notes/contents/a.md`]: (c) => ((c.body as { sha: string }).sha === 's1' ? { json: { content: { sha: 's2' } } } : { status: 422, json: { message: 'sha does not match' } }),
    });
    expect(await client.writeFile('me/notes', 'main', 'new.md', new TextEncoder().encode('x'), 'docs: add new.md')).toEqual({ version: 'n1' });
    expect(calls[0]!.body).toEqual({ message: 'docs: add new.md', content: b64('x'), branch: 'main' });
    expect(await client.writeFile('me/notes', 'main', 'a.md', new TextEncoder().encode('y'), 'm', 's1')).toEqual({ version: 's2' });
    await expect(client.writeFile('me/notes', 'main', 'a.md', new TextEncoder().encode('y'), 'm', 'old')).rejects.toBeInstanceOf(GitConflictError);
  });

  it('commits several changes at once, with the sha of the files changed', async () => {
    const { client, calls } = make({
      [`GET ${API}/repos/me/notes/branches/main`]: () => ({ json: { commit: { id: 'c9' } } }),
      [`GET ${API}/repos/me/notes/git/trees/c9`]: () => ({ json: { tree: [{ path: 'a.md', type: 'blob', sha: 'sa', size: 1 }, { path: 'd', type: 'tree', sha: 'td' }, { path: 'd/b.md', type: 'blob', sha: 'sb' }], truncated: false } }),
      [`GET ${API}/repos/me/notes/contents/d/b.md`]: () => ({ json: { type: 'file', sha: 'sb', content: b64('B'), encoding: 'base64' } }),
      [`POST ${API}/repos/me/notes/contents`]: () => ({ status: 201, json: {} }),
    });
    expect(await client.listTree('me/notes', 'main')).toEqual([{ path: 'a.md', type: 'file', sha: 'sa', size: 1 }, { path: 'd', type: 'dir', sha: 'td' }, { path: 'd/b.md', type: 'file', sha: 'sb' }]);
    await client.commit('me/notes', 'main', 'docs: tidy', [
      { action: 'create', path: 'n.md', bytes: new TextEncoder().encode('N') },
      { action: 'update', path: 'a.md', bytes: new TextEncoder().encode('A2') },
      { action: 'move', from: 'd/b.md', path: 'd/c.md' },
      { action: 'delete', path: 'a.md' },
    ]);
    expect(calls.at(-1)!.body).toEqual({
      branch: 'main',
      message: 'docs: tidy',
      files: [
        { operation: 'create', path: 'n.md', content: b64('N') },
        { operation: 'update', path: 'a.md', content: b64('A2'), sha: 'sa' },
        { operation: 'update', path: 'd/c.md', from_path: 'd/b.md', sha: 'sb', content: b64('B') },
        { operation: 'delete', path: 'a.md', sha: 'sa' },
      ],
    });
  });

  it('makes branches and pull requests, lists the history and the collaborators', async () => {
    const { client, calls } = make({
      [`POST ${API}/repos/me/notes/branches`]: () => ({ status: 201, json: {} }),
      [`POST ${API}/repos/me/notes/pulls`]: () => ({ status: 201, json: { number: 4, html_url: 'https://git.local:3000/me/notes/pulls/4' } }),
      [`GET ${API}/repos/me/notes/commits`]: () => ({ json: [{ sha: 'c2', commit: { message: 'docs: more\n\nbody', author: { name: 'Ada', date: '2026-10-01T10:00:00Z' } } }] }),
      [`GET ${API}/repos/me/notes/collaborators?`]: () => ({ json: [{ login: 'bob', full_name: 'Bob B' }] }),
      [`GET ${API}/repos/me/notes/collaborators/bob/permission`]: () => ({ json: { permission: 'write' } }),
    });
    await client.createBranch('me/notes', 'main', 'pwo/x');
    expect(calls[0]!.body).toEqual({ new_branch_name: 'pwo/x', old_branch_name: 'main' });
    expect(await client.createPullRequest('me/notes', 'pwo/x', 'main', 'T', '')).toEqual({ number: 4, url: 'https://git.local:3000/me/notes/pulls/4' });
    expect(await client.listCommits('me/notes', 'main', 'a.md')).toEqual([{ id: 'c2', message: 'docs: more', author: 'Ada', date: '2026-10-01T10:00:00Z' }]);
    expect(await client.listCollaborators('me/notes')).toEqual([{ login: 'bob', name: 'Bob B', role: 'write' }]);
  });

  it('is chosen for Gitea accounts, its addresses understood and written', () => {
    expect(clientFor({ provider: 'gitea', apiUrl: API, token: 't' })).toBeInstanceOf(GiteaClient);
    expect(defaultApiUrl('gitea')).toBe('https://codeberg.org/api/v1');
    expect(providerName('gitea')).toBe('Gitea / Forgejo');
    expect(parseRepoAddress('https://codeberg.org/me/notes')).toMatchObject({ provider: 'gitea', apiUrl: 'https://codeberg.org/api/v1', path: 'me/notes' });
    expect(parseRepoAddress('https://git.local:3000/me/notes/src/branch/main/docs/a.odt')).toMatchObject({ provider: 'gitea', host: 'git.local:3000', path: 'me/notes', branch: 'main', inside: 'docs/a.odt', isFile: true });
    expect(parseRepoAddress('https://forgejo.example.org/me/notes/src/branch/dev/docs')).toMatchObject({ provider: 'gitea', branch: 'dev', inside: 'docs' });
    const url = repoWebUrl('gitea', 'https://git.local:3000/api/v1', 'me/notes', 'main', 'docs/a.odt', true);
    expect(url).toBe('https://git.local:3000/me/notes/src/branch/main/docs/a.odt');
    expect(parseRepoAddress(url)).toMatchObject({ provider: 'gitea', inside: 'docs/a.odt', isFile: true });
    expect(tokenPage('gitea', 'codeberg.org')).toBe('https://codeberg.org/user/settings/applications');
  });
});
