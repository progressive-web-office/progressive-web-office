import { expect, test, type Page, type Route } from '@playwright/test';
import { openApp, saveAs } from './helpers';

const API = 'https://api.github.com';
const b64 = (s: string) => Buffer.from(s).toString('base64');

/** A GitHub repository me/notes holding notes.md; the commits are kept. */
async function mockGitHub(page: Page): Promise<{ body: Record<string, string> }[]> {
  const puts: { body: Record<string, string> }[] = [];
  let sha = 's1';
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const p = url.pathname;
    const repo = { full_name: 'me/notes', default_branch: 'main', private: true };
    if (req.method() === 'GET' && p === '/user/repos') return json([repo]);
    if (req.method() === 'GET' && p === '/repos/me/notes') return json(repo);
    if (req.method() === 'GET' && p === '/repos/me/notes/branches') return json([{ name: 'main' }]);
    if (req.method() === 'GET' && p === '/repos/me/notes/contents') return json([{ name: 'notes.md', path: 'notes.md', type: 'file', size: 8 }]);
    if (req.method() === 'GET' && p === '/repos/me/notes/contents/notes.md') return json({ type: 'file', sha, content: b64('# Notes\n'), encoding: 'base64' });
    if (req.method() === 'GET' && p.startsWith('/repos/me/notes/git/trees/')) return json({ tree: [{ path: 'notes.md', type: 'blob', sha, size: 8 }], truncated: false });
    if (req.method() === 'PUT' && p === '/repos/me/notes/contents/notes.md') {
      puts.push({ body: JSON.parse(req.postData() ?? '{}') as Record<string, string> });
      sha = `s${puts.length + 1}`;
      return json({ content: { sha }, commit: { sha: 'c1' } });
    }
    return json({ message: 'Not Found' }, 404);
  });
  return puts;
}

async function openNotes(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open from repository…' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Open from repository' });
  await dialog.getByRole('button', { name: 'Add account' }).click();
  await dialog.getByLabel('Personal access token').fill('ghp_test');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await dialog.getByLabel('Repository', { exact: true }).selectOption({ label: 'me/notes' });
  await dialog.getByRole('button', { name: '📄 notes.md' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Notes');
}

async function commit(page: Page): Promise<void> {
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('dialog', { name: 'Commit to the repository' }).getByRole('button', { name: 'Commit' }).click();
  await expect(page.getByRole('alert')).toContainText('Committed notes.md to main.');
}

test('remembers the repositories used, opened again from the start screen or forgotten (FILE-028)', async ({ page }) => {
  const errors = await openApp(page);
  await mockGitHub(page);
  await openNotes(page);
  await page.reload();
  const places = page.getByRole('region', { name: 'Repositories and servers used' });
  await expect(places.getByRole('button', { name: '⎇ me/notes · main' })).toBeVisible();
  // Opened again at once, in the repository.
  await places.getByRole('button', { name: '⎇ me/notes · main' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open from repository' });
  await expect(dialog.getByRole('button', { name: '📄 notes.md' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  // Forgotten.
  await places.getByRole('button', { name: 'Forget me/notes · main' }).click();
  await expect(places).toBeHidden();
  expect(errors).toEqual([]);
});

test('a document keeps where it comes from: reopened from the recent files or a copy, Save commits it back (FILE-029)', async ({ page }) => {
  const errors = await openApp(page);
  const puts = await mockGitHub(page);
  await openNotes(page);
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('One');
  await commit(page);

  // A Markdown file of the repository gets no front matter for it: the recent entry keeps it.
  expect(Buffer.from(puts[0]!.body.content!, 'base64').toString()).toBe('# Notes\n\nOne\n');
  // An office copy on disk carries the address in its properties.
  const copy = await saveAs(page, 'OpenDocument text (.odt)');
  const { unzipSync, strFromU8 } = await import('fflate');
  expect(strFromU8(unzipSync(new Uint8Array(copy.data))['meta.xml']!)).toContain('<meta:user-defined meta:name="Source">https://github.com/me/notes/blob/main/notes.md</meta:user-defined>');

  // From the recent files, after a reload: tied to the repository again.
  await page.reload();
  await page.getByRole('button', { name: /notes\.md/ }).filter({ hasText: '⎇ me/notes' }).first().click();
  await expect(page.getByRole('alert')).toContainText('This document comes from me/notes · main');
  await expect(page.locator('.doc-source')).toContainText('me/notes · main');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' two');
  await commit(page);
  expect(puts[1]!.body).toMatchObject({ branch: 'main', sha: 's2' });

  // Detached: Save no longer goes to the repository.
  await page.reload();
  await page.getByRole('button', { name: /notes\.md/ }).filter({ hasText: '⎇ me/notes' }).first().click();
  await expect(page.locator('.doc-source')).toContainText('me/notes · main');
  await page.getByRole('button', { name: 'Detach' }).click();
  await expect(page.locator('.doc-source')).toHaveCount(0);
  expect(errors).toEqual([]);
});
