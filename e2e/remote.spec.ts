import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';

const FILE = 'https://files.example.org/course/Plan%20du%20cours.md';
const V1 = '# Course plan\n\nWeek 1: control loops.\n';

test('opens a document of a server read-only from a link, checking its version (SHARE-011)', async ({ page }) => {
  let body = V1;
  await page.route('https://files.example.org/**', (route) => route.fulfill({ body, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/markdown' } }));
  await page.goto('./');

  // Make the link from the dialog.
  await page.getByRole('button', { name: 'Link to a file on a server' }).click();
  const dialog = page.getByRole('dialog', { name: 'Link to a file on a server' });
  await dialog.getByLabel('Address of the document').fill(FILE);
  await dialog.getByRole('button', { name: 'Create the link' }).click();
  await expect(dialog.getByText('“Plan du cours.md”')).toBeVisible();
  const link = await dialog.getByLabel('Link to the document').inputValue();
  const sha = createHash('sha256').update(V1).digest('hex');
  expect(link).toContain(`#url=${encodeURIComponent(FILE)}&sha256=${sha}`);

  // Opening it shows the document read-only.
  await page.goto(link);
  await expect(page.locator('.doc-page h1')).toHaveText('Course plan');
  await expect(page.getByRole('status').filter({ hasText: 'comes from a place that cannot be written' })).toBeVisible();
  await expect(page.locator('.doc-name')).toHaveText('Plan du cours.md');

  // A changed file is refused.
  body = `${V1}Week 2: tuning.\n`;
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('has changed since the link was made');
});
