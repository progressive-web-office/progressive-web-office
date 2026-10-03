import { expect, test, type Route } from '@playwright/test';
import { openApp } from './helpers';

const API = 'https://api.github.com';
const b64 = (s: string) => Buffer.from(s).toString('base64');

test('opens a file from GitHub, commits it and handles a conflict (GIT-001..GIT-004)', async ({ page }) => {
  const errors = await openApp(page);
  const puts: { url: string; body: Record<string, string>; auth: string | undefined }[] = [];
  let conflictOnce = false;
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const p = url.pathname;
    if (req.method() === 'GET' && p === '/user/repos') return json([{ full_name: 'me/notes', default_branch: 'main', private: true }]);
    if (req.method() === 'GET' && p === '/repos/me/notes/branches') return json([{ name: 'main' }]);
    if (req.method() === 'GET' && p === '/repos/me/notes/contents') return json([{ name: 'notes.md', path: 'notes.md', type: 'file', size: 8 }, { name: 'img.bin', path: 'img.bin', type: 'file', size: 1 }]);
    if (req.method() === 'GET' && p === '/repos/me/notes/contents/notes.md') return json({ type: 'file', sha: url.searchParams.get('ref') === 'main' ? 's1' : 's3', content: b64('# Notes\n'), encoding: 'base64' });
    if (req.method() === 'GET' && p === '/repos/me/notes/git/ref/heads/main') return json({ object: { sha: 'c0' } });
    if (req.method() === 'POST' && p === '/repos/me/notes/git/refs') return json({}, 201);
    if (req.method() === 'PUT' && p === '/repos/me/notes/contents/notes.md') {
      const body = JSON.parse(req.postData() ?? '{}') as Record<string, string>;
      puts.push({ url: req.url(), body, auth: req.headers().authorization });
      if (conflictOnce) {
        conflictOnce = false;
        return json({ message: 'notes.md does not match s2' }, 409);
      }
      return json({ content: { sha: `s${puts.length + 1}` }, commit: { sha: 'c1' } });
    }
    return json({ message: 'Not Found' }, 404);
  });

  await page.getByRole('button', { name: 'Open from repository…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Open from repository' });
  await expect(dialog.getByText('Add a GitHub or GitLab account to start.')).toBeVisible();
  await dialog.getByLabel('Personal access token').fill('ghp_test');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await dialog.getByLabel('Repository', { exact: true }).selectOption({ label: 'me/notes' });
  await expect(dialog.getByRole('button', { name: '📄 img.bin' })).toBeDisabled();
  await dialog.getByRole('button', { name: '📄 notes.md' }).click();

  await expect(page.locator('.doc-page h1')).toHaveText('Notes');
  await expect(page.locator('.doc-source')).toHaveText('me/notes · main');
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('More text');

  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const commit = page.getByRole('dialog', { name: 'Commit to the repository' });
  await expect(commit.getByLabel('Commit message')).toHaveValue('docs: update notes.md');
  await commit.getByRole('button', { name: 'Commit' }).click();
  await expect(page.getByRole('alert')).toContainText('Committed notes.md to main.');
  expect(puts[0]!.body).toMatchObject({ message: 'docs: update notes.md', branch: 'main', sha: 's1' });
  expect(Buffer.from(puts[0]!.body.content!, 'base64').toString()).toBe('# Notes\n\nMore text\n');
  expect(puts[0]!.auth).toBe('Bearer ghp_test');

  // GIT-004: someone else committed meanwhile.
  conflictOnce = true;
  await editor.click();
  await page.keyboard.type(' again');
  await page.keyboard.press('Control+S');
  await page.getByRole('dialog', { name: 'Commit to the repository' }).getByRole('button', { name: 'Commit' }).click();
  const conflict = page.getByRole('dialog', { name: 'The file changed in the repository' });
  await conflict.getByLabel('Save on a new branch').check();
  await conflict.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText(/Committed notes\.md to pwo\//);
  expect(puts[1]!.body.sha).toBe('s2');
  expect(puts[2]!.body.branch).toMatch(/^pwo\//);
  expect(puts[2]!.body.sha).toBe('s3');
  await expect(page.locator('.doc-source')).toContainText('me/notes · pwo/');
  // The browser logs the (expected) 409 response itself.
  expect(errors.filter((e) => !e.includes('409'))).toEqual([]);
});

