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