test('opens a repository as a folder, each change being a commit (FOLDER-007)', async ({ page }) => {
  // A repository in memory behind the GitHub API: files by path, commits applied to them.
  const files = new Map<string, string>([['README.md', '# Notes\n'], ['docs/plan.md', '# Plan\n']]);
  const blobs = new Map<string, string>();
  const sha = (text: string) => `b${Buffer.from(text).toString('hex').slice(0, 12)}${text.length}`;
  const commits: string[] = [];
  let head = 'c0';
  await page.addInitScript(() => {
    localStorage.setItem('pwo.git.accounts', JSON.stringify([{ id: 'gh1', provider: 'github', apiUrl: 'https://api.github.com', token: 'ghp_x', label: 'me' }]));
  });
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const body = () => JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
    if (p === '/user/repos') return json([{ full_name: 'me/notes', default_branch: 'main' }]);
    if (p === '/repos/me/notes/branches') return json([{ name: 'main' }]);
    if (p === '/repos/me/notes/git/trees/main') {
      const dirs = new Set<string>();
      for (const f of files.keys()) f.split('/').slice(0, -1).forEach((_, i, a) => dirs.add(a.slice(0, i + 1).join('/')));
      return json({ tree: [...[...dirs].map((d) => ({ path: d, type: 'tree', sha: `t-${d}` })), ...[...files].map(([path, text]) => ({ path, type: 'blob', sha: sha(text), size: text.length }))], truncated: false });
    }
    if (p.startsWith('/repos/me/notes/contents/')) {
      const path = decodeURIComponent(p.slice('/repos/me/notes/contents/'.length));
      const text = files.get(path);
      return text === undefined ? json({ message: 'Not Found' }, 404) : json({ type: 'file', sha: sha(text), content: b64(text), encoding: 'base64' });
    }
    if (p === '/repos/me/notes/git/ref/heads/main') return json({ object: { sha: head } });
    if (p.startsWith('/repos/me/notes/git/commits/') && req.method() === 'GET') return json({ tree: { sha: `tree-${head}` } });
    if (p === '/repos/me/notes/git/blobs') {
      const text = Buffer.from(String(body().content), 'base64').toString();
      blobs.set(sha(text), text);
      return json({ sha: sha(text) }, 201);
    }
    if (p === '/repos/me/notes/git/trees' && req.method() === 'POST') {
      for (const e of body().tree as { path: string; sha: string | null }[]) {
        if (e.sha === null) files.delete(e.path);
        else files.set(e.path, blobs.get(e.sha) ?? [...files.values()].find((t) => sha(t) === e.sha) ?? '');
      }
      return json({ sha: 'newtree' }, 201);
    }
    if (p === '/repos/me/notes/git/commits') {
      commits.push(String(body().message));
      return json({ sha: `c${commits.length}` }, 201);
    }
    if (p === '/repos/me/notes/git/refs/heads/main') {
      head = String(body().sha);
      return json({});
    }
    return json({ message: 'Not Found' }, 404);
  });
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const where = page.getByRole('dialog', { name: 'Open a folder' });
  await where.getByLabel('⎇ me (GitHub)').check();
  await where.getByRole('button', { name: 'Open' }).click();
  const pick = page.getByRole('dialog', { name: 'Open a repository' });
  await pick.getByLabel('me/notes').check();
  await pick.getByRole('button', { name: 'Open' }).click();
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 me/notes (main)' })).toBeVisible();
  await expect(panel.locator('.fs-tree > .fs-list > li > .fs-entry')).toHaveText(['docs', 'README.md']);

  // Saving a document of the repository is a commit.
  await panel.getByRole('button', { name: 'README.md' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Notes');
  await page.locator('.doc-page h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' and plans');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => files.get('README.md')).toContain('# Notes and plans\n');
  expect(commits).toEqual(['docs: update README.md']);

  // Renaming in the explorer is a commit too.
  await panel.getByRole('button', { name: 'docs' }).click();
  await panel.getByRole('button', { name: 'plan.md' }).click({ button: 'right' });
  page.once('dialog', (d) => void d.accept('roadmap.md'));
  await page.getByRole('menu').getByRole('menuitem', { name: 'Rename (F2)' }).click();
  await expect.poll(() => [...files.keys()].sort()).toEqual(['README.md', 'docs/roadmap.md']);
  expect(commits.at(-1)).toBe('docs: rename docs/plan.md to docs/roadmap.md');
  expect(errors).toEqual([]);
});

test('starts a branch of a repository opened as a folder and proposes its changes (FOLDER-022)', async ({ page }) => {
  const files = new Map<string, string>([['README.md', '# Notes\n']]);
  const branches = new Map<string, string>([['main', 'c0']]);
  const pulls: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('pwo.git.accounts', JSON.stringify([{ id: 'gh1', provider: 'github', apiUrl: 'https://api.github.com', token: 'ghp_x', label: 'me' }]));
  });
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const body = () => JSON.parse(req.postData() ?? '{}') as Record<string, string>;
    if (p === '/user/repos') return json([{ full_name: 'me/notes', default_branch: 'main' }]);
    if (p === '/repos/me/notes/branches') return json([...branches.keys()].map((name) => ({ name })));
    if (p.startsWith('/repos/me/notes/git/trees/')) return json({ tree: [...files].map(([path, text]) => ({ path, type: 'blob', sha: `s${text.length}`, size: text.length })), truncated: false });
    if (p.startsWith('/repos/me/notes/git/ref/heads/')) return json({ object: { sha: branches.get(decodeURIComponent(p.slice('/repos/me/notes/git/ref/heads/'.length))) } });
    if (p === '/repos/me/notes/git/refs' && req.method() === 'POST') {
      branches.set(body().ref!.replace('refs/heads/', ''), body().sha!);
      return json({}, 201);
    }
    if (p === '/repos/me/notes/pulls' && req.method() === 'POST') {
      pulls.push(body());
      return json({ number: 7, html_url: 'https://github.com/me/notes/pull/7' }, 201);
    }
    return json({ message: 'Not Found' }, 404);
  });
  await page.context().route('https://github.com/**', (route) => route.fulfill({ body: 'PR' }));
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const where = page.getByRole('dialog', { name: 'Open a folder' });
  await where.getByLabel('⎇ me (GitHub)').check();
  await where.getByRole('button', { name: 'Open' }).click();
  const pick = page.getByRole('dialog', { name: 'Open a repository' });
  await pick.getByLabel('me/notes').check();
  await pick.getByRole('button', { name: 'Open' }).click();
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 me/notes (main)' })).toBeVisible();

  // A new branch, started from main; the folder is now that branch.
  await panel.getByRole('button', { name: 'Branches and pull requests' }).click();
  const menu = page.getByRole('dialog', { name: 'Branches and pull requests' });
  await expect(menu.getByLabel(/Propose the changes/)).toHaveCount(0);
  await menu.getByLabel('Work on a new branch…').check();
  page.once('dialog', (d) => void d.accept('draft'));
  await menu.getByRole('button', { name: 'Continue' }).click();
  await expect(panel.getByRole('heading', { name: '📁 me/notes (draft)' })).toBeVisible();
  expect(branches.get('draft')).toBe('c0');

  // Propose its changes to main.
  await panel.getByRole('button', { name: 'Branches and pull requests' }).click();
  await menu.getByLabel('Propose the changes to main (pull request)…').check();
  const popup = page.waitForEvent('popup');
  page.once('dialog', (d) => void d.accept('Plan of the thesis'));
  await menu.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Request #7 opened');
  expect(pulls).toEqual([{ head: 'draft', base: 'main', title: 'Plan of the thesis', body: '' }]);
  const opened = await popup;
  await opened.waitForLoadState();
  expect(opened.url()).toBe('https://github.com/me/notes/pull/7');
  await opened.close();

  // Back to main.
  await panel.getByRole('button', { name: 'Branches and pull requests' }).click();
  await menu.getByLabel('Open another branch').check();
  await menu.getByRole('button', { name: 'Continue' }).click();
  const choose = page.getByRole('dialog', { name: 'Open another branch' });
  await choose.getByLabel('main').check();
  await choose.getByRole('button', { name: 'Open' }).click();
  await expect(panel.getByRole('heading', { name: '📁 me/notes (main)' })).toBeVisible();
  expect(errors).toEqual([]);
});
